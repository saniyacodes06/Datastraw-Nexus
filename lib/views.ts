// Turns a saved roster into grid sections for the 5 views. Pure functions: no database, easy to reuse.
import { CALENDARS, type Directory } from "./data";
import type { Coverage, Roster } from "./engine";

export type Tone = "work" | "backup" | "off" | "leave" | "holiday" | "ok" | "gap" | "closed" | "none";
export type GridCell = { text: string; tone: Tone; title: string; changed?: boolean };
export type GridRow = { key: string; label: string; sub?: string; href?: string; cells: GridCell[] };
export type Section = { title: string; rows: GridRow[] };
export const VIEWS = ["company", "pod", "brand", "process", "employee"] as const;
export type View = (typeof VIEWS)[number];

const STATUS: Record<string, [string, Tone]> = {
  WEEK_OFF: ["WO", "off"], LEAVE: ["L", "leave"], COMP_OFF: ["CO", "leave"], HOLIDAY: ["H", "holiday"],
};

/** `changed` holds "E05|2026-12-18" keys of cells edited in this version. */
function employeeRow(id: string, r: Roster, dir: Directory, changed: Set<string>, sub?: string): GridRow {
  const e = dir.emp.get(id);
  const row = r.entries[id];
  const backups = new Set(dir.assignments.filter((a) => a.employeeId === id && a.role === "BACKUP").map((a) => a.bpId));
  return {
    key: id, label: e?.name ?? id, sub: sub ?? e?.role, href: `?view=employee&id=${id}`,
    cells: r.days.map((d, i) => ({ ...cell(d, i), changed: changed.has(`${id}|${d}`) })),
  };
  function cell(d: string, i: number): GridCell {
      const c = row?.[i];
      if (!c) return { text: "—", tone: "none", title: "Not in this roster (added after it was generated)" };
      if (c.status !== "WORK") return { text: STATUS[c.status][0], tone: STATUS[c.status][1], title: `${d}: ${c.status}` };
      const extra = c.covers.some((b) => backups.has(b));
      return { text: extra ? "W+" : "W", tone: extra ? "backup" : "work", title: `${d}: works on ${c.covers.map(dir.bpLabel).join(", ") || "pod duties"}` };
  }
}

function coverageRow(bp: string, cov: Coverage, r: Roster, dir: Directory): GridRow {
  const p = dir.bp.get(bp);
  return {
    key: bp, label: dir.bpLabel(bp), sub: p && CALENDARS[p.calendar as keyof typeof CALENDARS],
    cells: (cov[bp] ?? r.days.map(() => [0, 0])).map(([have, need], i) => need === 0
      ? { text: "·", tone: "closed", title: `${r.days[i]}: closed` }
      : { text: `${have}/${need}`, tone: have < need ? "gap" : "ok", title: `${r.days[i]}: ${have} of ${need} needed` }),
  };
}

const staffOf = (bpIds: Set<string>, dir: Directory) => {
  const roles = new Map<string, string[]>();
  for (const a of dir.assignments) if (bpIds.has(a.bpId)) {
    const tag = `${a.role === "BACKUP" ? "backup " : ""}${dir.bp.get(a.bpId)?.process}`;
    roles.set(a.employeeId, [...(roles.get(a.employeeId) ?? []), tag]);
  }
  return [...roles.entries()].sort(([, a], [, b]) => Number(a[0].startsWith("backup")) - Number(b[0].startsWith("backup")));
};

/** Sections + the choices for the "which one" picker of a view. */
export function buildView(view: View, id: string | undefined, r: Roster, cov: Coverage, dir: Directory, changed: { employee: string; date: string }[] = []) {
  const edited = new Set(changed.map((c) => `${c.employee}|${c.date}`));
  const person = (e: string, sub?: string) => employeeRow(e, r, dir, edited, sub);
  const active = dir.employees.filter((e) => e.active);
  const options: Record<View, { value: string; label: string }[]> = {
    company: [],
    pod: dir.pods.map((p) => ({ value: p.id, label: p.name })),
    brand: dir.brands.map((b) => ({ value: b.id, label: b.name })),
    process: [...new Set(dir.bps.map((b) => b.process))].map((p) => ({ value: p, label: p })),
    employee: active.map((e) => ({ value: e.id, label: e.name })),
  };
  const pick = id && options[view].some((o) => o.value === id) ? id : options[view][0]?.value;
  const withStaff = (title: string, bpIds: string[]): Section[] => [
    { title: `${title}: coverage (have / need)`, rows: bpIds.map((b) => coverageRow(b, cov, r, dir)) },
    { title: "Assigned people", rows: staffOf(new Set(bpIds), dir).map(([e, tags]) => person(e, tags.join(", "))) },
  ];

  let sections: Section[] = [];
  if (view === "company") {
    const gaps = r.days.map((d, i) => {
      const short = Object.entries(cov).filter(([, days]) => days[i][0] < days[i][1]).map(([b]) => dir.bpLabel(b));
      return { text: String(short.length || "✓"), tone: (short.length ? "gap" : "ok") as Tone, title: short.length ? `${d} gaps: ${short.join(", ")}` : `${d}: all covered` };
    });
    sections = [{ title: "Brand-processes short each day", rows: [{ key: "gaps", label: "Coverage gaps", cells: gaps }] },
      ...dir.pods.map((p) => ({ title: `${p.name} · lead ${dir.emp.get(p.leadId ?? "")?.name ?? "—"}`, rows: active.filter((e) => e.podId === p.id).map((e) => person(e.id)) }))];
  } else if (view === "pod" && pick) {
    const brandIds = new Set(dir.brands.filter((b) => b.podId === pick).map((b) => b.id));
    sections = [
      { title: "Team", rows: active.filter((e) => e.podId === pick).map((e) => person(e.id)) },
      { title: "Pod brands: coverage (have / need)", rows: dir.bps.filter((b) => brandIds.has(b.brandId)).map((b) => coverageRow(b.id, cov, r, dir)) },
    ];
  } else if (view === "brand" && pick) {
    sections = withStaff(dir.brand.get(pick)?.name ?? pick, dir.bps.filter((b) => b.brandId === pick).map((b) => b.id));
  } else if (view === "process" && pick) {
    sections = withStaff(pick, dir.bps.filter((b) => b.process === pick).map((b) => b.id));
  } else if (view === "employee" && pick) {
    const mine = dir.assignments.filter((a) => a.employeeId === pick).map((a) => a.bpId);
    sections = [{ title: "Schedule", rows: [person(pick)] },
      { title: "Their brand-processes: coverage (have / need)", rows: mine.map((b) => coverageRow(b, cov, r, dir)) }];
  }
  return { sections, options: options[view], pick };
}

/** Counts for the employee summary card. */
export function employeeSummary(id: string, r: Roster) {
  const row = r.entries[id] ?? [];
  const count = (s: string) => row.filter((c) => c.status === s).length;
  return { work: count("WORK"), weekOff: count("WEEK_OFF"), leave: count("LEAVE") + count("COMP_OFF"), holiday: count("HOLIDAY"),
    compOffEarned: r.comp_offs_earned.filter((c) => c.employee === id).map((c) => c.date) };
}
