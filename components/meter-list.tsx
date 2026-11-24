// One bar per named row (single series, one hue). Value printed at the bar tip; hover the row for detail.
export function MeterList({ rows, max }: { rows: { label: string; value: number; title: string }[]; max: number }) {
  return (
    <ul className="space-y-1.5" role="list">
      {rows.map((r) => (
        <li key={r.label} title={r.title} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-xs">
          <span className="truncate">{r.label}</span>
          <span className="flex items-center gap-2" aria-label={`${r.label}: ${r.value}`}>
            <span className="h-3 flex-1 rounded-r bg-[#cde2fb] dark:bg-[#184f95]">
              <span className="block h-3 rounded-r bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
            </span>
            <span className="w-6 text-right font-medium tabular-nums">{r.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
