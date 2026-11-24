// Generate + save a roster from the terminal (same steps as the Generate button). Run: npx tsx scripts/generate.ts 2026-12
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const [y, m] = (process.argv[2] ?? "2026-12").split("-").map(Number);
  const { callEngine, loadEngineInput, saveRoster } = await import("../lib/engine");
  const out = await callEngine<import("../lib/engine").EngineReport>("/generate", { data: await loadEngineInput(y, m) });
  const row = await saveRoster(out, "Generated (script)");
  console.log(`Saved ${y}-${m} v${row.version}: ${out.issues.filter((i) => i.severity === "CRITICAL").length} critical, ${out.issues.length} total issues`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
