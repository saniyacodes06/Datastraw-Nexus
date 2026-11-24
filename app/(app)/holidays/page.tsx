import { addHoliday, removeHoliday } from "@/app/actions";
import { Field, SubmitButton } from "@/components/form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireManager } from "@/lib/auth";
import { getDirectory } from "@/lib/data";

export default async function HolidaysPage() {
  await requireManager();
  const { holidays } = await getDirectory();
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Public holidays</h1>
        <p className="text-sm text-muted-foreground">Processes on a &ldquo;no public holidays&rdquo; calendar close on these days. Anyone who works one earns a comp-off.</p>
      </div>
      <Card><CardContent className="space-y-3 py-4">
        {holidays.length === 0 && <p className="text-sm text-muted-foreground">No holidays yet.</p>}
        {holidays.map((h) => (
          <form key={h.date} action={removeHoliday} className="flex items-center justify-between border-b pb-2 text-sm">
            <input type="hidden" name="date" value={h.date} />
            <span><span className="font-mono">{h.date}</span> · {h.name}</span>
            <SubmitButton size="sm" variant="ghost" pending="…">Remove</SubmitButton>
          </form>
        ))}
        <form action={addHoliday} className="flex flex-wrap items-end gap-2 pt-2">
          <Field label="Date"><Input type="date" name="date" required /></Field>
          <Field label="Name"><Input name="name" required minLength={2} placeholder="Diwali" /></Field>
          <SubmitButton pending="Adding…">Add holiday</SubmitButton>
        </form>
      </CardContent></Card>
    </div>
  );
}
