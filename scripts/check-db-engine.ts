// Sanity check: data read back from the DB gives the engine the same input as the sample. Run: npx tsx scripts/check-db-engine.ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import seed from "../db/seed.json";

const sortBy = <T,>(xs: T[], k: (x: T) => string) => [...xs].sort((a, b) => k(a).localeCompare(k(b)));

async function main() {
  const { loadEngineInput } = await import("../lib/engine");
  const got = await loadEngineInput(2026, 12);
  const same = (name: string, a: unknown, b: unknown) => console.log(JSON.stringify(a) === JSON.stringify(b) ? "OK  " : "DIFF", name);
  const key = (a: { employee: string; bp?: string; date?: string }) => `${a.employee}|${a.bp ?? a.date}`;
  same("employees", sortBy(got.employees, (e) => e.id).map((e) => [e.id, e.preferred_off, e.max_backup]), sortBy(seed.employees, (e) => e.id).map((e) => [e.id, e.preferred_off, e.max_backup]));
  same("brand_processes", sortBy(got.brand_processes, (b) => b.id).map((b) => [b.id, b.brand, b.calendar, b.min_staff, b.min_by_weekday]), sortBy(seed.brand_processes, (b) => b.id).map((b) => [b.id, b.brand, b.calendar, b.min_staff, b.min_by_weekday]));
  same("assignments", sortBy(got.assignments, key), sortBy(seed.assignments, key));
  same("leaves", sortBy(got.leaves, key), sortBy(seed.leaves, key));
  same("holidays (Dec)", got.holidays, ["2026-12-25"]);
}
main();

// Full path: DB -> engine API -> roster (needs `npm run engine` running)
(async () => {
  const { loadEngineInput, callEngine } = await import("../lib/engine");
  const out = await callEngine<{ roster: { shortage_units: number }; issues: { type: string }[] }>("/generate", { data: await loadEngineInput(2026, 12) })
    .catch((e) => ({ error: e.message }));
  console.log("ENGINE", "error" in out ? out.error : `shortage=${out.roster.shortage_units} issues=${out.issues.map((i) => i.type).join(",")}`);
})();
