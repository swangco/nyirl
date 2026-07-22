"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

const TOOL_LABELS: Record<string, string> = {
  listEvents: "Looking up events…",
  getApplicantsForEvent: "Pulling applicants…",
  getApplicantHistory: "Checking attendance history…",
};

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");

  const busy = status === "streaming" || status === "submitted";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[520px] w-[360px] flex-col rounded-lg border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-accent">
                Host tool
              </p>
              <p className="font-serif text-base font-semibold text-foreground">
                Co-host
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="rounded-full px-2 py-1 text-foreground-soft hover:text-foreground"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                <div key={message.id} className="flex flex-col gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-foreground-soft/70">
                    {message.role === "user" ? "You" : "Co-host"}
                  </p>
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <p
                          key={i}
                          className="whitespace-pre-wrap rounded-lg border border-line bg-background p-3 text-sm text-foreground"
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
                  Try: &quot;Who&apos;s applied to Founder Mahjong Night and
                  who stands out?&quot;
                </p>
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim() || busy) return;
              sendMessage({ text: input });
              setInput("");
            }}
            className="flex gap-2 border-t border-line p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your applicants…"
              disabled={busy}
              className="flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-soft/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? "…" : "Ask"}
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close co-host assistant" : "Open co-host assistant"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-surface shadow-lg transition-transform hover:scale-105"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
