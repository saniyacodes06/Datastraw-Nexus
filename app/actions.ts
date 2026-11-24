"use server";
// Every write in the app. Each action: check who is asking -> validate input (zod) -> write -> log -> refresh.
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assignments, brandProcesses, brands, db, employees, holidays, leaves, rosters } from "@/db";
import { audit, checkCredentials, COOKIE, encodeSession, hashPassword, notify, requireManager, requireSession } from "@/lib/auth";
import { guard } from "@/lib/action";
import { callEngine, latestRoster, loadEngineInput, recheckEdit, replanMonth, type Cell, type EngineReport, type Roster } from "@/lib/engine";
import { decideLeaveBatch, generateMonth, monthName } from "@/lib/ops";

const CAL = z.enum(["365_DAYS", "NO_PUBLIC_HOLIDAYS", "NO_SUN_NO_PH"]);
const MONTH = z.string().regex(/^\d{4}-\d{2}$/);
const optInt = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(6).nullable());
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** FormData -> validated object, with a readable error message. */
function parse<T extends z.ZodType>(schema: T, form: FormData): z.infer<T> {
  const res = schema.safeParse(Object.fromEntries(form));
  if (!res.success) throw new Error(res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return res.data;
}

/** After a new version is saved, show it (drop any old ?v= from the URL, keep month/view/id). */
function showLatest(form: FormData, month: string): never {
  const q = new URLSearchParams({ month });
  for (const k of ["view", "id"]) if (form.get(k)) q.set(k, String(form.get(k)));
  redirect(`/roster?${q}`);
}

// ---------- login ----------
export async function login(form: FormData) {
  return guard(async () => {
    const { email, password } = parse(z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1).max(200) }), form);
    const s = await checkCredentials(email, password);
    if (!s) throw new Error("Wrong email or password.");
    (await cookies()).set(COOKIE, encodeSession(s), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
    redirect(s.role === "MANAGER" ? "/dashboard" : "/roster");
  });
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

/** Mark notifications as seen (stored per browser). */
export async function markNotificationsSeen() {
  await requireSession();
  (await cookies()).set("nexus_seen", new Date().toISOString(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  refresh();
}

// ---------- roster ----------
export async function generateRoster(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { month } = parse(z.object({ month: MONTH }), form);
    const [y, m] = month.split("-").map(Number);
    await generateMonth(s, y, m);
    showLatest(form, month);
  });
}

export async function publishRoster(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { id, reason } = parse(z.object({ id: z.coerce.number().int(), reason: z.string().trim().optional() }), form);
    const [r] = await db.select().from(rosters).where(eq(rosters.id, id));
    if (!r) throw new Error("Roster not found");
    // Rules, leaves, holidays or people may have changed since this version was saved: re-check before publishing.
    const fresh = await callEngine<Omit<EngineReport, "roster">>("/validate", { data: await loadEngineInput(r.year, r.month), roster: r.data });
    await db.update(rosters).set({ issues: fresh.issues, coverage: fresh.coverage }).where(eq(rosters.id, id));
    const critical = fresh.issues.filter((i) => i.severity === "CRITICAL").length;
    if (critical && !reason) throw new Error(`This roster has ${critical} critical conflict(s). Give a reason to publish anyway.`);
    // One transaction: retire the old published version and publish this one together, so a failure
    // can't leave the month with none. The "one PUBLISHED per month" index stops two managers both winning.
    const [[old]] = await db.batch([
      db.update(rosters).set({ status: "SUPERSEDED" })
        .where(and(eq(rosters.year, r.year), eq(rosters.month, r.month), eq(rosters.status, "PUBLISHED"), ne(rosters.id, id))).returning(),
      db.update(rosters).set({ status: "PUBLISHED", note: critical ? `Published with ${critical} critical issue(s): ${reason}` : r.note })
        .where(eq(rosters.id, id)),
    ]);

    const name = monthName(r.year, r.month);
    const link = `/roster?month=${r.year}-${String(r.month).padStart(2, "0")}`;
    if (!old) {
      await notify("ALL", `The ${name} roster is published`, link);
    } else {
      // Re-publish: tell only the people whose days changed.
      const before = (old.data as Roster).entries, after = (r.data as Roster).entries;
      for (const [e, row] of Object.entries(after)) {
        const n = row.filter((c, i) => JSON.stringify(c) !== JSON.stringify(before[e]?.[i])).length;
        if (n) await notify(e, `Your ${name} roster changed on ${n} day(s) (v${r.version})`, link);
      }
    }
    await audit(s, "Published roster", `${name} v${r.version}${critical ? ` with ${critical} critical: ${reason}` : ""}`);
    refresh();
  });
}

