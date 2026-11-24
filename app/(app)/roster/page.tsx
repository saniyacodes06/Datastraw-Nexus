import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, rosters } from "@/db";
import { generateRoster, publishRoster, replan } from "@/app/actions";
import { ChangeSummary } from "@/components/change-summary";
import { EditCellForm } from "@/components/edit-cell-form";
import { Field, Select, SubmitButton } from "@/components/form";
import { IssueList } from "@/components/issue-list";
import { Legend, RosterGrid } from "@/components/roster-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireSession } from "@/lib/auth";
import { getDirectory, param, parseMonth, type Directory } from "@/lib/data";
import type { Change, Coverage, Issue, Roster } from "@/lib/engine";
import { buildView, employeeSummary, VIEWS, type View } from "@/lib/views";
import { cn } from "@/lib/utils";

export default async function RosterPage({ searchParams }: PageProps<"/roster">) {
  const session = await requireSession();
  const sp = await searchParams;
  const { year, month, key } = parseMonth(param(sp, "month"));
  if (session.role === "EMPLOYEE") return <MyRoster employee={session.employeeId!} year={year} month={month} monthKey={key} />;
  const view = (VIEWS as readonly string[]).includes(param(sp, "view") ?? "") ? (param(sp, "view") as View) : "company";
  const [dir, versions] = await Promise.all([
    getDirectory(),
    db.select().from(rosters).where(and(eq(rosters.year, year), eq(rosters.month, month))).orderBy(desc(rosters.version)),
  ]);
  const current = versions.find((v) => String(v.version) === param(sp, "v")) ?? versions[0];
  const title = new Date(Date.UTC(year, month - 1)).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  const qs = (extra: Record<string, string>) => "?" + new URLSearchParams({ month: key, view, ...extra }).toString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Roster · {title}</h1>
          <p className="text-sm text-muted-foreground">Generate, check conflicts, then publish.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex items-end gap-2">
            <input type="hidden" name="view" value={view} />
            <Field label="Month"><Input type="month" name="month" defaultValue={key} className="w-44" /></Field>
            <Button variant="outline" type="submit">Go</Button>
          </form>
          {current && (
            <form action={replan}>
              <input type="hidden" name="month" value={key} /><input type="hidden" name="view" value={view} /><input type="hidden" name="id" value={param(sp, "id") ?? ""} />
              <SubmitButton variant="outline" pending="Re-planning…" title="Apply new leaves/rules with the fewest changes">Re-plan (minimal change)</SubmitButton>
            </form>
          )}
          <form action={generateRoster} data-tour="generate">
            <input type="hidden" name="month" value={key} /><input type="hidden" name="view" value={view} /><input type="hidden" name="id" value={param(sp, "id") ?? ""} />
            <SubmitButton pending="Solving… (~5s)">{current ? "Generate from scratch" : "Generate roster"}</SubmitButton>
          </form>
        </div>
      </div>

      {!current ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No roster for {title} yet. Click <b>Generate roster</b>: the engine will plan weekly offs and backups for all {dir.employees.filter((e) => e.active).length} employees.
        </CardContent></Card>
      ) : (
        <RosterBody current={current} versions={versions.map((v) => ({ version: v.version, status: v.status }))}
          previous={(versions.find((v) => v.version === current.version - 1)?.issues as Issue[]) ?? null}
          view={view} id={param(sp, "id")} dir={dir} qs={qs} />
      )}
    </div>
  );
}

