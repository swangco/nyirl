"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

const TOOL_LABELS: Record<string, string> = {
  listEvents: "Looking up events…",
  getApplicantsForEvent: "Pulling applicants…",
  getApplicantHistory: "Checking attendance history…",
};

export function Assistant() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");

  const busy = status === "streaming" || status === "submitted";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-4">
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-2">
            <p className="font-mono text-[11px] uppercase tracking-wide text-foreground-soft/70">
              {message.role === "user" ? "You" : "Co-host"}
            </p>
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <p
                    key={i}
                    className="whitespace-pre-wrap rounded-lg border border-line bg-surface p-4 text-sm text-foreground"
                  >
                    {part.text}
                  </p>
                );
              }
              if (part.type.startsWith("tool-")) {
                const toolName = part.type.replace("tool-", "");
                return (
                  <p
                    key={i}
                    className="font-mono text-xs italic text-foreground-soft"
                  >
                    → {TOOL_LABELS[toolName] ?? `Using ${toolName}…`}
                  </p>
                );
              }
              return null;
            })}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-foreground-soft">
            Try: &quot;Who&apos;s applied to Founder Mahjong Night and who
            stands out?&quot;
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput("");
        }}
        className="mt-auto flex gap-2 border-t border-line pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your applicants…"
          disabled={busy}
          className="flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-soft/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