/** Manager changes one cell by hand. The edit is kept as-is; the validator reports its impact. */
export async function editCell(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const v = parse(z.object({
      rosterId: z.coerce.number().int(), employee: z.string(), date: z.iso.date(),
      status: z.enum(["WORK", "WEEK_OFF", "LEAVE", "COMP_OFF", "HOLIDAY"]),
    }), form);
    const [row] = await db.select().from(rosters).where(eq(rosters.id, v.rosterId));
    if (!row) throw new Error("Roster not found");
    const latest = await latestRoster(row.year, row.month);
    if (latest && latest.id !== row.id) throw new Error(`You are viewing v${row.version}, but v${latest.version} is newer. Open v${latest.version} to edit, so its changes are not lost.`);
    const roster = structuredClone(row.data as Roster);
    const i = roster.days.indexOf(v.date);
    const cells = roster.entries[v.employee];
    if (i < 0 || !cells) throw new Error("That employee or date is not in this roster");
    const after: Cell = { status: v.status, covers: v.status === "WORK" ? form.getAll("covers").map(String) : [] };
    const before = cells[i];
    cells[i] = after;
    const note = `Manual edit: ${v.employee} ${v.date} ${before.status} -> ${v.status}`;
    await recheckEdit(roster, note, [{ employee: v.employee, date: v.date, before, after }]);
    await audit(s, "Edited roster", note);
    showLatest(form, v.date.slice(0, 7));
  });
}

/** Re-plan the latest roster after rules/people changed, touching as little as possible. */
export async function replan(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { month } = parse(z.object({ month: MONTH }), form);
    const [y, m] = month.split("-").map(Number);
    const row = await replanMonth(y, m, "Re-planned after changes (minimal change)");
    await audit(s, "Re-planned roster", `${monthName(y, m)}${row ? ` v${row.version}, ${(row.changes as unknown[]).length} cells changed` : ""}`);
    showLatest(form, month);
  });
}

// ---------- leaves ----------
export async function requestLeave(form: FormData) {
  return guard(async () => {
    const s = await requireSession();
    const v = parse(z.object({
      employeeId: z.string().min(1), from: z.iso.date(), to: z.iso.date(),
      type: z.enum(["LEAVE", "COMP_OFF"]), reason: z.string().trim().max(200).optional(),
    }), form);
    if (s.role === "EMPLOYEE" && v.employeeId !== s.employeeId) throw new Error("You can only request leave for yourself");
    if (v.to < v.from) throw new Error("'To' date is before 'From' date");
    const days: string[] = [];
    for (let d = new Date(`${v.from}T00:00:00Z`); d.toISOString().slice(0, 10) <= v.to; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
    if (days.length > 31) throw new Error("Request at most 31 days at a time");
    const clash = (await db.select().from(leaves).where(and(eq(leaves.employeeId, v.employeeId), gte(leaves.date, v.from), lte(leaves.date, v.to))))
      .filter((l) => l.status === "PENDING" || l.status === "APPROVED");
    if (clash.length) throw new Error(`Already requested: ${clash.map((l) => `${l.date} (${l.status.toLowerCase()})`).join(", ")}`);
    const batch = crypto.randomUUID();
    await db.insert(leaves).values(days.map((date) => ({ employeeId: v.employeeId, date, type: v.type, reason: v.reason, batch })));
    const [e] = await db.select().from(employees).where(eq(employees.id, v.employeeId));
    await notify("MANAGER", `${e?.name} requested ${v.type === "COMP_OFF" ? "a comp-off" : "leave"}: ${v.from}${v.to !== v.from ? ` to ${v.to}` : ""}`, "/leaves");
    await audit(s, "Requested leave", `${e?.name}: ${v.from} to ${v.to}`);
    refresh();
  });
}

/** Approve/reject a whole request. Approval re-plans every affected month that already has a roster. */
export async function decideLeave(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { batch, decision } = parse(z.object({ batch: z.string(), decision: z.enum(["APPROVED", "REJECTED", "CANCELLED"]) }), form);
    await decideLeaveBatch(s, batch, decision);
    refresh();
  });
}

