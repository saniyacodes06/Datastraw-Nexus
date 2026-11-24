// "What changed in this version": edited cells + problems that appeared or went away.
import type { Directory } from "@/lib/data";
import type { Change, Issue } from "@/lib/engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const key = (i: Issue) => `${i.type}|${i.date}|${i.bp}|${i.employee}`;
const cellText = (c: Change["after"] | null, dir: Directory) =>
  !c ? "—" : c.status === "WORK" ? `WORK (${c.covers.map(dir.bpLabel).join(", ") || "pod duties"})` : c.status;

export function ChangeSummary({ changes, now, before, version, fresh, dir }: {
  changes: Change[]; now: Issue[]; before: Issue[] | null; version: number; fresh: boolean; dir: Directory;
}) {
  if (!before) return null; // first version: nothing to compare
  const was = new Set(before.map(key));
  const is = new Set(now.map(key));
  const added = now.filter((i) => !was.has(key(i)) && i.severity === "CRITICAL");
  const fixed = before.filter((i) => !is.has(key(i)) && i.severity === "CRITICAL");
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">What changed since v{version - 1}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 text-sm md:grid-cols-3">
        <div>
          <div className="mb-1 font-medium">{fresh ? "Generated from scratch" : `${changes.length} cell(s) changed`}</div>
          {fresh && <p className="text-xs text-muted-foreground">New plan, not compared cell by cell. Use Re-plan to keep changes small.</p>}
          <ul className="space-y-1 text-xs">
            {changes.slice(0, 12).map((c) => (
              <li key={`${c.employee}${c.date}`}>
                <b>{dir.emp.get(c.employee)?.name ?? c.employee}</b> · {c.date.slice(5)}: {cellText(c.before, dir)} → <b>{cellText(c.after, dir)}</b>
              </li>
            ))}
            {changes.length > 12 && <li className="text-muted-foreground">…and {changes.length - 12} more</li>}
          </ul>
        </div>
        <div>
          <div className="mb-1 font-medium text-destructive">{added.length} new critical problem(s)</div>
          <ul className="space-y-1 text-xs">{added.map((i) => <li key={key(i)}>{i.message}</li>)}</ul>
        </div>
        <div>
          <div className="mb-1 font-medium text-emerald-700 dark:text-emerald-300">{fixed.length} critical problem(s) resolved</div>
          <ul className="space-y-1 text-xs">{fixed.map((i) => <li key={key(i)}>{i.message}</li>)}</ul>
        </div>
      </CardContent>
    </Card>
  );
}
