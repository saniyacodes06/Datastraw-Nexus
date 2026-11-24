// N-1 stress test (the "contingency analysis" power grids run): for every working person-day,
// ask "if this person calls in sick, does any brand-process drop below its minimum, and can
// the people already on the roster absorb it?" Pure function: roster in, risk map out.
import type { Coverage, Roster } from "./engine";

/** SAFE: nothing drops. ABSORB: a colleague already working can pick it up.
 *  SWAP: only someone on a weekly off / holiday could cover. BREAK: nobody assigned can. */
export type Risk = "SAFE" | "ABSORB" | "SWAP" | "BREAK";
export const RANK: Record<Risk, number> = { SAFE: 0, ABSORB: 1, SWAP: 2, BREAK: 3 };

type Asg = { employeeId: string; bpId: string; role: string };
export type Input = {
  roster: Roster;
  coverage: Coverage;
  assignments: Asg[];
  brandOf: (bp: string) => string;
  maxBackup: (emp: string) => number;
};
export type Hit = { bp: string; risk: Risk };
export type Cell = { risk: Risk; hits: Hit[] } | null; // null = not working that day

/** Can `e` take over `bp` on day `i` without breaking their backup limit (same rule as the engine)? */
function canAbsorb(x: Input, e: string, bp: string, i: number) {
  const mine = x.assignments.filter((a) => a.employeeId === e);
  const role = mine.find((a) => a.bpId === bp)?.role;
  if (!role) return false;
  if (role === "PRIMARY") return true;
  const backups = new Set(mine.filter((a) => a.role === "BACKUP").map((a) => a.bpId));
  const used = new Set(x.roster.entries[e][i].covers.filter((b) => backups.has(b)).map(x.brandOf));
  return used.has(x.brandOf(bp)) || used.size < x.maxBackup(e);
}

/** What happens to bp on day i if `absent` disappears. */
function impact(x: Input, absent: string, bp: string, i: number): Risk {
  const [have, need] = x.coverage[bp]?.[i] ?? [0, 0];
  if (have - 1 >= need) return "SAFE";
  const others = x.assignments.filter((a) => a.bpId === bp && a.employeeId !== absent).map((a) => a.employeeId);
  const cellOf = (e: string) => x.roster.entries[e]?.[i];
  // Covering already counted in `have`, so only people NOT covering bp can add a body.
  const free = others.filter((e) => !cellOf(e)?.covers.includes(bp));
  if (free.some((e) => cellOf(e)?.status === "WORK" && canAbsorb(x, e, bp, i))) return "ABSORB";
  if (free.some((e) => ["WEEK_OFF", "HOLIDAY"].includes(cellOf(e)?.status ?? ""))) return "SWAP";
  return "BREAK";
}

export function stressTest(x: Input) {
  const grid: Record<string, Cell[]> = {};
  for (const [e, row] of Object.entries(x.roster.entries)) {
    grid[e] = row.map((c, i) => {
      if (c.status !== "WORK") return null;
      const hits = c.covers.map((bp) => ({ bp, risk: impact(x, e, bp, i) })).filter((h) => h.risk !== "SAFE");
      const risk = hits.reduce<Risk>((w, h) => (RANK[h.risk] > RANK[w] ? h.risk : w), "SAFE");
      return { risk, hits };
    });
  }
  const cells = Object.values(grid).flat().filter((c): c is NonNullable<Cell> => !!c);
  const count = (r: Risk) => cells.filter((c) => c.risk === r).length;
  // Who is the single point of failure: most BREAK days, then SWAP days.
  const people = Object.entries(grid).map(([e, row]) => {
    const live = row.filter((c): c is NonNullable<Cell> => !!c);
    const brk = live.filter((c) => c.risk === "BREAK");
    return {
      employee: e,
      breaks: brk.length,
      swaps: live.filter((c) => c.risk === "SWAP").length,
      bps: [...new Set(brk.flatMap((c) => c.hits.filter((h) => h.risk === "BREAK").map((h) => h.bp)))],
    };
  }).filter((p) => p.breaks + p.swaps > 0).sort((a, b) => b.breaks - a.breaks || b.swaps - a.swaps);
  // Brand-processes with no fallback at all on some days.
  const fragile = new Map<string, number>();
  for (const c of cells) for (const h of c.hits) if (h.risk === "BREAK") fragile.set(h.bp, (fragile.get(h.bp) ?? 0) + 1);
  return {
    grid,
    total: cells.length,
    counts: { SAFE: count("SAFE"), ABSORB: count("ABSORB"), SWAP: count("SWAP"), BREAK: count("BREAK") },
    /** % of working person-days where one sick call is handled without calling anyone in. */
    score: cells.length ? Math.round((100 * (count("SAFE") + count("ABSORB"))) / cells.length) : 100,
    people,
    fragile: [...fragile.entries()].sort((a, b) => b[1] - a[1]),
  };
}
