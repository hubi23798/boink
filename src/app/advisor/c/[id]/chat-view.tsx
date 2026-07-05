"use client";

import { useEffect, useRef, useState } from "react";

interface ProposalData {
  id: string;
  advisorMessageId: string;
  kind: string;
  payload: Record<string, string>;
  status: "pending" | "accepted" | "rejected" | "expired";
}

interface MessageData {
  id: string;
  role: "user" | "assistant" | "tool";
  contentText: string | null;
  createdAt: string;
}

interface ConversationData {
  conversation: { id: string; title: string };
  messages: MessageData[];
  proposals: ProposalData[];
  todayTokens: number;
  tokenBudget: number;
}

function ProposalCard({
  proposal,
  onAction,
}: {
  proposal: ProposalData;
  onAction: (id: string, action: "accept" | "reject") => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const p = proposal.payload;
  const summary = `${p.matchKind ?? proposal.kind}: "${p.matchValue ?? ""}"`;

  return (
    <div className="border-border-subtle bg-surface mt-2 rounded-lg border p-3 text-sm">
      <p className="text-fg-muted mb-1 text-xs font-medium tracking-wide uppercase">
        Proposal — Create categorization rule
      </p>
      <p className="mb-1">{summary}</p>
      {p.rationale && <p className="text-fg-muted mb-3 text-xs italic">{p.rationale}</p>}
      {proposal.status === "pending" ? (
        <div className="flex gap-2">
          <button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              await onAction(proposal.id, "accept");
              setLoading(false);
            }}
            className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Accept
          </button>
          <button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              await onAction(proposal.id, "reject");
              setLoading(false);
            }}
            className="border-border-subtle rounded border px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : (
        <span
          className={`text-xs font-medium ${proposal.status === "accepted" ? "text-green-600" : "text-fg-muted"}`}
        >
          {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
        </span>
      )}
    </div>
  );
}

export function ChatView({ id, initialMessage = "" }: { id: string; initialMessage?: string }) {
  const [data, setData] = useState<ConversationData | null>(null);
  const [input, setInput] = useState(initialMessage);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/advisor/conversations/${id}`)
      .then((r) => r.json() as Promise<ConversationData>)
      .then((d) => {
        setData(d);
        setProposals(d.proposals);
      })
      .catch(console.error);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  async function sendMessage() {
    if (!input.trim() || sending) return;
    setSendError(null);
    const text = input.trim();
    setInput("");
    setSending(true);

    const optimisticId = crypto.randomUUID();

    // Optimistic user message
    setData((prev) =>
      prev
        ? {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: optimisticId,
                role: "user" as const,
                contentText: text,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : prev,
    );

    try {
      const res = await fetch(`/api/advisor/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        throw new Error(`Send failed: ${res.status}`);
      }

      // Reload full conversation
      const getRes = await fetch(`/api/advisor/conversations/${id}`);
      if (!getRes.ok) {
        throw new Error(`Reload failed: ${getRes.status}`);
      }
      const updated = (await getRes.json()) as ConversationData;
      setData(updated);
      setProposals(updated.proposals);
    } catch (e) {
      console.error(e);
      setInput(text); // restore input
      setData((prev) =>
        prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== optimisticId) } : prev,
      );
      setSendError("Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleProposalAction(proposalId: string, action: "accept" | "reject") {
    try {
      const res = await fetch(`/api/advisor/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed");
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId
            ? { ...p, status: action === "accept" ? ("accepted" as const) : ("rejected" as const) }
            : p,
        ),
      );
    } catch (e) {
      console.error("[advisor] proposal action failed:", e);
    }
  }

  const visibleMessages =
    data?.messages.filter((m) => m.role === "user" || (m.role === "assistant" && m.contentText)) ??
    [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      {/* Message list */}
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {visibleMessages.length === 0 && !sending && (
          <p className="text-fg-muted text-center text-sm">Ask me anything about your finances.</p>
        )}

        {visibleMessages.map((msg) => {
          const msgProposals =
            msg.role === "assistant"
              ? proposals.filter((p) => p.advisorMessageId === msg.id && p.status !== "expired")
              : [];

          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-fg-default text-bg-default"
                    : "border-border-subtle bg-surface border"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.contentText}</p>
                {msgProposals.map((p) => (
                  <ProposalCard key={p.id} proposal={p} onAction={handleProposalAction} />
                ))}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="border-border-subtle bg-surface rounded-2xl border px-4 py-2 text-sm">
              <span className="text-fg-muted animate-pulse">Thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Cost indicator */}
      {data && (
        <div className="text-fg-muted px-6 py-1 text-center text-xs">
          Today: {data.todayTokens.toLocaleString()} / {data.tokenBudget.toLocaleString()} tokens
        </div>
      )}

      {/* Send error */}
      {sendError && <p className="px-6 text-center text-xs text-red-500">{sendError}</p>}

      {/* Send box */}
      <div className="border-border-subtle flex gap-2 border-t px-6 py-4">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          disabled={sending}
          placeholder="Ask about your finances…"
          rows={2}
          className="border-border-subtle bg-surface focus:ring-fg-muted flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={() => void sendMessage()}
          disabled={sending || !input.trim()}
          className="bg-fg-default text-bg-default self-end rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
