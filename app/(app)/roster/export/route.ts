// GET /roster/export?month=2026-12&v=2 -> CSV (opens in Excel / Google Sheets).
// Two blocks: one row per employee per day, then per-day coverage (have/need) per brand-process.
import { and, desc, eq } from "drizzle-orm";
import { db, rosters } from "@/db";
import { getSession } from "@/lib/auth";
import { CALENDARS, getDirectory, parseMonth } from "@/lib/data";
import type { Coverage, Roster } from "@/lib/engine";

const CODE: Record<string, string> = { WEEK_OFF: "WO", LEAVE: "L", COMP_OFF: "CO", HOLIDAY: "H" };
const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const line = (cells: unknown[]) => cells.map(esc).join(",");

export async function GET(request: Request) {
  if ((await getSession())?.role !== "MANAGER") return new Response("Managers only", { status: 403 });
  const url = new URL(request.url);
  const { year, month, key } = parseMonth(url.searchParams.get("month") ?? undefined);
  const [dir, versions] = await Promise.all([
    getDirectory(),
    db.select().from(rosters).where(and(eq(rosters.year, year), eq(rosters.month, month))).orderBy(desc(rosters.version)),
  ]);
  const row = versions.find((v) => String(v.version) === url.searchParams.get("v")) ?? versions[0];
  if (!row) return new Response(`No roster for ${key}`, { status: 404 });

  const r = row.data as Roster;
  const cov = row.coverage as Coverage;
  const backups = new Set(dir.assignments.filter((a) => a.role === "BACKUP").map((a) => `${a.employeeId}|${a.bpId}`));
  const dayHead = r.days.map((d) => `${d.slice(8)} ${"SMTWTFS"[new Date(`${d}T00:00:00Z`).getUTCDay()]}`);

  const out = [
    line([`Roster ${key} v${row.version} (${row.status})`]),
    line(["Codes: W = working, W+ = working + backup cover, WO = weekly off, L = leave, CO = comp-off, H = public holiday"]),
    line(["Employee", "Pod", "Role", ...dayHead, "Working days", "Weekly offs"]),
    ...Object.entries(r.entries).map(([e, cells]) => {
      const emp = dir.emp.get(e);
      const codes = cells.map((c) => c.status !== "WORK" ? CODE[c.status] : c.covers.some((b) => backups.has(`${e}|${b}`)) ? "W+" : "W");
      return line([emp?.name ?? e, dir.pod.get(emp?.podId ?? "")?.name ?? "", emp?.role ?? "", ...codes,
        codes.filter((c) => c.startsWith("W") && c !== "WO").length, codes.filter((c) => c === "WO").length]);
    }),
    "",
    line(["Coverage (have/need, blank = closed)"]),
    line(["Brand · Process", "Calendar", "", ...dayHead, "Short days"]),
    ...dir.bps.map((b) => {
      const days = cov[b.id] ?? [];
      return line([dir.bpLabel(b.id), CALENDARS[b.calendar as keyof typeof CALENDARS] ?? b.calendar, "",
        ...days.map(([have, need]) => (need ? `${have}/${need}` : "")), days.filter(([have, need]) => have < need).length]);
    }),
  ];
  // BOM so Excel reads UTF-8 names correctly.
  return new Response("﻿" + out.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="roster-${key}-v${row.version}.csv"`,
    },
  });
}
