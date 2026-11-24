// Public landing page (signed-out visitors at "/"). Explains the problem, the approach and the features.
import Link from "next/link";
import {
  ArrowRight, Bot, CalendarCheck2, CalendarClock, CheckCircle2, Download, GitCompareArrows, Layers3, ShieldAlert,
  ShieldCheck, SlidersHorizontal, Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: SlidersHorizontal, title: "Configure", body: "Brands, processes, pods and people. Each process gets its own calendar (365 days, no public holidays, or no Sundays) and minimum staff, even per weekday." },
  { icon: CalendarCheck2, title: "Generate", body: "A constraint solver (Google OR-Tools CP-SAT) plans every person-day of the month: weekly offs, leaves, comp-offs, backups and fair Sundays." },
  { icon: ShieldCheck, title: "Validate", body: "An independent checker re-reads the roster cell by cell and explains every conflict in plain words, with suggested fixes." },
  { icon: GitCompareArrows, title: "Adapt", body: "Leave approved or a rule changed? Re-plan with the fewest possible changes. Past days stay locked; every version is kept." },
];

const FEATURES = [
  { icon: Layers3, title: "Per-process rules", body: "Customer Support 7 days a week while NDR takes Sundays off, all in the same brand." },
  { icon: Users, title: "Single and multi-resource brands", body: "Dedicated owners, split processes, shared processes and pod-lead backups, modelled explicitly." },
  { icon: ShieldAlert, title: "N-1 stress test", body: "What breaks if any one person calls in sick? See single points of failure before they happen." },
  { icon: CalendarClock, title: "Hard rules vs preferences", body: "Coverage and leave are never traded away for a preferred day off. Preferences are honoured when possible." },
  { icon: Bot, title: "AI assistant with guardrails", body: "Ask who is off or why a gap exists. It only proposes changes; nothing happens until a manager confirms." },
  { icon: Download, title: "Views and export", body: "Company, pod, brand, process and employee views. Publish with notifications, download as CSV." },
];

const DEMO: [string, string][][] = [ // a tiny, static roster preview
  [["W", "w"], ["W", "w"], ["WO", "o"], ["W", "w"], ["W", "w"], ["W+", "b"], ["W", "w"]],
  [["W", "w"], ["L", "l"], ["W+", "b"], ["W", "w"], ["WO", "o"], ["W", "w"], ["W", "w"]],
  [["WO", "o"], ["W", "w"], ["W", "w"], ["W", "w"], ["W", "w"], ["H", "h"], ["W", "w"]],
];
const TONE: Record<string, string> = {
  w: "bg-emerald-100 text-emerald-900", b: "bg-sky-100 text-sky-900", o: "bg-muted text-muted-foreground",
  l: "bg-amber-100 text-amber-900", h: "bg-violet-100 text-violet-900",
};

