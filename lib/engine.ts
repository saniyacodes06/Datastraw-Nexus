// Bridge between the database and the Python engine. Every roster action goes through here.
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { assignments, brandProcesses, brands, db, employees, holidays, leaves, rosters } from "@/db";

export type Cell = { status: "WORK" | "WEEK_OFF" | "LEAVE" | "COMP_OFF" | "HOLIDAY"; covers: string[] };
export type Roster = { year: number; month: number; days: string[]; entries: Record<string, Cell[]>; comp_offs_earned: { employee: string; date: string }[]; shortage_units: number; optimal: boolean };
export type Issue = { type: string; severity: "CRITICAL" | "WARNING"; date: string | null; employee: string | null; bp: string | null; message: string; suggestions?: string[] };

const pad = (n: number) => String(n).padStart(2, "0");
export const monthRange = (year: number, month: number) => {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(last)}`] as const;
};

/** Read everything the engine needs for one month from the database, in the engine's JSON shape. */
export async function loadEngineInput(year: number, month: number) {
  const [from, to] = monthRange(year, month);
  const [emps, bps, asg, hols, lvs, prev] = await Promise.all([
    db.select().from(employees).where(eq(employees.active, true)),
    db.select({ bp: brandProcesses, brand: brands.name, pod: brands.podId })
      .from(brandProcesses).innerJoin(brands, eq(brandProcesses.brandId, brands.id)),
    db.select().from(assignments),
    db.select().from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to))),
    db.select().from(leaves).where(and(eq(leaves.status, "APPROVED"), gte(leaves.date, from), lte(leaves.date, to))),
    latestRoster(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1),
  ]);
  const active = new Set(emps.map((e) => e.id));
  return {
    year, month,
    employees: emps.map((e) => ({
      id: e.id, name: e.name, pod: e.podId, role: e.role,
      preferred_off: e.preferredOff, max_consecutive: e.maxConsecutive, max_backup: e.maxBackup,
    })),
    brand_processes: bps.map(({ bp, brand, pod }) => ({
      id: bp.id, brand, process: bp.process, pod, calendar: bp.calendar,
      min_staff: bp.minStaff, min_by_weekday: bp.minByWeekday,
    })),
    assignments: asg.filter((a) => active.has(a.employeeId)).map((a) => ({ employee: a.employeeId, bp: a.bpId, role: a.role })),
    holidays: hols.map((h) => h.date),
    leaves: lvs.filter((l) => active.has(l.employeeId)).map((l) => ({ employee: l.employeeId, date: l.date, type: l.type })),
    prev_tail: prev ? trailingWorkDays(prev.data as Roster) : {},
  };
}

/** Days each person worked in a row at the end of a roster (so the 6-day rule carries across months). */
function trailingWorkDays(r: Roster) {
  return Object.fromEntries(Object.entries(r.entries).map(([e, row]) => {
    let n = 0;
    for (let i = row.length - 1; i >= 0 && row[i].status === "WORK"; i--) n++;
    return [e, n];
  }));
}

export async function latestRoster(year: number, month: number) {
  const [row] = await db.select().from(rosters)
    .where(and(eq(rosters.year, year), eq(rosters.month, month)))
    .orderBy(desc(rosters.version)).limit(1);
  return row ?? null;
}

/** POST to the Python engine. ENGINE_URL defaults to the local dev server. */
export async function callEngine<T>(path: "/generate" | "/validate" | "/regenerate", body: object): Promise<T> {
  const res = await fetch(`${process.env.ENGINE_URL ?? "http://127.0.0.1:8000"}${path}`, {
    method: "POST", body: JSON.stringify(body), cache: "no-store",
    headers: { "content-type": "application/json", ...(process.env.ENGINE_KEY && { "x-engine-key": process.env.ENGINE_KEY }) },
  });
  if (!res.ok) throw new Error(`Engine ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export type Coverage = Record<string, [number, number][]>; // bp -> per day [have, need]
export type EngineReport = { roster: Roster; issues: Issue[]; coverage: Coverage };
export type Change = { employee: string; date: string; before: Cell | null; after: Cell };

/** Save engine output as the next version for that month (always DRAFT; publishing is a human step). */
export async function saveRoster(out: EngineReport, note?: string, changes: Change[] = []) {
  const { year, month } = out.roster;
  const prev = await latestRoster(year, month);
  const [row] = await db.insert(rosters).values({
    year, month, version: (prev?.version ?? 0) + 1, status: "DRAFT",
    data: out.roster, issues: out.issues, coverage: out.coverage, changes, note,
  }).returning();
  return row;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Something changed (leave, rules, people): re-solve the latest roster with minimal change. Past days stay locked. */
export async function replanMonth(year: number, month: number, note: string) {
  const latest = await latestRoster(year, month);
  if (!latest) return null; // nothing generated yet: the next Generate will include the change
  const out = await callEngine<EngineReport & { diff: Change[] }>("/regenerate", {
    data: await loadEngineInput(year, month), roster: latest.data, freeze_before: today(),
  });
  return saveRoster(out, note, out.diff);
}

/** A manager edited cells by hand: keep the edit, re-check every rule, save as a new version. */
export async function recheckEdit(roster: Roster, note: string, changes: Change[]) {
  const out = await callEngine<Omit<EngineReport, "roster">>("/validate", {
    data: await loadEngineInput(roster.year, roster.month), roster,
  });
  return saveRoster({ roster, ...out }, note, changes);
}
