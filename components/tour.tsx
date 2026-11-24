"use client";
// First-run guided tour: dims the page, spotlights one real element per step, and walks across pages.
// Shown once per browser per role (localStorage); "Take the tour" in the sidebar replays it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = { path: string; target?: string; title: string; body: string };

const MANAGER: Step[] = [
  { path: "/dashboard", title: "Welcome to DataStraw Nexus", body: "Plan, check and publish monthly rosters for every brand, process and pod. This 1-minute tour shows the flow. You can skip it any time." },
  { path: "/dashboard", target: "/brands", title: "1. Set the rules", body: "Each brand-process has its own calendar (365 days, no holidays, or no Sundays) and minimum staff. Assign primary and backup people here." },
  { path: "/dashboard", target: "/employees", title: "2. Your team", body: "Pods, pod leads, preferred weekly off, max days in a row and how many extra brands someone can back up." },
  { path: "/dashboard", target: "/leaves", title: "3. Leaves and comp-offs", body: "Approve a leave and the roster is re-planned automatically with the fewest possible changes." },
  { path: "/roster", target: "generate", title: "4. Generate the roster", body: "The optimisation engine plans weekly offs and backups for the whole month. Hard rules are never broken; any gap it can't avoid is flagged, never hidden." },
  { path: "/roster", target: "views", title: "5. Look at it your way", body: "Company, pod, brand, process or employee view. Red cells are short-staffed days. Hover any cell for details." },
  { path: "/roster", target: "conflicts", title: "6. Fix conflicts", body: "Every problem in plain words, with suggested fixes. Critical items must be resolved or justified before publishing." },
  { path: "/roster", target: "publish", title: "7. Publish", body: "Rosters stay as drafts until you publish. Employees are notified, and every version is kept so you can compare." },
  { path: "/roster", target: "/resilience", title: "8. Stress test", body: "Checks what breaks if any one person calls in sick, and shows your single points of failure before it happens." },
  { path: "/roster", target: "/assistant", title: "9. Ask the assistant", body: "Ask \"who is off on the 21st?\" or \"fix the gap on Kesar Kitchen\". It only proposes changes; nothing happens until you press Confirm." },
  { path: "/roster", target: "tour", title: "That's it", body: "You can replay this tour any time from here." },
];
const EMPLOYEE: Step[] = [
  { path: "/roster", title: "Welcome!", body: "Here is your roster for the month: working days, weekly offs, holidays and approved leaves." },
  { path: "/roster", target: "/leaves", title: "Need a day off?", body: "Request leave or a comp-off here. Your manager approves it and the roster updates." },
  { path: "/roster", target: "/notifications", title: "Stay updated", body: "You get a notification when a roster is published or your leave is decided." },
  { path: "/roster", target: "tour", title: "That's it", body: "Replay this tour any time from here." },
];

const PAD = 6;
const find = (t?: string) => (t ? document.querySelector<HTMLElement>(`[data-tour="${t}"]`) : null);

export function Tour({ manager, compact = false }: { manager: boolean; compact?: boolean }) {
  const steps = manager ? MANAGER : EMPLOYEE;
  const key = `nexus-tour-${manager ? "manager" : "employee"}`;
  const router = useRouter();
  const path = usePathname();
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const next = useRef<HTMLButtonElement>(null);
  const step = i === null ? null : steps[i];

  // First visit: start automatically.
  useEffect(() => {
    if (!localStorage.getItem(key)) setI(0); // eslint-disable-line react-hooks/set-state-in-effect -- reading localStorage needs the browser
  }, [key]);

  const close = useCallback(() => { localStorage.setItem(key, "done"); setI(null); }, [key]);
  const go = useCallback((n: number) => (n >= steps.length ? close() : setI(Math.max(0, n))), [steps.length, close]);

  // Tell the sidebar which element is in focus, so it can open (phone drawer / collapsed rail) when needed.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("nexus-tour-step", { detail: step ? step.target ?? "" : null }));
  }, [step]);

  // Right page for this step?
  useEffect(() => {
    if (step && path !== step.path) router.push(step.path);
  }, [step, path, router]);

  // Find the target (it may appear a moment after navigation) and track its position.
  useLayoutEffect(() => {
    if (!step || path !== step.path) return;
    let el: HTMLElement | null = null;
    let tries = 0;
    const place = () => setRect(el ? el.getBoundingClientRect() : null);
    const look = window.setInterval(() => {
      el = find(step.target);
      if (el || !step.target || ++tries > 25) {
        window.clearInterval(look);
        setMissing(!!step.target && !el);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        place();
        window.setTimeout(place, 350); // after smooth scroll
      }
    }, 100);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.clearInterval(look); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); setRect(null); setMissing(false); };
  }, [step, path]);

  // Keyboard: Esc skips, arrows move.
  useEffect(() => {
    if (i === null) return;
    next.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go, close]);

  const replay = (
    <button data-tour="tour" onClick={() => go(0)} title="Take the tour"
      className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground", compact && "md:justify-center md:px-0")}>
      <Compass className="size-[18px] shrink-0" /><span className={cn(compact && "md:sr-only")}>Take the tour</span>
    </button>
  );
  if (!step || i === null) return replay;

  // Card goes below the target, or above if there is no room; centered when there is no target.
  const W = 340;
  const style: React.CSSProperties = rect
    ? {
        width: W,
        left: Math.min(Math.max(12, rect.left), window.innerWidth - W - 12),
        ...(rect.bottom + 220 < window.innerHeight ? { top: rect.bottom + PAD + 10 } : { bottom: window.innerHeight - rect.top + PAD + 10 }),
      }
    : { width: W, left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  return (
    <>
      {replay}
      <div className="fixed inset-0 z-50" aria-hidden onClick={(e) => e.stopPropagation()}>
        {rect ? (
          <div className="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all duration-200"
            style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }} />
        ) : <div className="absolute inset-0 bg-black/55" />}
      </div>
      <div role="dialog" aria-modal="true" aria-labelledby="tour-title" className="fixed z-50 rounded-xl border bg-background p-4 shadow-xl" style={style}>
        <div className="mb-1 text-xs text-muted-foreground">Step {i + 1} of {steps.length}</div>
        <h2 id="tour-title" className="font-semibold">{step.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
        {missing && <p className="mt-2 text-xs text-amber-600">(Not on screen right now: it appears when a draft roster exists for this month.)</p>}
        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={close}>Skip tour</Button>
          <div className="ml-auto flex gap-2">
            {i > 0 && <Button variant="outline" size="sm" onClick={() => go(i - 1)}>Back</Button>}
            <Button ref={next} size="sm" onClick={() => go(i + 1)}>{i === steps.length - 1 ? "Finish" : "Next"}</Button>
          </div>
        </div>
      </div>
    </>
  );
}
