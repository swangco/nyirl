import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Assistant } from "./chat";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/assistant");
  }
  if (session.user.id !== HOST_USER_ID) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <p className="text-foreground-soft">This tool is host-only.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
        Host tool
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-2">
        Ask your co-host
      </h1>
      <p className="text-sm text-foreground-soft mb-8">
        Ask about who&apos;s applying, how they score, or who&apos;s a repeat
        attendee. It looks up real data before answering.
      </p>
      <Assistant />
    </main>
  );
}