export function Landing({ stats, home }: { stats: { employees: number; brands: number; processes: number }; home: string | null }) {
  const cta = home ?? "/login";
  const ctaLabel = home ? "Open the app" : "Open the demo";
  return (
    <div className="bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1760px] items-center gap-3 px-6 lg:px-12 2xl:px-20 py-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">DN</span>
          <span className="font-semibold text-primary">DataStraw Nexus</span>
          <nav className="ml-auto hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#trust" className="hover:text-foreground">Reliability</a>
          </nav>
          <Link href={cta} className={cn(buttonVariants({ size: "sm" }), "ml-auto md:ml-6")}>{home ? "Open the app" : "Sign in"}</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-[#A6C8E2]/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-[#F4BAA3]/30 blur-3xl" />
        <div className="relative mx-auto grid w-full max-w-[1760px] items-center gap-10 px-6 lg:px-12 2xl:px-20 py-16 md:grid-cols-2 md:py-24 lg:gap-16 xl:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Smart roster management for multi-brand CX teams
            </span>
            <h1 className="mt-4 text-4xl leading-tight font-bold tracking-tight md:text-5xl xl:text-6xl">
              Monthly rosters that <span className="text-primary">never leave a brand uncovered.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground lg:text-xl">
              Plan weekly offs, leaves and backups across every brand, process and pod. Nexus generates the roster, checks every rule,
              explains each conflict and re-plans with minimal change when life happens.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={cta} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>{ctaLabel} <ArrowRight className="size-4" /></Link>
              <a href="#how" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5")}>See how it works</a>
            </div>
            <dl className="mt-8 grid max-w-md grid-cols-3 gap-4">
              {[["Employees", stats.employees], ["Brands", stats.brands], ["Brand-processes", stats.processes]].map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-2xl font-semibold">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-1 text-xs text-muted-foreground">Live counts from the demo dataset.</p>
          </div>

          {/* Preview card */}
          <div className="rounded-2xl border bg-card p-5 shadow-xl shadow-[#619DC6]/10 lg:p-7">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-semibold lg:text-base">Roster · Week 1</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">0 coverage gaps</span>
            </div>
            <div className="space-y-2.5">
              {["Riya · Bloom Botanics", "Kabir · Urban Kurta", "Nisha · GlowLeaf"].map((who, r) => (
                <div key={who} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 truncate text-xs text-muted-foreground lg:w-44 lg:text-sm">{who}</span>
                  <div className="grid flex-1 grid-cols-7 gap-1">
                    {DEMO[r].map(([t, tone], i) => <span key={i} className={cn("rounded py-1 text-center font-mono text-[11px] lg:py-2 lg:text-xs", TONE[tone])}>{t}</span>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-[#F4BAA3] bg-accent p-3 text-xs text-accent-foreground lg:mt-5 lg:p-4 lg:text-sm">
              <b>Conflict caught:</b> Kesar Kitchen CS needs 1 on 10 Dec but its only owner is on leave. Suggested fix: assign a backup from Pod Delta.
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y bg-muted/60">
        <div className="mx-auto grid w-full max-w-[1760px] gap-6 px-6 lg:px-12 2xl:px-20 py-12 md:grid-cols-3">
          {[
            ["One weekly off can uncover a brand", "80% of brands are run by one person. Their day off is the brand's day off, unless someone plans a backup."],
            ["Every brand runs on its own calendar", "365-day support, no-holiday operations, Mon-Sat processes: all in one team, all in one month."],
            ["Spreadsheets don't say what broke", "When leave changes, finding the gap and a fair fix by hand takes hours, and mistakes reach clients."],
          ].map(([t, b]) => (
            <div key={t}><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-muted-foreground">{b}</p></div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto w-full max-w-[1760px] scroll-mt-20 px-6 lg:px-12 2xl:px-20 py-16">
        <h2 className="text-center text-3xl font-bold">How it works</h2>
        <p className="mx-auto mt-2 max-w-3xl text-center text-muted-foreground">From rules to a published roster in four steps, with a human approving what matters.</p>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Icon className="size-5" /></span>
                <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
              </div>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-secondary/50">
        <div className="mx-auto w-full max-w-[1760px] px-6 lg:px-12 2xl:px-20 py-16">
          <h2 className="text-center text-3xl font-bold">Built for the operational problem</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md">
                <Icon className="size-6 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reliability */}
      <section id="trust" className="mx-auto w-full max-w-[1760px] scroll-mt-20 px-6 lg:px-12 2xl:px-20 py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-3xl font-bold">Reliable by design</h2>
            <p className="mt-2 text-muted-foreground">A roster that looks good but breaks a rule is worse than no roster. So Nexus never hides a problem.</p>
          </div>
          <ul className="space-y-3 text-sm">
            {[
              "Generator and checker share one rule book, but the checker never trusts the generator.",
              "If coverage can't be met, the gap is flagged with the reason and possible fixes, never silently dropped.",
              "Rosters are drafts until a manager publishes; publishing re-checks against today's rules.",
              "Every version is kept; changes are highlighted cell by cell and people are notified.",
              "The database blocks double saves, double publishes and duplicate leave requests.",
            ].map((t) => <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />{t}</li>)}
          </ul>
        </div>
      </section>

      <section className="px-6 pb-16 lg:px-12 2xl:px-20">
        <div className="mx-auto flex w-full max-w-[1760px] flex-col items-center gap-4 rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground">
          <h2 className="text-3xl font-bold">See a full month planned in seconds</h2>
          <p className="max-w-xl text-primary-foreground/80">Sign in with the demo accounts listed on the next page: one manager, and one login per employee.</p>
          <Link href={cta} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-11 px-6")}>{ctaLabel} <ArrowRight className="size-4" /></Link>
        </div>
      </section>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        DataStraw Nexus · Next.js, PostgreSQL and a Python OR-Tools engine · Demo data is fictional.
      </footer>
    </div>
  );
}