// ---------- employees ----------
const EmployeeForm = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2),
  email: z.email(),
  podId: z.string().min(1),
  role: z.enum(["Executive", "Pod Lead"]),
  preferredOff: optInt,
  maxConsecutive: z.coerce.number().int().min(1).max(13),
  maxBackup: z.coerce.number().int().min(0).max(5),
  password: z.union([z.literal(""), z.string().min(8, "Password must be at least 8 characters").max(200)]).optional(),
});

export async function saveEmployee(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { id, password, ...fields } = parse(EmployeeForm, form);
    // Blank password on edit = keep the current one. New people need one to be able to sign in.
    if (!id && !password) throw new Error("Set a password (8+ characters) so they can sign in.");
    const v = { ...fields, email: fields.email.toLowerCase(), ...(password ? { passwordHash: await hashPassword(password) } : {}) };
    if (id) {
      await db.update(employees).set(v).where(eq(employees.id, id));
    } else {
      // Numeric max: text max() would rank "E99" above "E100" and reuse an id.
      const ids = await db.select({ id: employees.id }).from(employees);
      const next = `E${String(Math.max(0, ...ids.map((e) => Number(e.id.slice(1)) || 0)) + 1).padStart(2, "0")}`;
      await db.insert(employees).values({ id: next, ...v });
    }
    await audit(s, id ? "Edited employee" : "Added employee", v.name);
    refresh();
  });
}

export async function toggleEmployee(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { id } = parse(z.object({ id: z.string() }), form);
    const [e] = await db.select().from(employees).where(eq(employees.id, id));
    if (!e) throw new Error("Employee not found");
    await db.update(employees).set({ active: !e.active }).where(eq(employees.id, id));
    await audit(s, e.active ? "Deactivated employee" : "Activated employee", e.name);
    refresh();
  });
}

// ---------- brands, processes, assignments ----------
export async function addBrand(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { name, podId } = parse(z.object({ name: z.string().trim().min(2), podId: z.string().min(1) }), form);
    await db.insert(brands).values({ id: slug(name), name, podId });
    await audit(s, "Added brand", name);
    refresh();
  });
}

export async function saveProcess(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const v = parse(z.object({
      brandId: z.string(), process: z.string().trim().toUpperCase().min(2).max(12),
      calendar: CAL, minStaff: z.coerce.number().int().min(0).max(10), sundayMin: optInt,
    }), form);
    const row = {
      id: `${v.brandId}-${slug(v.process)}`, brandId: v.brandId, process: v.process, calendar: v.calendar,
      minStaff: v.minStaff, minByWeekday: (v.sundayMin == null ? {} : { "6": v.sundayMin }) as Record<string, number>,
    };
    await db.insert(brandProcesses).values(row).onConflictDoUpdate({ target: brandProcesses.id, set: row });
    await audit(s, "Saved process rule", `${row.id}: ${v.calendar}, min ${v.minStaff}`);
    refresh();
  });
}

export async function deleteProcess(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { id } = parse(z.object({ id: z.string() }), form);
    await db.delete(brandProcesses).where(eq(brandProcesses.id, id));
    await audit(s, "Removed process", id);
    refresh();
  });
}

export async function addAssignment(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const v = parse(z.object({ employeeId: z.string().min(1), bpId: z.string().min(1), role: z.enum(["PRIMARY", "BACKUP"]) }), form);
    await db.insert(assignments).values(v)
      .onConflictDoUpdate({ target: [assignments.employeeId, assignments.bpId], set: { role: v.role } });
    await audit(s, "Assigned", `${v.employeeId} -> ${v.bpId} (${v.role})`);
    refresh();
  });
}

export async function removeAssignment(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { id } = parse(z.object({ id: z.coerce.number().int() }), form);
    const [a] = await db.delete(assignments).where(eq(assignments.id, id)).returning();
    if (a) await audit(s, "Unassigned", `${a.employeeId} -> ${a.bpId}`);
    refresh();
  });
}

// ---------- holidays ----------
export async function addHoliday(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const v = parse(z.object({ date: z.iso.date(), name: z.string().trim().min(2) }), form);
    await db.insert(holidays).values(v).onConflictDoUpdate({ target: holidays.date, set: { name: v.name } });
    await audit(s, "Added holiday", `${v.date} ${v.name}`);
    refresh();
  });
}

export async function removeHoliday(form: FormData) {
  return guard(async () => {
    const s = await requireManager();
    const { date } = parse(z.object({ date: z.iso.date() }), form);
    await db.delete(holidays).where(eq(holidays.date, date));
    await audit(s, "Removed holiday", date);
    refresh();
  });
}
