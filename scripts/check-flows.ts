// End-to-end check of the change-handling loop against the real DB + engine. Cleans up after itself.
// Run with both servers up: npm run check:flows
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { strict as assert } from "node:assert";

async function main() {
  const { db, leaves, rosters, notifications, auditLog } = await import("../db");
  const { and, eq, gt } = await import("drizzle-orm");
  const { latestRoster } = await import("../lib/engine");
  const { decideLeaveBatch, moveWeekOff } = await import("../lib/ops");
  type R = import("../lib/engine").Roster;
  const s = { role: "MANAGER" as const, name: "TEST" };
  const started = new Date();

  const base = await latestRoster(2026, 12);
  if (!base) throw new Error("Generate December 2026 first");
  // Pick a future working day for Riya (E05, sole owner of Bloom Botanics).
  const day = (base.data as R).days.find((d, i) => d > new Date().toISOString().slice(0, 10) && (base.data as R).entries.E05[i].status === "WORK")!;
  const idx = (base.data as R).days.indexOf(day);
  try {
    const [lv] = await db.insert(leaves).values({ employeeId: "E05", date: day, status: "PENDING", batch: "TEST-FLOW" }).returning();

    await decideLeaveBatch(s, "TEST-FLOW", "APPROVED");
    const v1 = (await latestRoster(2026, 12))!;
    assert.equal(v1.version, base.version + 1, "approval re-plans into a new version");
    assert.equal((v1.data as R).entries.E05[idx].status, "LEAVE", "leave day is now LEAVE");
    const cover = (v1.coverage as Record<string, [number, number][]>)["bloombotanics-cs"][idx];
    console.log(`approve  -> v${v1.version}: E05 on leave ${day}, Bloom Botanics CS ${cover[0]}/${cover[1]}`);

    await assert.rejects(decideLeaveBatch(s, "TEST-FLOW", "APPROVED"), /No pending/, "cannot approve twice");
    await assert.rejects(decideLeaveBatch(s, "TEST-FLOW", "REJECTED"), /No pending/, "cannot reject after approval");
    console.log("double decision -> blocked");

    await decideLeaveBatch(s, "TEST-FLOW", "CANCELLED");
    const v2 = (await latestRoster(2026, 12))!;
    assert.equal(v2.version, base.version + 2, "cancel re-plans too");
    assert.notEqual((v2.data as R).entries.E05[idx].status, "LEAVE", "leave day given back");
    console.log(`cancel   -> v${v2.version}: E05 ${day} is ${(v2.data as R).entries.E05[idx].status} again`);

    // Weekly-off swap (what the assistant proposes) re-validates.
    const row = (v2.data as R).entries.E08, days = (v2.data as R).days;
    const off = days.find((d, i) => d > day && row[i].status === "WEEK_OFF");
    const work = days.find((d, i) => off && d.slice(0, 7) === off.slice(0, 7) && d !== off && row[i].status === "WORK");
    if (off && work) {
      const v3 = await moveWeekOff(s, "E08", off, work);
      assert.equal((v3.data as R).entries.E08[days.indexOf(work)].status, "WEEK_OFF");
      console.log(`move off -> v${v3.version}: E08 ${off} -> ${work}, ${(v3.issues as unknown[]).length} issues re-checked`);
    }
    await db.delete(leaves).where(eq(leaves.id, lv.id));
  } finally {
    await db.delete(leaves).where(eq(leaves.batch, "TEST-FLOW"));
    await db.delete(rosters).where(and(eq(rosters.year, 2026), eq(rosters.month, 12), gt(rosters.version, base.version)));
    await db.delete(notifications).where(gt(notifications.createdAt, started));
    await db.delete(auditLog).where(and(eq(auditLog.actor, "TEST"), gt(auditLog.createdAt, started)));
    console.log("cleaned up");
  }
}
main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
