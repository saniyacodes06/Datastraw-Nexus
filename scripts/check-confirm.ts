// Confirm path without the UI: run the same op a confirmed proposal runs, show the checker result, then clean up.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { db, rosters, auditLog } = await import("../db");
  const { and, eq, gt } = await import("drizzle-orm");
  const { latestRoster } = await import("../lib/engine");
  const { moveWeekOff } = await import("../lib/ops");
  const base = (await latestRoster(2026, 12))!;
  const row = await moveWeekOff({ role: "MANAGER", name: "Assistant (test)" }, "E05", "2026-12-06", "2026-12-08");
  const crit = (row.issues as { severity: string; message: string }[]).filter((i) => i.severity === "CRITICAL");
  console.log(`v${row.version}: ${(row.changes as unknown[]).length} cells changed, critical=${crit.length}`);
  crit.forEach((i) => console.log("  " + i.message));
  try { await moveWeekOff({ role: "MANAGER", name: "Assistant (test)" }, "E05", "2026-12-07", "2026-12-09"); } catch (e) { console.log("bad move rejected:", (e as Error).message); }
  await db.delete(rosters).where(and(eq(rosters.year, 2026), eq(rosters.month, 12), gt(rosters.version, base.version)));
  await db.delete(auditLog).where(eq(auditLog.actor, "Assistant (test)"));
  console.log("cleaned up");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
