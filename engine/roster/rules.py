"""Shared rules used by BOTH the solver and the validator.

Keeping these in one place means the generator and the checker can never
disagree about what a rule means.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date

# Calendar types a brand-process can follow.
ALL_DAYS = "365_DAYS"            # every day, holidays too
NO_PUBLIC_HOLIDAYS = "NO_PUBLIC_HOLIDAYS"
NO_SUN_NO_PH = "NO_SUN_NO_PH"
SUNDAY = 6                       # date.weekday(): Mon=0 .. Sun=6


def month_days(year: int, month: int) -> list[date]:
    n = calendar.monthrange(year, month)[1]
    return [date(year, month, d) for d in range(1, n + 1)]


def weeks(days: list[date]) -> list[list[int]]:
    """Group day indexes into Mon-Sun weeks (first/last may be partial)."""
    out: list[list[int]] = []
    for i, d in enumerate(days):
        if d.weekday() == 0 or not out:
            out.append([])
        out[-1].append(i)
    return out


def operates(bp: dict, d: date, holidays: set[date]) -> bool:
    """Does this brand-process need people on day d?"""
    cal = bp["calendar"]
    if cal == ALL_DAYS:
        return True
    if d in holidays:
        return False
    if cal == NO_SUN_NO_PH:
        return d.weekday() != SUNDAY
    return True  # NO_PUBLIC_HOLIDAYS


def min_staff(bp: dict, d: date) -> int:
    """Minimum headcount for day d (per-weekday override, else default)."""
    by_day = bp.get("min_by_weekday") or {}
    return int(by_day.get(str(d.weekday()), bp.get("min_staff", 1)))


@dataclass
class Ctx:
    """Input data plus lookup tables, built once and reused everywhere."""
    year: int
    month: int
    employees: dict[str, dict]
    bps: dict[str, dict]
    days: list[date]
    holidays: set[date]
    primary: dict[str, list[str]] = field(default_factory=dict)  # emp -> bps
    backup: dict[str, list[str]] = field(default_factory=dict)   # emp -> bps
    staff: dict[str, list[tuple[str, str]]] = field(default_factory=dict)  # bp -> [(emp, role)]
    leave: dict[tuple[str, date], str] = field(default_factory=dict)  # (emp, day) -> LEAVE/COMP_OFF
    prev_tail: dict[str, int] = field(default_factory=dict)  # days worked in a row at end of last month

    def needed(self, bp_id: str, i: int) -> int:
        """Headcount bp needs on day index i (0 when it doesn't operate)."""
        bp, d = self.bps[bp_id], self.days[i]
        return min_staff(bp, d) if operates(bp, d, self.holidays) else 0

    def has_work(self, emp: str, i: int) -> bool:
        """Is any of this employee's brands (primary or backup) open on day i?"""
        # .get: a roster may still hold someone deactivated after it was made.
        return any(self.needed(b, i) for b in self.primary.get(emp, []) + self.backup.get(emp, []))

    def is_holiday(self, i: int) -> bool:
        return self.days[i] in self.holidays


def build_ctx(data: dict) -> Ctx:
    """Turn plain JSON input into a Ctx. Input shape: see sample.py."""
    year, month = int(data["year"]), int(data["month"])
    ctx = Ctx(
        year=year,
        month=month,
        employees={e["id"]: e for e in data["employees"]},
        bps={b["id"]: b for b in data["brand_processes"]},
        days=month_days(year, month),
        holidays={date.fromisoformat(h) for h in data.get("holidays", [])},
        prev_tail={k: int(v) for k, v in (data.get("prev_tail") or {}).items()},
    )
    for e in ctx.employees:
        ctx.primary[e], ctx.backup[e] = [], []
    for b in ctx.bps:
        ctx.staff[b] = []
    for a in data["assignments"]:
        role = a.get("role", "PRIMARY")
        (ctx.primary if role == "PRIMARY" else ctx.backup)[a["employee"]].append(a["bp"])
        ctx.staff[a["bp"]].append((a["employee"], role))
    for lv in data.get("leaves", []):
        ctx.leave[(lv["employee"], date.fromisoformat(lv["date"]))] = lv.get("type", "LEAVE")
    return ctx


def max_consecutive(emp: dict) -> int:
    return int(emp.get("max_consecutive", 6))


def max_backup(emp: dict) -> int:
    return int(emp.get("max_backup", 1))
