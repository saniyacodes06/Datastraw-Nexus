// One grid for every roster view: rows of people or brand-processes, one column per day.
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Section, Tone } from "@/lib/views";

const TONE: Record<Tone, string> = {
  work: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  backup: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  off: "bg-muted text-muted-foreground",
  leave: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  holiday: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
  ok: "text-emerald-700 dark:text-emerald-300",
  gap: "bg-red-600 text-white font-semibold",
  closed: "text-muted-foreground/60",
  none: "text-muted-foreground",
};

export const LEGEND: [string, Tone, string][] = [
  ["W", "work", "Working"], ["W+", "backup", "Working + backup cover"], ["WO", "off", "Weekly off"],
  ["L / CO", "leave", "Leave / comp-off"], ["H", "holiday", "Public holiday"], ["1/2", "gap", "Short staffed"],
];

export function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="rounded px-1.5 py-0.5 ring-2 ring-amber-500">&nbsp;</span>Changed in this version</span>
      {LEGEND.map(([t, tone, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn("rounded px-1.5 py-0.5 font-mono", TONE[tone])}>{t}</span>{label}
        </span>
      ))}
    </div>
  );
}

export function RosterGrid({ days, holidays, sections }: { days: string[]; holidays: Set<string>; sections: Section[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-max border-collapse text-xs">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 z-10 min-w-52 bg-background p-2 text-left font-medium">Day</th>
            {days.map((d) => {
              const date = new Date(`${d}T00:00:00Z`);
              const sun = date.getUTCDay() === 0;
              return (
                <th key={d} className={cn("w-9 p-1 text-center font-normal", sun && "bg-muted/60", holidays.has(d) && "bg-violet-100 dark:bg-violet-900/40")}>
                  <div className="font-medium">{date.getUTCDate()}</div>
                  <div className="text-muted-foreground">{"SMTWTFS"[date.getUTCDay()]}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        {sections.map((s) => (
          <tbody key={s.title}>
            <tr><td colSpan={days.length + 1} className="sticky left-0 bg-muted/40 px-2 py-1.5 font-semibold">{s.title}</td></tr>
            {s.rows.length === 0 && <tr><td colSpan={days.length + 1} className="px-2 py-2 text-muted-foreground">Nothing here yet.</td></tr>}
            {s.rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="sticky left-0 z-10 bg-background px-2 py-1">
                  {r.href ? <Link href={r.href} className="font-medium hover:underline">{r.label}</Link> : <span className="font-medium">{r.label}</span>}
                  {r.sub && <div className="max-w-52 truncate text-muted-foreground" title={r.sub}>{r.sub}</div>}
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} title={c.title} className="p-0.5 text-center">
                    <div className={cn("rounded px-0.5 py-1 font-mono", TONE[c.tone], c.changed && "ring-2 ring-amber-500")}>{c.text}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
