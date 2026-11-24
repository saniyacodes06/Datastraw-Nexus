// Manual edit of one employee-day. Saves a new version and shows its impact.
import { editCell } from "@/app/actions";
import { Field, Select, SubmitButton } from "@/components/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Directory } from "@/lib/data";

export function EditCellForm({ rosterId, employee, days, dir }: { rosterId: number; employee: string; days: string[]; dir: Directory }) {
  const mine = dir.assignments.filter((a) => a.employeeId === employee);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Change {dir.emp.get(employee)?.name}&rsquo;s day</CardTitle></CardHeader>
      <CardContent>
        <form action={editCell} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="rosterId" value={rosterId} />
          <input type="hidden" name="employee" value={employee} />
          <input type="hidden" name="view" value="employee" /><input type="hidden" name="id" value={employee} />
          <Field label="Date"><Select name="date">{days.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
          <Field label="Set to"><Select name="status">
            <option value="WEEK_OFF">Weekly off</option><option value="WORK">Work</option>
            <option value="LEAVE">Leave</option><option value="COMP_OFF">Comp-off</option><option value="HOLIDAY">Holiday</option>
          </Select></Field>
          <fieldset className="flex flex-wrap gap-3 text-xs">
            <legend className="mb-1 font-medium text-muted-foreground">If working, covers</legend>
            {mine.map((a) => (
              <label key={a.bpId} className="flex items-center gap-1">
                <input type="checkbox" name="covers" value={a.bpId} defaultChecked={a.role === "PRIMARY"} />
                {dir.bpLabel(a.bpId)}{a.role === "BACKUP" && " (backup)"}
              </label>
            ))}
          </fieldset>
          <SubmitButton pending="Checking…">Apply & check</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Saved as a new draft version. The checker shows any gap or rule it breaks; nothing is overwritten.</p>
      </CardContent>
    </Card>
  );
}
