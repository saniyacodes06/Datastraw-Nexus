// Read helpers shared by every page. One place to load "who/what exists" + small label helpers.
import { asc } from "drizzle-orm";
import { assignments, brandProcesses, brands, db, employees, holidays, pods } from "@/db";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const CALENDARS = {
  "365_DAYS": "Every day incl. holidays",
  NO_PUBLIC_HOLIDAYS: "Every day except public holidays",
  NO_SUN_NO_PH: "Mon-Sat, no public holidays",
} as const;
export const PROCESSES = ["CS", "ACC", "NDR", "RET"];

export type Directory = Awaited<ReturnType<typeof getDirectory>>;

/** Everything about the team and brands, plus lookup maps. */
export async function getDirectory() {
  const [podRows, empRows, brandRows, bpRows, asgRows, holRows] = await Promise.all([
    db.select().from(pods).orderBy(asc(pods.id)),
    db.select().from(employees).orderBy(asc(employees.id)),
    db.select().from(brands).orderBy(asc(brands.name)),
    db.select().from(brandProcesses).orderBy(asc(brandProcesses.id)),
    db.select().from(assignments).orderBy(asc(assignments.id)),
    db.select().from(holidays).orderBy(asc(holidays.date)),
  ]);
  const emp = new Map(empRows.map((e) => [e.id, e]));
  const brand = new Map(brandRows.map((b) => [b.id, b]));
  const bp = new Map(bpRows.map((b) => [b.id, b]));
  const pod = new Map(podRows.map((p) => [p.id, p]));
  return {
    pods: podRows, employees: empRows, brands: brandRows, bps: bpRows, assignments: asgRows, holidays: holRows,
    emp, brand, bp, pod,
    /** "Bloom Botanics · CS" */
    bpLabel: (id: string) => {
      const p = bp.get(id);
      return p ? `${brand.get(p.brandId)?.name ?? p.brandId} · ${p.process}` : id;
    },
  };
}

/** "2026-12" -> { year, month }. Default: next month (rosters are planned ahead). */
export function parseMonth(value?: string) {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]), key: value! };
  const d = new Date();
  const year = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const month = (d.getMonth() + 1) % 12 + 1;
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

/** Read one search param as a string. */
export const param = (sp: Record<string, string | string[] | undefined>, k: string) => {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
};
