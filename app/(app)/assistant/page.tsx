import { AssistantChat } from "@/components/assistant-chat";
import { requireManager } from "@/lib/auth";

export default async function AssistantPage() {
  await requireManager();
  return <AssistantChat online={!!process.env.GEMINI_API_KEY} />;
}
