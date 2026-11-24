// Apply SQL files in db/migrations to the database over HTTP. Run: npm run db:migrate
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  const { db } = await import("./index");
  await migrate(db, { migrationsFolder: "db/migrations" });
  console.log("Migrations applied.");
}

main().catch((err) => { console.error(err.message, "\nCAUSE:", err.cause?.message ?? err.cause); process.exit(1); });
