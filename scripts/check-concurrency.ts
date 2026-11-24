// Fires truly simultaneous clashing writes at the real DB and checks the database lets exactly one win,
// plus the sign-in rules. Cleans up after itself. Run: npm run check:concurrency
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { strict as assert } from "node:assert";

async function main() {
  const { db, leaves, rosters, employees } = await import("../db");
  const { and, eq, gt } = await import("drizzle-orm");
  const { latestRoster } = await import("../lib/engine");
  const { userMessage } = await import("../lib/action");
  const { checkCredentials } = await import("../lib/auth");
  const both = <T>(a: Promise<T>, b: Promise<T>) => Promise.allSettled([a, b]);
  const base = await latestRoster(2026, 12);
  if (!base) throw new Error("Generate December 2026 first");
  try {
    // 1) Two saves of the next version at the same moment.
    const row = { year: 2026, month: 12, version: base.version + 1, data: base.data, issues: base.issues, coverage: base.coverage, note: "TEST race" };
    const saves = await both(db.insert(rosters).values(row), db.insert(rosters).values(row));
    assert.deepEqual(saves.map((s) => s.status).sort(), ["fulfilled", "rejected"]);
    const lost = (saves.find((s) => s.status === "rejected") as PromiseRejectedResult).reason;
    assert.match(userMessage(lost), /same moment/);
    console.log("double save      -> 1 saved, 1 refused:", userMessage(lost));

    // 2) Same leave day submitted twice at once (double-click).
    const lv = { employeeId: "E05", date: "2026-12-30", batch: "TEST-RACE" };
    const reqs = await both(db.insert(leaves).values(lv), db.insert(leaves).values({ ...lv, batch: "TEST-RACE2" }));
    assert.equal(reqs.filter((s) => s.status === "fulfilled").length, 1);
    console.log("double leave     -> 1 stored");

    // 3) Two managers publish two different versions at the same moment.
    const [a] = await db.insert(rosters).values({ ...row, version: base.version + 2 }).returning();
    const [b] = await db.insert(rosters).values({ ...row, version: base.version + 3 }).returning();
    const publish = (id: number) => db.batch([
      db.update(rosters).set({ status: "SUPERSEDED" }).where(and(eq(rosters.year, 2026), eq(rosters.month, 12), eq(rosters.status, "PUBLISHED"))).returning(),
      db.update(rosters).set({ status: "PUBLISHED" }).where(eq(rosters.id, id)),
    ]);
    await both(publish(a.id), publish(b.id));
    const live = await db.select().from(rosters).where(and(eq(rosters.year, 2026), eq(rosters.month, 12), eq(rosters.status, "PUBLISHED")));
    assert.equal(live.length, 1, "exactly one published version");
    console.log(`double publish   -> exactly 1 published (v${live[0].version})`);

    // 4) Sign-in rules.
    const [riya] = await db.select().from(employees).where(eq(employees.id, "E05"));
    assert.equal((await checkCredentials(riya.email, "demo1234"))?.employeeId, "E05");
    assert.equal(await checkCredentials(riya.email, "wrong-password"), null);
    assert.equal(await checkCredentials("nobody@x.demo", "demo1234"), null);
    assert.equal((await checkCredentials("manager@datastraw.demo", "demo1234"))?.role, "MANAGER");
    for (let i = 0; i < 5; i++) await checkCredentials("lock@x.demo", "bad");
    await assert.rejects(checkCredentials("lock@x.demo", "bad"), /Too many failed attempts/);
    console.log("sign-in          -> right ok, wrong/unknown refused, locked after 5 failures");
  } finally {
    await db.delete(leaves).where(eq(leaves.date, "2026-12-30"));
    await db.delete(rosters).where(and(eq(rosters.year, 2026), eq(rosters.month, 12), gt(rosters.version, base.version)));
    await db.update(rosters).set({ status: base.status }).where(eq(rosters.id, base.id));
    console.log("cleaned up");
  }
}
main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
