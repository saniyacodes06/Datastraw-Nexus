// Self-check for the N-1 stress test. No database. Run: npm run check:resilience
import { strict as assert } from "node:assert";
import { stressTest } from "../lib/resilience";

const W = (...covers: string[]) => ({ status: "WORK" as const, covers });
const OFF = { status: "WEEK_OFF" as const, covers: [] };
const out = stressTest({
  roster: {
    year: 2026, month: 12, days: ["2026-12-01", "2026-12-02"], comp_offs_earned: [], shortage_units: 0, optimal: true,
    entries: {
      E1: [W("a"), W("a")],   // owns a; E2 backs it up
      E2: [W("c"), OFF],      // works day 0, off day 1
      E3: [W("b"), W("b")],   // owns b alone
      E4: [W("g"), OFF],      // g needs 1, both cover day 0
      E5: [W("g"), W("g")],
    },
  },
  coverage: { a: [[1, 1], [1, 1]], b: [[1, 1], [1, 1]], c: [[1, 1], [0, 0]], g: [[2, 1], [1, 1]] },
  assignments: [
    { employeeId: "E1", bpId: "a", role: "PRIMARY" }, { employeeId: "E2", bpId: "a", role: "BACKUP" },
    { employeeId: "E2", bpId: "c", role: "PRIMARY" }, { employeeId: "E3", bpId: "b", role: "PRIMARY" },
    { employeeId: "E4", bpId: "g", role: "PRIMARY" }, { employeeId: "E5", bpId: "g", role: "PRIMARY" },
  ],
  brandOf: (bp) => bp.toUpperCase(),
  maxBackup: () => 1,
});

const risk = (e: string, i: number) => out.grid[e][i]?.risk ?? "OFF";
assert.equal(risk("E1", 0), "ABSORB"); // E2 is working and has backup room
assert.equal(risk("E1", 1), "SWAP");   // E2 is on weekly off
assert.equal(risk("E3", 0), "BREAK");  // nobody else on b
assert.equal(risk("E4", 0), "SAFE");   // E5 still covers g
assert.equal(risk("E5", 1), "SWAP");   // E4 shares g and is on weekly off
assert.equal(risk("E2", 1), "OFF");    // not working, not tested
assert.deepEqual(out.people[0], { employee: "E3", breaks: 2, swaps: 0, bps: ["b"] });
assert.equal(risk("E2", 0), "BREAK");  // E2 owns c alone
assert.equal(out.score, 38);           // 3 of 8 working days need no call-in (SAFE or ABSORB)
console.log("ok", out.score, out.counts);
