// N-1 stress test page: "if any one person calls in sick tomorrow, what breaks?"
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, rosters } from "@/db";
import { Field } from "@/components/form";
import { RosterGrid } from "@/components/roster-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireManager } from "@/lib/auth";
import { getDirectory, param, parseMonth } from "@/lib/data";
import type { Coverage, Roster } from "@/lib/engine";
import { stressTest, type Risk } from "@/lib/resilience";
import type { GridCell, Tone } from "@/lib/views";
import { cn } from "@/lib/utils";

const LOOK: Record<Risk, [string, Tone, string]> = {
  SAFE: ["·", "ok", "Safe: coverage holds without them"],
  ABSORB: ["A", "backup", "Absorbed: a colleague already working can pick it up"],
  SWAP: ["S", "leave", "Swap: someone must give up a weekly off / holiday"],
  BREAK: ["X", "gap", "Break: nobody assigned can cover"],
};
const CHIP: Record<string, string> = {
  ok: "text-emerald-700 dark:text-emerald-300", backup: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  leave: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100", gap: "bg-red-600 text-white",
};

export default async function ResiliencePage({ searchParams }: PageProps<"/resilience">) {
  await requireManager();
  const sp = await searchParams;
  const { year, month, key } = parseMonth(param(sp, "month"));
  const [dir, versions] = await Promise.all([
    getDirectory(),
    db.select().from(rosters).where(and(eq(rosters.year, year), eq(rosters.month, month))).orderBy(desc(rosters.version)),
  ]);
  const current = versions.find((v) => String(v.version) === param(sp, "v")) ?? versions[0];
  const title = new Date(Date.UTC(year, month - 1)).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">Stress test · {title}{current && ` · v${current.version}`}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A roster can pass every rule and still be one sick call away from a gap. For every person on every working day,
          this asks: <i>if they are absent, does a brand drop below its minimum, and can the team absorb it?</i>
        </p>
      </div>
      <form className="flex items-end gap-2">
        <Field label="Month"><Input type="month" name="month" defaultValue={key} className="w-44" /></Field>
        <Button variant="outline" type="submit">Go</Button>
      </form>
    </div>
  );
  if (!current) return <div className="space-y-4">{header}<Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
    No roster for {title} yet. <Link href={`/roster?month=${key}`} className="underline">Generate one</Link> first.</CardContent></Card></div>;

  const r = current.data as Roster;
  const t = stressTest({
    roster: r, coverage: current.coverage as Coverage, assignments: dir.assignments,
    brandOf: (bp) => dir.bp.get(bp)?.brandId ?? bp,
    maxBackup: (e) => dir.emp.get(e)?.maxBackup ?? 1,
  });
  const name = (e: string) => dir.emp.get(e)?.name ?? e;
  const sections = dir.pods.map((p) => ({
    title: `${p.name} · lead ${name(p.leadId ?? "")}`,
    rows: Object.keys(t.grid).filter((e) => dir.emp.get(e)?.podId === p.id).map((e) => ({
      key: e, label: name(e), href: `/roster?month=${key}&view=employee&id=${e}`,
      cells: t.grid[e].map((c, i): GridCell => {
        if (!c) return { text: "", tone: "none", title: `${r.days[i]}: not working` };
        const [text, tone, label] = LOOK[c.risk];
        const why = c.hits.map((h) => `${dir.bpLabel(h.bp)}: ${h.risk.toLowerCase()}`).join("; ");
        return { text, tone, title: `${r.days[i]}: if ${name(e)} is absent. ${label}${why ? `. ${why}` : ""}` };
      }),
    })),
  }));

  return (
    <div className="space-y-4">
      {header}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Card><CardContent className="py-3">
          <div className={cn("text-2xl font-semibold", t.score >= 80 ? "text-emerald-700 dark:text-emerald-300" : t.score >= 50 ? "text-amber-600" : "text-destructive")}>{t.score}%</div>
          <div className="text-xs text-muted-foreground">Resilience: sick calls handled without calling anyone in</div>
        </CardContent></Card>
        {(Object.keys(LOOK) as Risk[]).map((k) => (
          <Card key={k}><CardContent className="py-3">
            <div className="text-2xl font-semibold">{t.counts[k]}</div>
            <div className="text-xs text-muted-foreground">{LOOK[k][2]}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Single points of failure</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {t.people.length === 0 && <p className="text-emerald-700 dark:text-emerald-300">Nobody: any one absence can be covered by people already working.</p>}
            {t.people.slice(0, 8).map((p) => (
              <div key={p.employee} className="flex items-baseline justify-between gap-3 border-t pt-2 first:border-t-0 first:pt-0">
                <div>
                  <Link href={`/roster?month=${key}&view=employee&id=${p.employee}`} className="font-medium hover:underline">{name(p.employee)}</Link>
                  {p.bps.length > 0 && <div className="text-xs text-muted-foreground">No cover for {p.bps.map(dir.bpLabel).join(", ")}</div>}
                </div>
                <div className="shrink-0 text-xs"><b className="text-destructive">{p.breaks}</b> break · <b>{p.swaps}</b> swap days</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">What to fix first</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {t.fragile.length === 0 && <p className="text-muted-foreground">Every brand-process has a fallback on every day.</p>}
            {t.fragile.slice(0, 8).map(([bp, days]) => (
              <div key={bp} className="flex items-baseline justify-between gap-3 border-t pt-2 first:border-t-0 first:pt-0">
                <div>
                  <span className="font-medium">{dir.bpLabel(bp)}</span>
                  <div className="text-xs text-muted-foreground">Add a backup from the same pod on <Link href="/brands" className="underline">Brands &amp; rules</Link>.</div>
                </div>
                <span className="shrink-0 text-xs"><b className="text-destructive">{days}</b> days with no fallback</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(LOOK) as Risk[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className={cn("rounded px-1.5 py-0.5 font-mono", CHIP[LOOK[k][1]])}>{LOOK[k][0]}</span>{LOOK[k][2]}</span>
        ))}
        <span>Blank = not working. Hover a cell for the brands affected.</span>
      </div>
      <RosterGrid days={r.days} holidays={new Set(dir.holidays.map((h) => h.date))} sections={sections} />
    </div>
  );
}
