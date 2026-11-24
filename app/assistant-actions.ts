"use server";
// Assistant: ask (read-only, may return a proposal) and confirm (manager runs the proposal).
import { z } from "zod";
import { userMessage } from "@/lib/action";
import { ask, type ChatTurn } from "@/lib/assistant";
import { audit, requireManager } from "@/lib/auth";
import { decideLeaveBatch, generateMonth, moveWeekOff } from "@/lib/ops";

const Turns = z.array(z.object({ role: z.enum(["user", "model"]), text: z.string().max(4000) })).max(40);
const ProposalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MOVE_WEEK_OFF"), employeeId: z.string(), from: z.iso.date(), to: z.iso.date(), summary: z.string() }),
  z.object({ kind: z.literal("GENERATE"), month: z.string().regex(/^\d{4}-\d{2}$/), summary: z.string() }),
  z.object({ kind: z.literal("DECIDE_LEAVE"), batch: z.string(), decision: z.enum(["APPROVED", "REJECTED"]), summary: z.string() }),
]);

export async function askAssistant(history: ChatTurn[]) {
  await requireManager();
  try {
    return await ask(Turns.parse(history));
  } catch (err) {
    return { reply: `The assistant hit an error: ${userMessage(err)}` };
  }
}

/** The only path from the assistant to a real change: the manager pressed Confirm. Re-validated here. */
export async function confirmProposal(input: unknown) {
  const s = await requireManager();
  const p = ProposalSchema.parse(input);
  const as = { ...s, name: `Assistant (confirmed by ${s.name})` };
  try {
    if (p.kind === "MOVE_WEEK_OFF") {
      const row = await moveWeekOff(as, p.employeeId, p.from, p.to);
      const critical = (row.issues as { severity: string }[]).filter((i) => i.severity === "CRITICAL").length;
      return { ok: true, message: `Done: saved as draft v${row.version}. The checker now reports ${critical} critical conflict(s). Review it on the Roster page before publishing.` };
    }
    if (p.kind === "GENERATE") {
      const [y, m] = p.month.split("-").map(Number);
      const row = await generateMonth(as, y, m);
      return { ok: true, message: `Done: generated draft v${row.version}. Open the Roster page to review and publish.` };
    }
    const out = await decideLeaveBatch(as, p.batch, p.decision);
    return { ok: true, message: `Done: ${out.employee}'s leave (${out.dates}) ${p.decision.toLowerCase()}.${p.decision === "APPROVED" ? " The roster was re-planned with minimal change." : ""}` };
  } catch (err) {
    await audit(as, "Assistant action failed", `${p.summary}: ${userMessage(err)}`);
    return { ok: false, message: `Not done: ${userMessage(err)}` };
  }
}
