// Phase 4 check: approve a leave -> minimal re-plan; manual edit -> validator flags impact. Cleans up after itself.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { db, leaves, rosters } = await import("../db");
  const { and, eq, gt } = await import("drizzle-orm");
  const { latestRoster, recheckEdit, replanMonth } = await import("../lib/engine");
  type R = import("../lib/engine").Roster; type I = import("../lib/engine").Issue;
  const crit = (x: unknown) => (x as I[]).filter((i) => i.severity === "CRITICAL").map((i) => i.message);

  const base = await latestRoster(2026, 12);
  if (!base) throw new Error("Generate December first");

  // 1) Leave approved for Riya (only person on Bloom Botanics) on 21 Dec
  const [lv] = await db.insert(leaves).values({ employeeId: "E05", date: "2026-12-21", status: "APPROVED", batch: "test" }).returning();
  const v2 = (await replanMonth(2026, 12, "TEST leave"))!;
  console.log(`LEAVE  -> v${v2.version}: ${(v2.changes as unknown[]).length} cells changed, critical: ${crit(v2.issues).length}`);
  for (const c of v2.changes as { employee: string; date: string; before: { status: string; covers: string[] }; after: { status: string; covers: string[] } }[])
    console.log(`   ${c.employee} ${c.date}: ${c.before?.status}[${c.before?.covers}] -> ${c.after.status}[${c.after.covers}]`);

  // 2) Manager sets Harsh (only person on Rangoli Home, 365 days) to weekly off on a working day
  const r = structuredClone(v2.data as R);
  const i = r.entries.E20.findIndex((c, k) => c.status === "WORK" && k > 3);
  const before = r.entries.E20[i];
  r.entries.E20[i] = { status: "WEEK_OFF", covers: [] };
  const v3 = await recheckEdit(r, "TEST edit", [{ employee: "E20", date: r.days[i], before, after: r.entries.E20[i] }]);
  console.log(`EDIT   -> v${v3.version}: Harsh ${r.days[i]} WORK -> WEEK_OFF; critical now:`);
  for (const m of crit(v3.issues)) console.log("   " + m);

  // cleanup
  await db.delete(leaves).where(eq(leaves.id, lv.id));
  await db.delete(rosters).where(and(eq(rosters.year, 2026), eq(rosters.month, 12), gt(rosters.version, base.version)));
  console.log("cleaned up");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
