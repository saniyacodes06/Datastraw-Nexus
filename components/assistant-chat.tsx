"use client";
// Centered chat. Answers come from the server; changes are proposals that need an explicit Confirm click.
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeftRight, ArrowUp, Bot, CalendarSearch, RotateCcw, ShieldAlert, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { askAssistant, confirmProposal } from "@/app/assistant-actions";
import { Button } from "@/components/ui/button";
import type { ChatTurn, Proposal } from "@/lib/assistant";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  { icon: CalendarSearch, title: "Who is off?", text: "Who is off on 2026-12-15, and is any brand short that day?" },
  { icon: ShieldAlert, title: "Coverage problems", text: "Which brands have coverage problems in December 2026, and how do I fix them?" },
  { icon: UserRound, title: "One person's month", text: "Show Riya's schedule for December 2026." },
  { icon: ArrowLeftRight, title: "Move a weekly off", text: "Move Harsh's weekly off from 2026-12-12 to 2026-12-16." },
];
const KEY = "nexus-assistant-chat";

/** Plain-text reply -> paragraphs and "- " bullet lists. */
function Reply({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n").map((l) => l.trimEnd()).filter(Boolean)) {
    const list = /^\s*[-•]\s+/.test(line);
    const clean = line.replace(/^\s*[-•]\s+/, "");
    const last = blocks.at(-1);
    if (last && last.list === list && list) last.lines.push(clean);
    else blocks.push({ list, lines: [clean] });
  }
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => b.list
        ? <ul key={i} className="list-disc space-y-0.5 pl-5">{b.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
        : <p key={i}>{b.lines[0]}</p>)}
    </div>
  );
}

export function AssistantChat({ online }: { online: boolean }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // Keep the conversation while moving between pages (this tab only).
  useEffect(() => {
    const saved = sessionStorage.getItem(KEY);
    if (saved) setTurns(JSON.parse(saved)); // eslint-disable-line react-hooks/set-state-in-effect -- sessionStorage is browser-only
  }, []);
  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-40)));
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy, proposal]);

  const send = (q: string) => {
    if (!q.trim() || busy) return;
    const next = [...turns, { role: "user" as const, text: q.trim() }];
    setTurns(next);
    setText("");
    setProposal(null);
    start(async () => {
      const res = await askAssistant(next);
      setTurns([...next, { role: "model", text: res.reply }]);
      setProposal(res.proposal ?? null);
    });
  };

  const decide = (yes: boolean) => {
    const p = proposal;
    setProposal(null);
    if (!p) return;
    if (!yes) return setTurns((t) => [...t, { role: "model", text: "OK, nothing was changed." }]);
    start(async () => {
      const res = await confirmProposal(p);
      setTurns((t) => [...t, { role: "model", text: res.message }]);
    });
  };

  const reset = () => { setTurns([]); setProposal(null); sessionStorage.removeItem(KEY); box.current?.focus(); };

  return (
    <div className="mx-auto flex h-[calc(100dvh-6.5rem)] max-w-3xl flex-col md:h-[calc(100dvh-3rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-5" /></span>
        <div className="min-w-0">
          <h1 className="font-semibold">Operations assistant</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground")} />
            {online ? "Online · reads the live roster" : "Off: GEMINI_API_KEY is not set"}
          </p>
        </div>
        {turns.length > 0 && <Button variant="outline" size="sm" className="ml-auto" onClick={reset}><RotateCcw className="size-3.5" />New chat</Button>}
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto rounded-2xl border bg-card" aria-live="polite">
        {turns.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-6 p-6 text-center">
            <div>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary"><Bot className="size-7" /></span>
              <h2 className="mt-4 text-xl font-semibold">How can I help with the roster?</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                I look things up in the live roster and can propose changes. I never edit anything myself: you confirm every change, and the engine re-checks it.
              </p>
            </div>
            <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {EXAMPLES.map(({ icon: Icon, title, text: t }) => (
                <button key={title} onClick={() => send(t)} disabled={!online || busy}
                  className="flex items-start gap-3 rounded-xl border bg-background p-3 text-left text-sm transition-colors hover:border-ring hover:bg-secondary/50 disabled:opacity-50">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span><span className="block font-medium">{title}</span><span className="text-xs text-muted-foreground">{t}</span></span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-4 md:p-6">
            {turns.map((t, i) => t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">{t.text}</div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary"><Bot className="size-4" /></span>
                <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-md bg-muted px-4 py-2.5 text-sm"><Reply text={t.text} /></div>
              </div>
            ))}
            {busy && (
              <div className="flex gap-3" aria-label="Assistant is thinking">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary"><Bot className="size-4" /></span>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-muted px-4 py-3">
                  {[0, 150, 300].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              </div>
            )}
            {proposal && !busy && (
              <div className="ml-11 rounded-2xl border border-[#F4BAA3] bg-accent p-4 text-sm text-accent-foreground">
                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" />Needs your confirmation</div>
                <p className="mt-1 text-foreground">{proposal.summary}</p>
                <p className="mt-1 text-xs">Nothing changes until you confirm. The result is saved as a new draft and re-checked by the validator.</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => decide(true)}>Confirm change</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(false)}>Cancel</Button>
                </div>
              </div>
            )}
            <div ref={end} />
          </div>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="mt-3">
        <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-3 focus-within:ring-ring/40">
          <textarea ref={box} value={text} rows={1} maxLength={500} disabled={!online}
            onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
            placeholder={online ? "Ask about rosters, leave or coverage…" : "The assistant is off"} aria-label="Message"
            className="max-h-36 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground" />
          <Button type="submit" size="icon" disabled={busy || !text.trim() || !online} aria-label="Send" className="rounded-xl"><ArrowUp className="size-4" /></Button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line · The assistant can only propose; you confirm every change.</p>
      </form>
    </div>
  );
}
