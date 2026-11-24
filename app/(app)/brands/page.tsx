import { requireManager } from "@/lib/auth";
import Link from "next/link";
import { addAssignment, addBrand, deleteProcess, removeAssignment, saveProcess } from "@/app/actions";
import { Field, Select, SubmitButton } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CALENDARS, getDirectory, param, PROCESSES } from "@/lib/data";
import { cn } from "@/lib/utils";

export default async function BrandsPage({ searchParams }: PageProps<"/brands">) {
  await requireManager();
  const sp = await searchParams;
  const dir = await getDirectory();
  const brand = dir.brand.get(param(sp, "brand") ?? "") ?? dir.brands[0];
  const procs = dir.bps.filter((b) => b.brandId === brand?.id);
  const people = (bpIds: Set<string>) => new Set(dir.assignments.filter((a) => bpIds.has(a.bpId) && a.role === "PRIMARY").map((a) => a.employeeId));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Brands & working rules</h1>
        <p className="text-sm text-muted-foreground">Each process has its own calendar and minimum staff. Changes apply to the next generated roster.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit">
          <CardContent className="space-y-1 py-3">
            {dir.brands.map((b) => {
              const n = people(new Set(dir.bps.filter((p) => p.brandId === b.id).map((p) => p.id))).size;
              return (
                <Link key={b.id} href={`/brands?brand=${b.id}`}
                  className={cn("flex justify-between rounded-md px-2 py-1 text-sm hover:bg-muted", b.id === brand?.id && "bg-muted font-medium")}>
                  {b.name}<span className="text-xs text-muted-foreground">{n === 1 ? "1 person" : `${n} people`}</span>
                </Link>
              );
            })}
            <form action={addBrand} className="space-y-2 border-t pt-3">
              <Input name="name" required minLength={2} placeholder="New brand name" />
              <Select name="podId" className="w-full">{dir.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              <SubmitButton size="sm" pending="Adding…" className="w-full">Add brand</SubmitButton>
            </form>
          </CardContent>
        </Card>

        {brand && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{brand.name} <span className="font-normal text-muted-foreground">· {dir.pod.get(brand.podId ?? "")?.name}</span></CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {procs.length === 0 && <p className="text-sm text-muted-foreground">No processes yet. Add one below.</p>}
                {procs.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-end gap-2 border-b pb-3">
                    <form action={saveProcess} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="brandId" value={brand.id} />
                      <input type="hidden" name="process" value={p.process} />
                      <div className="w-14 pb-1.5 font-medium">{p.process}</div>
                      <Field label="Calendar"><Select name="calendar" defaultValue={p.calendar}>
                        {Object.entries(CALENDARS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select></Field>
                      <Field label="Min staff"><Input name="minStaff" type="number" min={0} max={10} defaultValue={p.minStaff} className="w-20" /></Field>
                      <Field label="Sunday min"><Input name="sundayMin" type="number" min={0} max={6} placeholder="same" defaultValue={p.minByWeekday["6"] ?? ""} className="w-20" /></Field>
                      <SubmitButton size="sm" variant="outline" pending="Saving…">Save</SubmitButton>
                    </form>
                    <form action={deleteProcess}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton size="sm" variant="ghost" pending="…">Remove</SubmitButton>
                    </form>
                  </div>
                ))}
                <form action={saveProcess} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="brandId" value={brand.id} />
                  <Field label="New process"><Input name="process" required list="process-names" placeholder="CS" className="w-24" /></Field>
                  <datalist id="process-names">{PROCESSES.map((p) => <option key={p} value={p} />)}</datalist>
                  <Field label="Calendar"><Select name="calendar">{Object.entries(CALENDARS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                  <Field label="Min staff"><Input name="minStaff" type="number" min={0} max={10} defaultValue={1} className="w-20" /></Field>
                  <input type="hidden" name="sundayMin" value="" />
                  <SubmitButton size="sm" pending="Adding…">Add process</SubmitButton>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Who works here</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {procs.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-14 font-medium">{p.process}</span>
                    {dir.assignments.filter((a) => a.bpId === p.id).map((a) => (
                      <form key={a.id} action={removeAssignment} className="flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2">
                        <input type="hidden" name="id" value={a.id} />
                        {dir.emp.get(a.employeeId)?.name}
                        <Badge variant={a.role === "PRIMARY" ? "default" : "outline"}>{a.role.toLowerCase()}</Badge>
                        <button type="submit" className="px-1 text-muted-foreground hover:text-destructive" aria-label="Remove assignment">×</button>
                      </form>
                    ))}
                    {!dir.assignments.some((a) => a.bpId === p.id) && <span className="text-destructive">Nobody assigned</span>}
                  </div>
                ))}
                {procs.length > 0 && (
                  <form action={addAssignment} className="flex flex-wrap items-end gap-2 border-t pt-3">
                    <Field label="Employee"><Select name="employeeId">
                      {dir.employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name} ({dir.pod.get(e.podId ?? "")?.name})</option>)}
                    </Select></Field>
                    <Field label="Process"><Select name="bpId">{procs.map((p) => <option key={p.id} value={p.id}>{p.process}</option>)}</Select></Field>
                    <Field label="Role"><Select name="role"><option value="PRIMARY">Primary</option><option value="BACKUP">Backup</option></Select></Field>
                    <SubmitButton size="sm" pending="Assigning…">Assign</SubmitButton>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
