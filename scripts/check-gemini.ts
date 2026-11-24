// Asks the real assistant a few questions (uses your Gemini quota). Run: npx tsx scripts/check-gemini.ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { ask } = await import("../lib/assistant");
  for (const q of [
    "Who is off on 2026-12-10 and is any brand short that day?",
    "Why is there a critical conflict in December 2026 and how do I fix it?",
    "Move Riya's weekly off from 2026-12-06 to 2026-12-08",
  ]) {
    const t = Date.now();
    const out = await ask([{ role: "user", text: q }]);
    console.log(`\nQ: ${q}\nA (${((Date.now() - t) / 1000).toFixed(1)}s): ${out.reply}\nPROPOSAL: ${out.proposal ? JSON.stringify(out.proposal) : "none"}`);
  }
}
main().catch((e) => { console.error("ERR", e.message.slice(0, 400)); process.exit(1); });
