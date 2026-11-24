import { desc } from "drizzle-orm";
import { db, leaves } from "@/db";
import { decideLeave, requestLeave } from "@/app/actions";
import { Field, Select, SubmitButton } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireSession } from "@/lib/auth";
import { getDirectory } from "@/lib/data";

type Leave = typeof leaves.$inferSelect;

/** Group day-rows into requests (one batch = one request). Seeded leaves have no batch: one row each. */
function requests(rows: Leave[]) {
  const map = new Map<string, Leave[]>();
  for (const r of rows) map.set(r.batch ?? `single-${r.id}`, [...(map.get(r.batch ?? `single-${r.id}`) ?? []), r]);
  return [...map.entries()].map(([batch, days]) => ({ batch, days: days.sort((a, b) => a.date.localeCompare(b.date)) }));
}

export default async function LeavesPage() {
  const s = await requireSession();
  const manager = s.role === "MANAGER";
  const [dir, rows] = await Promise.all([getDirectory(), db.select().from(leaves).orderBy(desc(leaves.createdAt))]);
  const all = requests(manager ? rows : rows.filter((r) => r.employeeId === s.employeeId));
  const people = dir.employees.filter((e) => e.active && (manager || e.id === s.employeeId));
  const pending = all.filter((r) => r.days[0].status === "PENDING");
  const decided = all.filter((r) => r.days[0].status !== "PENDING").slice(0, 20);
  const span = (d: Leave[]) => d.length === 1 ? d[0].date : `${d[0].date} → ${d.at(-1)!.date} (${d.length} days)`;

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Leaves & comp-offs</h1>
        <p className="text-sm text-muted-foreground">{manager ? "" : "Your requests go to your manager. "}Approving a request re-plans that month&rsquo;s roster with the fewest possible changes and shows what moved.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Request leave</CardTitle></CardHeader>
        <CardContent>
          <form action={requestLeave} className="flex flex-wrap items-end gap-3">
            <Field label="Employee"><Select name="employeeId">{people.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
            <Field label="From"><Input type="date" name="from" required /></Field>
            <Field label="To"><Input type="date" name="to" required /></Field>
            <Field label="Type"><Select name="type"><option value="LEAVE">Leave</option><option value="COMP_OFF">Comp-off</option></Select></Field>
            <Field label="Reason"><Input name="reason" maxLength={200} placeholder="optional" /></Field>
            <SubmitButton pending="Sending…">Request</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Waiting for approval ({pending.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
          {pending.map(({ batch, days }) => (
            <form key={batch} action={decideLeave} className="flex flex-wrap items-center gap-3 border-b pb-2 text-sm">
              <input type="hidden" name="batch" value={batch} />
              <span className="font-medium">{dir.emp.get(days[0].employeeId)?.name}</span>
              <Badge variant="outline">{days[0].type === "COMP_OFF" ? "Comp-off" : "Leave"}</Badge>
              <span>{span(days)}</span>
              {days[0].reason && <span className="text-muted-foreground">“{days[0].reason}”</span>}
              {manager && (
                <span className="ml-auto flex gap-2">
                  <SubmitButton size="sm" name="decision" value="APPROVED" pending="Approving & re-planning…">Approve</SubmitButton>
                  <SubmitButton size="sm" variant="outline" name="decision" value="REJECTED" pending="…">Reject</SubmitButton>
                </span>
              )}
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent decisions</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {decided.map(({ batch, days }) => (
            <form key={batch} action={decideLeave} className="flex flex-wrap items-center gap-3">
              <Badge variant={days[0].status === "APPROVED" ? "default" : days[0].status === "CANCELLED" ? "secondary" : "destructive"}>{days[0].status.toLowerCase()}</Badge>
              <span>{dir.emp.get(days[0].employeeId)?.name}</span>
              <span className="text-muted-foreground">{span(days)}</span>
              {manager && days[0].status === "APPROVED" && (
                <>
                  <input type="hidden" name="batch" value={batch} />
                  <SubmitButton size="xs" variant="ghost" name="decision" value="CANCELLED" pending="Cancelling & re-planning…" className="ml-auto"
                    title="Plans changed: give the days back and re-plan the roster">Cancel leave</SubmitButton>
                </>
              )}
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
