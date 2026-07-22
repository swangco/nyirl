import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { auth } from "@/auth";
import { agentTools } from "@/lib/agent-tools";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.id !== HOST_USER_ID) {
    return new Response("Not authorized", { status: 401 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: `You are the host's co-host assistant for NY IRL, a curated event platform. You help the host understand their applicant pool: who's applying, how they score, whether they've been to past events, and who stands out. Use the available tools to look up real data before answering — never guess or make up names or numbers. Keep answers concise and concrete, referencing actual applicant names and scores from the tools.`,
    messages: await convertToModelMessages(messages),
    tools: agentTools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
