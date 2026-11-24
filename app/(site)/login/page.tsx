import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { db, employees } from "@/db";
import { login } from "@/app/actions";
import { Field, SubmitButton } from "@/components/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { demoLogins } from "@/lib/auth";

export default async function LoginPage() {
  await connection(); // reads the DB: render per request
  const demo = demoLogins();
  const sample = demo ? await db.select({ name: employees.name, email: employees.email }).from(employees)
    .where(eq(employees.active, true)).orderBy(asc(employees.id)).limit(6) : [];
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-10">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">DN</span>
        <span className="font-semibold text-primary">DataStraw Nexus</span>
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Sign in to DataStraw Nexus</h1>
        <p className="text-sm text-muted-foreground">Managers plan and publish rosters. Employees see their own roster and request leave.</p>
      </div>
      <Card>
        <CardContent className="py-4">
          <form action={login} className="space-y-3">
            <Field label="Email"><Input name="email" type="email" required autoComplete="username" defaultValue={demo?.manager} /></Field>
            <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
            <SubmitButton pending="Signing in…" className="w-full">Sign in</SubmitButton>
          </form>
        </CardContent>
      </Card>
      {demo && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Demo accounts (for reviewers)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p>Password for every account: <code className="rounded bg-muted px-1 text-foreground">{demo.password}</code></p>
            <p>Manager: <code className="text-foreground">{demo.manager}</code></p>
            <p>Employees:</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">{sample.map((e) => <li key={e.email}><code className="break-all text-foreground" title={e.name}>{e.email}</code></li>)}</ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
