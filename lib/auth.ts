// Email + password sign-in; a signed cookie then says who you are. Manager = full access; Employee = own roster + leave requests.
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auditLog, db, employees, notifications } from "@/db";

export const COOKIE = "nexus_session";
export type Session = { role: "MANAGER" | "EMPLOYEE"; employeeId?: string; name: string };

// Fail closed: in production a missing secret would make session cookies forgeable.
const secret = () => {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
  return "dev-only-secret";
};
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function encodeSession(s: Session) {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const [body, sig] = raw?.split(".") ?? [];
  if (!body || !sig) return null;
  const good = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  return JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
}

// ---------- passwords ----------
const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const DEMO_PASSWORD = () => process.env.DEMO_PASSWORD ?? "demo1234";
export const MANAGER_EMAIL = () => (process.env.MANAGER_EMAIL ?? "manager@datastraw.demo").toLowerCase();

/** "salt:hash" (scrypt, 64 bytes). */
export async function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(pw, salt, 64)).toString("hex")}`;
}

async function verifyPassword(pw: string, stored: string | null | undefined) {
  const [salt, hash] = (stored ?? "0:00").split(":");
  const got = await scrypt(pw, salt, 64); // hash even when there is no user, so timing doesn't reveal who exists
  const want = Buffer.from(hash, "hex");
  return !!stored && want.length === got.length && timingSafeEqual(want, got);
}

function managerPassword() {
  if (process.env.MANAGER_PASSWORD) return process.env.MANAGER_PASSWORD;
  if (process.env.NODE_ENV === "production") throw new Error("MANAGER_PASSWORD is not set");
  return DEMO_PASSWORD();
}
const sameText = (a: string, b: string) => timingSafeEqual(createHmac("sha256", "cmp").update(a).digest(), createHmac("sha256", "cmp").update(b).digest());

// ponytail: in-memory lockout is per server instance; move to the database (or Redis) if you run several instances.
const failures = new Map<string, { n: number; until: number }>();
const LOCK_AFTER = 5, LOCK_MS = 15 * 60_000;

/** Email + password -> session, or null. Throws when the account is locked after too many failures. */
export async function checkCredentials(email: string, password: string): Promise<Session | null> {
  const f = failures.get(email);
  if (f && f.n >= LOCK_AFTER && f.until > Date.now()) throw new Error(`Too many failed attempts. Try again in ${Math.ceil((f.until - Date.now()) / 60_000)} min.`);
  let s: Session | null = null;
  if (email === MANAGER_EMAIL()) {
    if (sameText(password, managerPassword())) s = { role: "MANAGER", name: "Operations Manager" };
  } else {
    const [e] = await db.select().from(employees).where(eq(sql`lower(${employees.email})`, email));
    if (await verifyPassword(password, e?.passwordHash) && e?.active) s = { role: "EMPLOYEE", employeeId: e.id, name: e.name };
  }
  if (s) failures.delete(email);
  else failures.set(email, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + LOCK_MS });
  return s;
}

/** Shown on the login page so reviewers can get in. Turn off with SHOW_DEMO_LOGINS=false. */
export const demoLogins = () => process.env.SHOW_DEMO_LOGINS === "false" ? null : { manager: MANAGER_EMAIL(), password: DEMO_PASSWORD() };

/** Pages: send logged-out users to /login. */
export async function requireSession() {
  await connection(); // per-user pages (clock, DB): render at request time, never prerender
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "EMPLOYEE") {
    // Cookies live 7 days: someone deactivated since login loses access now, not next week.
    const [e] = await db.select({ active: employees.active }).from(employees).where(eq(employees.id, s.employeeId ?? ""));
    if (!e?.active) redirect("/login");
  }
  return s;
}

/** Manager-only pages and actions. Employees are sent to their roster. */
export async function requireManager() {
  const s = await requireSession();
  if (s.role !== "MANAGER") redirect("/roster");
  return s;
}

/** Record who did what (shown as "Recent activity"). */
export async function audit(s: Session, action: string, detail?: string) {
  await db.insert(auditLog).values({ actor: s.name, action, detail });
}

/** In-app notification. audience: "ALL" | "MANAGER" | employee id. */
export async function notify(audience: string, message: string, link?: string) {
  await db.insert(notifications).values({ audience, message, link });
}