async function RosterBody({ current, versions, previous, view, id, dir, qs }: {
  current: typeof rosters.$inferSelect; versions: { version: number; status: string }[]; previous: Issue[] | null;
  view: View; id?: string; dir: Awaited<ReturnType<typeof getDirectory>>; qs: (x: Record<string, string>) => string;
}) {
  const r = current.data as Roster;
  const issues = current.issues as Issue[];
  const changes = current.changes as Change[];
  const { sections, options, pick } = buildView(view, id, r, current.coverage as Coverage, dir, changes);
  const shown = new Set(sections.flatMap((s) => s.rows.map((row) => row.key)));
  const relevant = view === "company" ? issues : issues.filter((i) => shown.has(i.bp ?? "") || shown.has(i.employee ?? ""));
  const critical = issues.filter((i) => i.severity === "CRITICAL").length;
  const summary = view === "employee" && pick ? employeeSummary(pick, r) : null;

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3 text-sm">
          <div className="flex items-center gap-2">
            Version
            {versions.map((v) => (
              <Link key={v.version} href={qs({ v: String(v.version) })}
                className={cn("rounded px-2 py-0.5 hover:bg-muted", v.version === current.version && "bg-muted font-semibold")}>
                v{v.version}{v.status === "PUBLISHED" && " ✓"}
              </Link>
            ))}
          </div>
          <Badge variant={current.status === "PUBLISHED" ? "default" : "outline"}>{current.status}</Badge>
          <span className={critical ? "font-medium text-destructive" : "text-emerald-700 dark:text-emerald-300"}>{critical} critical</span>
          <span className="text-muted-foreground">{issues.length - critical} warnings</span>
          <span className="text-muted-foreground">{r.comp_offs_earned.length} comp-offs earned</span>
          <Link href={`/resilience?month=${r.year}-${String(r.month).padStart(2, "0")}&v=${current.version}`} className="text-sm underline">Stress test this version</Link>
          <a href={`/roster/export?month=${r.year}-${String(r.month).padStart(2, "0")}&v=${current.version}`} download className="text-sm underline">Download CSV</a>
          {current.note && <span className="text-xs text-muted-foreground">{current.note}</span>}
          {current.status !== "PUBLISHED" && (
            <form action={publishRoster} className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto" data-tour="publish">
              <input type="hidden" name="id" value={current.id} />
              {critical > 0 && <Input name="reason" required placeholder="Reason to publish with conflicts" className="min-w-0 flex-1 sm:w-64 sm:flex-none" />}
              <SubmitButton pending="Publishing…" variant={critical ? "destructive" : "default"}>Publish v{current.version}</SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex max-w-full overflow-x-auto rounded-lg border p-0.5" data-tour="views">
          {VIEWS.map((v) => (
            <Link key={v} href={qs({ view: v, v: String(current.version) })}
              className={cn("rounded-md px-3 py-1 text-sm capitalize", v === view ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
              {v}
            </Link>
          ))}
        </div>
        {options.length > 0 && (
          <form className="flex items-end gap-2">
            {Object.entries({ month: `${r.year}-${String(r.month).padStart(2, "0")}`, view, v: String(current.version) }).map(([k, val]) =>
              <input key={k} type="hidden" name={k} value={val} />)}
            <Select auto name="id" defaultValue={pick} aria-label={`Choose ${view}`}>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </form>
        )}
        <div className="ml-auto"><Legend /></div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[["Working days", summary.work], ["Weekly offs", summary.weekOff], ["Leave / comp-off", summary.leave], ["Holidays", summary.holiday],
            ["Comp-offs earned", summary.compOffEarned.length]].map(([label, n]) => (
            <Card key={label}><CardContent className="py-3"><div className="text-2xl font-semibold">{n}</div><div className="text-xs text-muted-foreground">{label}</div></CardContent></Card>
          ))}
        </div>
      )}

      <ChangeSummary changes={changes} now={issues} before={previous} version={current.version} fresh={!!current.note?.startsWith("Generated")} dir={dir} />

      <RosterGrid days={r.days} holidays={new Set(dir.holidays.map((h) => h.date))} sections={sections} />

      {view === "employee" && pick && r.entries[pick] && <EditCellForm rosterId={current.id} employee={pick} days={r.days} dir={dir} />}

      <Card data-tour="conflicts">
        <CardHeader><CardTitle className="text-base">Conflicts {view !== "company" && <span className="font-normal text-muted-foreground">(for this {view})</span>}</CardTitle></CardHeader>
        <CardContent><IssueList issues={relevant} /></CardContent>
      </Card>
    </>
  );
}

/** Employee's own page: only the PUBLISHED roster, only their row. */
async function MyRoster({ employee, year, month, monthKey }: { employee: string; year: number; month: number; monthKey: string }) {
  const [dir, [pub]] = await Promise.all([
    getDirectory(),
    db.select().from(rosters).where(and(eq(rosters.year, year), eq(rosters.month, month), eq(rosters.status, "PUBLISHED"))).limit(1),
  ]);
  const title = new Date(Date.UTC(year, month - 1)).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My roster · {title}</h1>
          <p className="text-sm text-muted-foreground">{dir.emp.get(employee)?.name}. Need a day off? Request it on the Leaves page.</p>
        </div>
        <form className="flex items-end gap-2">
          <Field label="Month"><Input type="month" name="month" defaultValue={monthKey} className="w-44" /></Field>
          <Button variant="outline" type="submit">Go</Button>
        </form>
      </div>
      {!pub ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">The {title} roster is not published yet. You will get a notification when it is.</CardContent></Card>
      ) : <MyRows r={pub.data as Roster} cov={pub.coverage as Coverage} employee={employee} dir={dir} />}
    </div>
  );
}

function MyRows({ r, cov, employee, dir }: { r: Roster; cov: Coverage; employee: string; dir: Directory }) {
  const { sections } = buildView("employee", employee, r, cov, dir);
  const s = employeeSummary(employee, r);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Working days", s.work], ["Weekly offs", s.weekOff], ["Leave / comp-off", s.leave], ["Comp-offs earned", s.compOffEarned.length]].map(([label, n]) => (
          <Card key={label}><CardContent className="py-3"><div className="text-2xl font-semibold">{n}</div><div className="text-xs text-muted-foreground">{label}</div></CardContent></Card>
        ))}
      </div>
      <Legend />
      <RosterGrid days={r.days} holidays={new Set(dir.holidays.map((h) => h.date))} sections={sections} />
    </>
  );
}
