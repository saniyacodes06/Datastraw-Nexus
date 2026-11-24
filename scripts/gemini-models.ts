// Lists Gemini models your key can use for generateContent. Run: npx tsx scripts/gemini-models.ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { GoogleGenAI } from "@google/genai";

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const names: string[] = [];
  for await (const m of await ai.models.list()) if (m.supportedActions?.includes("generateContent")) names.push(m.name ?? "");
  console.log(names.filter((n) => n.includes("flash") || n.includes("pro")).join("\n"));
}
main().catch((e) => { console.error("ERR", e.message.slice(0, 300)); process.exit(1); });
