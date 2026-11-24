// Runs every assistant tool once without Gemini (tools are plain functions). Run: npx tsx scripts/check-assistant.ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { runTool, ask } = await import("../lib/assistant");
  const { getDirectory } = await import("../lib/data");
  const dir = await getDirectory();
  const show = async (name: string, args: Record<string, string>) => {
    try { const out = await runTool(name, args, dir); console.log(`OK  ${name}`, JSON.stringify(out).slice(0, 220)); }
    catch (e) { console.log(`ERR ${name}: ${(e as Error).message}`); }
  };
  await show("who_is_off", { date: "2026-12-10" });
  await show("coverage_problems", { month: "2026-12" });
  await show("employee_schedule", { employee: "riya", month: "2026-12" });
  await show("pending_leaves", {});
  await show("propose_move_week_off", { employee: "Harsh", from_date: "2026-12-13", to_date: "2026-12-16" });
  await show("propose_move_week_off", { employee: "Harsh", from_date: "2026-12-14", to_date: "2026-12-16" }); // not a week off -> clear error
  await show("employee_schedule", { employee: "a", month: "2026-12" }); // ambiguous -> clear error
  await show("propose_generate_roster", { month: "2027-01" });
  if (!process.env.GEMINI_API_KEY) console.log("ask() without key ->", (await ask([{ role: "user", text: "hi" }])).reply);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
