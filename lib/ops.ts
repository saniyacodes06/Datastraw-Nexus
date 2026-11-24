// Roster operations shared by buttons (app/actions.ts) and the assistant's confirmed proposals.
// Callers must check permissions first (requireManager).
import { and, eq } from "drizzle-orm";
import { db, employees, leaves } from "@/db";
import { audit, notify, type Session } from "./auth";
import { callEngine, latestRoster, loadEngineInput, recheckEdit, replanMonth, saveRoster, type EngineReport, type Roster } from "./engine";

export const monthName = (y: number, m: number) => new Date(Date.UTC(y, m - 1)).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLink = (y: number, m: number) => `/roster?month=${y}-${String(m).padStart(2, "0")}`;

/** Fresh roster for a month, saved as a new DRAFT version. */
export async function generateMonth(s: Session, y: number, m: number) {
  const out = await callEngine<EngineReport>("/generate", { data: await loadEngineInput(y, m) });
  const row = await saveRoster(out, "Generated");
  await audit(s, "Generated roster", `${monthName(y, m)} v${row.version}`);
  return row;
}

/** Approve/reject a PENDING leave request (batch), or cancel an APPROVED one.
 *  Approve and cancel both change who is available, so each affected month is re-planned with minimal change. */
export async function decideLeaveBatch(s: Session, batch: string, decision: "APPROVED" | "REJECTED" | "CANCELLED") {
  const which = batch.startsWith("single-") ? eq(leaves.id, Number(batch.slice(7))) : eq(leaves.batch, batch);
  // Only rows in the expected state: a stale button or a re-confirmed assistant proposal must not flip a decided leave.
  const from = decision === "CANCELLED" ? "APPROVED" : "PENDING";
  const rows = await db.update(leaves).set({ status: decision }).where(and(which, eq(leaves.status, from))).returning();
  if (!rows.length) throw new Error(`No ${from.toLowerCase()} leave request found (it may already be decided)`);
  const [e] = await db.select().from(employees).where(eq(employees.id, rows[0].employeeId));
  const dates = rows.map((r) => r.date.slice(5)).join(", ");
  const verb = { APPROVED: "approved", REJECTED: "rejected", CANCELLED: "cancelled" }[decision];
  if (decision !== "REJECTED") {
    for (const ym of new Set(rows.map((r) => r.date.slice(0, 7)))) {
      const [y, m] = ym.split("-").map(Number);
      try {
        const row = await replanMonth(y, m, `Leave ${verb}: ${e?.name ?? rows[0].employeeId} (${dates})`);
        const critical = row ? (row.issues as { severity: string }[]).filter((i) => i.severity === "CRITICAL").length : 0;
        if (row && critical) await notify("MANAGER", `${monthName(y, m)} v${row.version} has ${critical} critical conflict(s) after re-planning`, monthLink(y, m));
      } catch (err) {
        // The leave decision is already saved; never leave the manager unaware that the roster is now out of date.
        await notify("MANAGER", `${monthName(y, m)} roster was NOT re-planned after leave ${verb} (${(err as Error).message}). Press Re-plan on the Roster page.`, monthLink(y, m));
      }
    }
  }
  await notify(rows[0].employeeId, `Your leave (${dates}) was ${verb}`, "/leaves");
  await audit(s, `Leave ${verb}`, `${e?.name}: ${dates}`);
  return { employee: e?.name, dates };
}

/** Swap a weekly off to another day in the latest roster; the validator reports the impact. */
export async function moveWeekOff(s: Session, employeeId: string, from: string, to: string) {
  const [y, m] = from.split("-").map(Number);
  if (to.slice(0, 7) !== from.slice(0, 7)) throw new Error("Both dates must be in the same month");
  const latest = await latestRoster(y, m);
  if (!latest) throw new Error(`No roster for ${monthName(y, m)} yet`);
  const roster = structuredClone(latest.data as Roster);
  const row = roster.entries[employeeId];
  const [i, j] = [roster.days.indexOf(from), roster.days.indexOf(to)];
  if (!row || i < 0 || j < 0) throw new Error("Employee or date not in this roster");
  if (row[i].status !== "WEEK_OFF") throw new Error(`${from} is not a weekly off (it is ${row[i].status})`);
  if (row[j].status !== "WORK") throw new Error(`${to} is not a working day (it is ${row[j].status})`);
  const primary = (await loadEngineInput(y, m)).assignments.filter((a) => a.employee === employeeId && a.role === "PRIMARY").map((a) => a.bp);
  const changes = [
    { employee: employeeId, date: from, before: row[i], after: { status: "WORK" as const, covers: primary } },
    { employee: employeeId, date: to, before: row[j], after: { status: "WEEK_OFF" as const, covers: [] } },
  ];
  row[i] = changes[0].after;
  row[j] = changes[1].after;
  const note = `Weekly off moved: ${employeeId} ${from} -> ${to}`;
  const saved = await recheckEdit(roster, note, changes);
  await audit(s, "Moved weekly off", note);
  return saved;
}
