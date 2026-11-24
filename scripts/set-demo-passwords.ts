// Give every employee WITHOUT a password the demo password (DEMO_PASSWORD, default demo1234).
// For databases seeded before passwords existed. Run: npm run db:passwords
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { db, employees } = await import("../db");
  const { isNull } = await import("drizzle-orm");
  const { hashPassword } = await import("../lib/auth");
  const rows = await db.update(employees).set({ passwordHash: await hashPassword(process.env.DEMO_PASSWORD ?? "demo1234") })
    .where(isNull(employees.passwordHash)).returning({ id: employees.id });
  console.log(`Set the demo password for ${rows.length} employee(s).`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
