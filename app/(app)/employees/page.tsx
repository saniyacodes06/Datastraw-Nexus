import { requireManager } from "@/lib/auth";
import Link from "next/link";
import { saveEmployee, toggleEmployee } from "@/app/actions";
import { Field, Select, SubmitButton } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DAYS, getDirectory, param } from "@/lib/data";

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  await requireManager();
  const sp = await searchParams;
  const dir = await getDirectory();
  const editing = dir.emp.get(param(sp, "edit") ?? "");
  const tags = (id: string, role: string) => dir.assignments.filter((a) => a.employeeId === id && a.role === role).map((a) => dir.bpLabel(a.bpId));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Employees</h1>
        <p className="text-sm text-muted-foreground">{dir.employees.filter((e) => e.active).length} active · assign brands on the Brands page.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{editing ? `Edit ${editing.name}` : "Add employee"}</CardTitle></CardHeader>
        <CardContent>
          <form action={saveEmployee} key={editing?.id ?? "new"} className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name" className="col-span-2"><Input name="name" required minLength={2} defaultValue={editing?.name} /></Field>
            <Field label="Email" className="col-span-2"><Input name="email" type="email" required defaultValue={editing?.email} /></Field>
            <Field label="Pod"><Select name="podId" defaultValue={editing?.podId ?? dir.pods[0]?.id}>{dir.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Role"><Select name="role" defaultValue={editing?.role ?? "Executive"}><option>Executive</option><option>Pod Lead</option></Select></Field>
            <Field label="Preferred off"><Select name="preferredOff" defaultValue={editing?.preferredOff ?? ""}>
              <option value="">No preference</option>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select></Field>
            <Field label="Max days in a row"><Input name="maxConsecutive" type="number" min={1} max={13} defaultValue={editing?.maxConsecutive ?? 6} /></Field>
            <Field label="Backup brands / day"><Input name="maxBackup" type="number" min={0} max={5} defaultValue={editing?.maxBackup ?? 1} /></Field>
            <Field label={editing ? "New password (blank = keep)" : "Password"} className="col-span-2">
              <Input name="password" type="password" autoComplete="new-password" minLength={8} required={!editing} />
            </Field>
            <div className="col-span-2 flex items-end gap-2 md:col-span-4 lg:col-span-8">
              <SubmitButton pending="Saving…">{editing ? "Save changes" : "Add employee"}</SubmitButton>
              {editing && <Link href="/employees" className="text-sm text-muted-foreground hover:underline">Cancel</Link>}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Pod</TableHead><TableHead>Prefers off</TableHead>
            <TableHead>Primary on</TableHead><TableHead>Backup for</TableHead><TableHead>Limits</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {dir.employees.map((e) => (
              <TableRow key={e.id} className={e.active ? "" : "opacity-50"}>
                <TableCell>
                  <Link href={`/employees?edit=${e.id}`} className="font-medium hover:underline">{e.name}</Link>
                  <div className="text-xs text-muted-foreground">{e.id} · {e.role}</div>
                </TableCell>
                <TableCell>{dir.pod.get(e.podId ?? "")?.name}</TableCell>
                <TableCell>{e.preferredOff == null ? "—" : DAYS[e.preferredOff]}</TableCell>
                <TableCell className="max-w-64 whitespace-normal text-xs">{tags(e.id, "PRIMARY").join(", ") || "—"}</TableCell>
                <TableCell className="text-xs">{tags(e.id, "BACKUP").length || "—"}</TableCell>
                <TableCell className="text-xs">{e.maxConsecutive} in a row · {e.maxBackup} backup</TableCell>
                <TableCell className="text-right">
                  <form action={toggleEmployee} className="flex items-center justify-end gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    {!e.active && <Badge variant="outline">Inactive</Badge>}
                    <SubmitButton size="sm" variant="ghost" pending="…">{e.active ? "Deactivate" : "Activate"}</SubmitButton>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
