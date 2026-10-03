import { useEffect, useRef, useState } from "react";
import type { Scenario } from "./data";

// Set at build time (Netlify environment variable). Unset = the chat is hidden, so it doubles as the off switch.
export const CHAT_API_URL = (import.meta.env.VITE_CHAT_API_URL as string | undefined)?.replace(/\/$/, "");

interface Message { role: "user" | "assistant"; content: string; sources?: string[] }
interface Props { scenario: Scenario; year: number; postcode: string | null }

const MAX_CHARS = 500;

/** Inline text with **bold** spans rendered as <strong> (models sometimes add bold despite the prompt). */
function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part)}</>;
}

/** Plain-text answer with "- " list lines rendered as a list. */
function Answer({ text }: { text: string }) {
  const blocks: (string | string[])[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith("- ")) {
      const last = blocks.at(-1);
      if (Array.isArray(last)) last.push(line.slice(2)); else blocks.push([line.slice(2)]);
    } else blocks.push(line);
  }
  return <>{blocks.map((b, i) => (Array.isArray(b)
    ? <ul key={i}>{b.map((li, j) => <li key={j}><Inline text={li} /></li>)}</ul>
    : <p key={i}><Inline text={b} /></p>))}</>;
}

export default function Chat({ scenario, year, postcode }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, busy]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  if (!CHAT_API_URL) return null;

  const suggestions = [
    postcode ? `How much panel waste will postcode ${postcode} produce in ${year}?` : `Which postcodes retire the most panel waste in ${year}?`,
    "How much better are the 100 optimised sites than capital cities only?",
    "How did PanelPath measure how long panels last?",
  ];

  async function ask(question: string) {
    const q = question.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    const history: Message[] = [...messages, { role: "user", content: q }];
    setMessages(history);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${CHAT_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-12).map(({ role, content }) => ({ role, content })),
          context: { scenario, year, postcode },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "The assistant couldn't answer just now.");
      setMessages([...history, { role: "assistant", content: body.answer, sources: body.sources }]);
    } catch (e) {
      setMessages(messages); // drop the unanswered question so it can be asked again
      setInput(q);
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Couldn't reach the assistant. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="chat-open" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        Ask the data
      </button>
    );
  }

  return (
    <aside className="chat" aria-label="Ask the data">
      <header className="chat-head">
        <div>
          <p className="chat-title">Ask the data</p>
          <p className="chat-sub">Answers come only from PanelPath's data files. Forecasts, not measurements.</p>
        </div>
        <button className="close" onClick={() => setOpen(false)} aria-label="Close chat">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p className="kicker">Try asking</p>
            {suggestions.map((s) => <button key={s} className="suggestion" onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "assistant" ? <Answer text={m.content} /> : <p>{m.content}</p>}
            {m.sources && m.sources.length > 0 && <p className="msg-sources">Data used: {m.sources.join(" · ")}</p>}
          </div>
        ))}
        {busy && <div className="msg assistant pending">Checking the data…</div>}
      </div>

      {error && <p className="chat-error" role="status">{error}</p>}
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <textarea ref={inputRef} rows={2} maxLength={MAX_CHARS} value={input} placeholder="Ask about a postcode, a site or the method"
          aria-label="Your question" onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }} />
        <button type="submit" disabled={busy || !input.trim()}>Ask</button>
      </form>
    </aside>
  );
}
