// Numbers for the dashboard, computed from a saved roster. Pure functions.
import type { Directory } from "./data";
import type { Coverage, Roster } from "./engine";

/** Share of required person-days that are actually covered (0-100). */
export function coveragePct(cov: Coverage) {
  let need = 0, met = 0;
  for (const days of Object.values(cov)) for (const [h, n] of days) { need += n; met += Math.min(h, n); }
  return need ? Math.round((met / need) * 1000) / 10 : 100;
}

/** Per employee: working days, Sundays off, days spent covering another brand as backup. */
export function perEmployee(r: Roster, dir: Directory) {
  const sundays = r.days.map((d, i) => [d, i] as const).filter(([d]) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0).map(([, i]) => i);
  const backups = new Set(dir.assignments.filter((a) => a.role === "BACKUP").map((a) => `${a.employeeId}|${a.bpId}`));
  return Object.entries(r.entries).map(([id, row]) => ({
    id, name: dir.emp.get(id)?.name ?? id,
    work: row.filter((c) => c.status === "WORK").length,
    sundaysOff: sundays.filter((i) => row[i].status !== "WORK").length,
    backupDays: row.filter((c) => c.covers.some((b) => backups.has(`${id}|${b}`))).length,
  }));
}

/** Who works / who is off / which brand-processes are short on one day. */
export function dayView(r: Roster, cov: Coverage, dir: Directory, day: string) {
  const i = r.days.indexOf(day);
  if (i < 0) return null;
  const working: string[] = [], off: { name: string; why: string }[] = [];
  for (const [id, row] of Object.entries(r.entries)) {
    const name = dir.emp.get(id)?.name ?? id;
    if (row[i].status === "WORK") working.push(name);
    else off.push({ name, why: row[i].status.replace("_", " ").toLowerCase() });
  }
  const gaps = Object.entries(cov).filter(([, d]) => d[i][0] < d[i][1]).map(([b, d]) => `${dir.bpLabel(b)} (${d[i][0]}/${d[i][1]})`);
  return { working, off, gaps };
}
