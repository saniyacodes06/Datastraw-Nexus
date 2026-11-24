// Fill the database from db/seed.json (exported by engine/roster/sample.py, the single source of sample data).
// Run: npm run db:seed   (WIPES existing data first)
import { config } from "dotenv";
config({ path: ".env.local" });

import seed from "./seed.json";

async function main() {
  const { db, pods, employees, brands, brandProcesses, assignments, holidays, leaves, rosters, notifications, auditLog } = await import("./index");

  // Children first so foreign keys don't block the wipe.
  for (const t of [notifications, auditLog, rosters, leaves, assignments, brandProcesses, brands, holidays, employees, pods]) await db.delete(t);

  await db.insert(pods).values(seed.pods.map((p) => ({ id: p.id, name: p.name, leadId: p.lead })));
  const { hashPassword } = await import("../lib/auth");
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD ?? "demo1234"); // demo: one shared password
  await db.insert(employees).values(seed.employees.map((e) => ({
    passwordHash,
    id: e.id, name: e.name, email: e.email, podId: e.pod, role: e.role,
    preferredOff: e.preferred_off, maxConsecutive: e.max_consecutive, maxBackup: e.max_backup,
  })));

  const brandId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const brandRows = new Map(seed.brand_processes.map((b) => [brandId(b.brand), { id: brandId(b.brand), name: b.brand, podId: b.pod }]));
  await db.insert(brands).values([...brandRows.values()]);
  await db.insert(brandProcesses).values(seed.brand_processes.map((b) => ({
    id: b.id, brandId: brandId(b.brand), process: b.process, calendar: b.calendar,
    minStaff: b.min_staff, minByWeekday: b.min_by_weekday as Record<string, number>,
  })));
  await db.insert(assignments).values(seed.assignments.map((a) => ({ employeeId: a.employee, bpId: a.bp, role: a.role })));
  await db.insert(holidays).values(Object.entries(seed.holiday_names).map(([date, name]) => ({ date, name })));
  await db.insert(leaves).values(seed.leaves.map((l) => ({ employeeId: l.employee, date: l.date, type: l.type, status: "APPROVED" })));

  console.log(`Seeded ${seed.employees.length} employees, ${brandRows.size} brands, ${seed.brand_processes.length} brand-processes.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
