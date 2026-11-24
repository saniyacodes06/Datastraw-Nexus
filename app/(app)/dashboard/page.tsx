import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auditLog, db, leaves, rosters } from "@/db";
import { Field, Select } from "@/components/form";
import { MeterList } from "@/components/meter-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getDirectory, param, parseMonth } from "@/lib/data";
import type { Coverage, Issue, Roster } from "@/lib/engine";
import { coveragePct, dayView, perEmployee } from "@/lib/stats";

function Tile({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: "bad" | "good" }) {
  return (
    <Card><CardContent className="py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {note && <div className={tone === "bad" ? "text-xs text-destructive" : tone === "good" ? "text-xs text-emerald-700 dark:text-emerald-300" : "text-xs text-muted-foreground"}>{note}</div>}
    </CardContent></Card>
  );
}

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const s = await requireSession();
  if (s.role !== "MANAGER") redirect("/roster");
  const sp = await searchParams;
  const { year, month, key } = parseMonth(param(sp, "month"));
  const [dir, [latest], [{ pending }], activity] = await Promise.all([
    getDirectory(),
    db.select().from(rosters).where(and(eq(rosters.year, year), eq(rosters.month, month))).orderBy(desc(rosters.version)).limit(1),
    db.select({ pending: count() }).from(leaves).where(eq(leaves.status, "PENDING")),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(8),
  ]);
  const title = new Date(Date.UTC(year, month - 1)).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  const singles = dir.brands.filter((b) => new Set(dir.assignments.filter((a) => a.role === "PRIMARY" && dir.bp.get(a.bpId)?.brandId === b.id).map((a) => a.employeeId)).size === 1).length;
  const r = latest?.data as Roster | undefined;
  const cov = latest?.coverage as Coverage | undefined;
  const critical = latest ? (latest.issues as Issue[]).filter((i) => i.severity === "CRITICAL").length : 0;
  const today = new Date().toISOString().slice(0, 10);
  const day = param(sp, "day") ?? (r?.days.includes(today) ? today : r?.days[0]);
  const dv = r && cov && day ? dayView(r, cov, dir, day) : null;
  const people = r ? perEmployee(r, dir) : [];
  const busiest = [...people].sort((a, b) => b.backupDays - a.backupDays).slice(0, 8);
  const sundays = people.map((p) => p.sundaysOff);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard · {title}</h1>
          <p className="text-sm text-muted-foreground">Coverage, people and pending work at a glance.</p>
        </div>
        <form className="flex items-end gap-2">
          <Field label="Month"><input type="month" name="month" defaultValue={key} className="h-8 rounded-lg border px-2 text-sm" /></Field>
          <button className="h-8 rounded-lg border px-3 text-sm hover:bg-muted">Go</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Active employees" value={dir.employees.filter((e) => e.active).length} note={`${dir.pods.length} pods`} />
        <Tile label="Brands" value={dir.brands.length} note={`${singles} run by one person`} />
        <Tile label="Pending leave requests" value={pending} note={pending ? "Needs a decision" : "All decided"} tone={pending ? "bad" : "good"} />
        <Tile label="Roster" value={latest ? `v${latest.version}` : "—"} note={latest ? latest.status.toLowerCase() : "Not generated"} />
        <Tile label="Coverage" value={cov ? `${coveragePct(cov)}%` : "—"} note="of required person-days" />
        <Tile label="Critical conflicts" value={latest ? critical : "—"} note={latest ? (critical ? "Open the roster to fix" : "None") : undefined} tone={critical ? "bad" : "good"} />
      </div>

      {!r ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No roster for {title} yet. <Link href={`/roster?month=${key}`} className="underline">Generate one</Link>.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Who is working</CardTitle>
              <form className="flex items-center gap-2">
                <input type="hidden" name="month" value={key} />
                <Select auto name="day" defaultValue={day} aria-label="Day">{r.days.map((d) => <option key={d} value={d}>{d}</option>)}</Select>
              </form>
            </CardHeader>
            {dv && <CardContent className="space-y-3 text-sm">
              <p><b>{dv.working.length}</b> working · <b>{dv.off.length}</b> off</p>
              {dv.gaps.length > 0
                ? <p className="text-destructive">Short staffed: {dv.gaps.join(", ")}</p>
                : <p className="text-emerald-700 dark:text-emerald-300">Every open brand-process is covered.</p>}
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Off today</div>
                <div className="flex flex-wrap gap-1.5">{dv.off.map((o) => <span key={o.name} className="rounded-full border px-2 py-0.5 text-xs">{o.name} · {o.why}</span>)}</div>
              </div>
            </CardContent>}
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Backup duty this month <span className="font-normal text-muted-foreground">(days covering another brand)</span></CardTitle></CardHeader>
            <CardContent>
              <MeterList max={Math.max(1, ...busiest.map((p) => p.backupDays))}
                rows={busiest.map((p) => ({ label: p.name, value: p.backupDays, title: `${p.name}: ${p.backupDays} backup days, ${p.work} working days` }))} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Weekend fairness</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Sundays off per person: <b>{Math.min(...sundays)}</b> to <b>{Math.max(...sundays)}</b> (average {(sundays.reduce((a, b) => a + b, 0) / sundays.length).toFixed(1)}).</p>
              <p className="text-xs text-muted-foreground">
                No Sunday off: {people.filter((p) => p.sundaysOff === 0).map((p) => p.name).join(", ") || "nobody"}.
                Usually people on 7-day brands whose backup is busy on Sundays.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {activity.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
              {activity.map((a) => (
                <div key={a.id} className="flex gap-2">
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{a.createdAt.toISOString().slice(5, 16).replace("T", " ")}</span>
                  <span><b>{a.actor}</b> {a.action.toLowerCase()}{a.detail ? `: ${a.detail}` : ""}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
