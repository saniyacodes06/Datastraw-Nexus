// Conflicts from the validator: critical ones open, warnings folded.
import type { Issue } from "@/lib/engine";
import { Badge } from "@/components/ui/badge";

function Item({ issue }: { issue: Issue }) {
  return (
    <li className="space-y-1 border-t py-2 first:border-t-0">
      <div className="flex items-start gap-2">
        <Badge variant={issue.severity === "CRITICAL" ? "destructive" : "secondary"}>{issue.type.replaceAll("_", " ")}</Badge>
        <span className="text-sm">{issue.message}</span>
      </div>
      {!!issue.suggestions?.length && (
        <ul className="ml-4 list-disc text-xs text-muted-foreground">
          {issue.suggestions.map((s) => <li key={s}>{s}</li>)}
        </ul>
      )}
    </li>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  const critical = issues.filter((i) => i.severity === "CRITICAL");
  const warnings = issues.filter((i) => i.severity !== "CRITICAL");
  if (!issues.length) return <p className="text-sm text-emerald-700 dark:text-emerald-300">No conflicts: every rule and coverage requirement is met.</p>;
  return (
    <div className="space-y-3">
      {critical.length > 0 && <ul>{critical.map((i, k) => <Item key={k} issue={i} />)}</ul>}
      {warnings.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">{warnings.length} warning(s): preferences and soft rules</summary>
          <ul className="mt-2">{warnings.map((i, k) => <Item key={k} issue={i} />)}</ul>
        </details>
      )}
    </div>
  );
}
