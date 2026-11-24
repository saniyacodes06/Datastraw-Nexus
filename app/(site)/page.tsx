import { count, eq } from "drizzle-orm";
import { connection } from "next/server";
import { brandProcesses, brands, db, employees } from "@/db";
import { Landing } from "@/components/landing";
import { getSession } from "@/lib/auth";

// Public landing page with live counts from the demo data.
export default async function Home() {
  await connection();
  const [session, [e], [b], [p]] = await Promise.all([
    getSession(),
    db.select({ n: count() }).from(employees).where(eq(employees.active, true)),
    db.select({ n: count() }).from(brands),
    db.select({ n: count() }).from(brandProcesses),
  ]);
  const home = session ? (session.role === "MANAGER" ? "/dashboard" : "/roster") : null;
  return <Landing stats={{ employees: e.n, brands: b.n, processes: p.n }} home={home} />;
}
