"""Independent checker for ANY roster (generated or hand-edited).

It never trusts the solver: it re-reads the roster cell by cell using the
same shared rules (rules.py) and reports every problem in plain words.
Severity: CRITICAL = a hard rule is broken, WARNING = a preference/soft rule.
"""
from __future__ import annotations

from .rules import Ctx, build_ctx, max_backup, max_consecutive, weeks

CRITICAL, WARNING = "CRITICAL", "WARNING"
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def issue(kind: str, severity: str, msg: str, date: str | None = None, employee: str | None = None,
          bp: str | None = None, **extra) -> dict:
    return {"type": kind, "severity": severity, "date": date, "employee": employee,
            "bp": bp, "message": msg, **extra}


def validate(data: dict, roster: dict) -> list[dict]:
    """Return every conflict in `roster` for the config in `data`."""
    ctx = build_ctx(data)
    cells = roster["entries"]
    out: list[dict] = []
    for check in (_cells, _coverage, _weekly_offs, _consecutive, _preferences):
        out += check(ctx, cells)
    return sorted(out, key=lambda x: (x["severity"] != CRITICAL, x["date"] or "", x["type"]))


def _name(ctx: Ctx, e: str) -> str:
    return ctx.employees.get(e, {}).get("name", e)


def _bp_name(ctx: Ctx, b: str) -> str:
    bp = ctx.bps.get(b, {})
    return f"{bp.get('brand', b)} ({bp.get('process', '')})"


def _backup_brands(ctx: Ctx, e: str, cell: dict) -> set[str]:
    """Distinct brands this person covers as a backup in one cell."""
    return {ctx.bps[b]["brand"] for b in cell["covers"] if b in ctx.backup.get(e, [])}


def _cells(ctx: Ctx, cells: dict) -> list[dict]:
    """Per-cell sanity: leave respected, covers valid, backup load within limit."""
    out = []
    for e, row in cells.items():
        allowed = set(ctx.primary.get(e, []) + ctx.backup.get(e, []))
        for i, cell in enumerate(row):
            d, ds = ctx.days[i], ctx.days[i].isoformat()
            working = cell["status"] == "WORK"
            if working and (e, d) in ctx.leave:
                out.append(issue("WORK_ON_LEAVE", CRITICAL,
                                 f"{_name(ctx, e)} is rostered to work on {ds} but has approved {ctx.leave[e, d].lower()}.",
                                 ds, e))
            if not working and cell["covers"]:
                out.append(issue("COVER_WHILE_OFF", CRITICAL,
                                 f"{_name(ctx, e)} is marked {cell['status']} but still listed as covering work.", ds, e))
            for b in cell["covers"]:
                if b not in allowed:
                    out.append(issue("NOT_ASSIGNED", CRITICAL,
                                     f"{_name(ctx, e)} covers {_bp_name(ctx, b)} but is not assigned to it.", ds, e, b))
            extra = _backup_brands(ctx, e, cell)
            limit = max_backup(ctx.employees.get(e, {}))
            if len(extra) > limit:
                out.append(issue("BACKUP_OVERLOAD", CRITICAL,
                                 f"{_name(ctx, e)} is backing up {len(extra)} extra brands on {ds} "
                                 f"({', '.join(sorted(extra))}; limit {limit}) on top of their own work.", ds, e))
    return out


def _covering(ctx: Ctx, cells: dict, b: str, i: int) -> list[str]:
    """Assigned people actually covering bp `b` on day `i`."""
    return [e for e, _ in ctx.staff[b] if e in cells and b in cells[e][i]["covers"]]


def coverage(data: dict, roster: dict) -> dict[str, list[list[int]]]:
    """bp -> per day [have, need] (need 0 = closed). Feeds the brand/process views."""
    ctx, cells = build_ctx(data), roster["entries"]
    return {b: [[len(_covering(ctx, cells, b, i)), ctx.needed(b, i)] for i in range(len(ctx.days))] for b in ctx.bps}


def _coverage(ctx: Ctx, cells: dict) -> list[dict]:
    """Each open brand-process must have enough people covering it."""
    out = []
    for b in ctx.bps:
        for i, d in enumerate(ctx.days):
            need = ctx.needed(b, i)
            if not need:
                continue
            ds = d.isoformat()
            have = _covering(ctx, cells, b, i)
            if len(have) >= need:
                continue
            why = ", ".join(f"{_name(ctx, e)}{' (backup)' if r == 'BACKUP' else ''}: "
                            f"{cells[e][i]['status'] if e in cells else 'no roster'}"
                            for e, r in ctx.staff[b]) or "nobody is assigned"
            out.append(issue("COVERAGE_GAP", CRITICAL,
                             f"{_bp_name(ctx, b)} needs {need} on {ds} but has {len(have)}. Assigned staff: {why}.",
                             ds, None, b, need=need, have=len(have), suggestions=suggest(ctx, cells, b, i)))
    return out


def suggest(ctx: Ctx, cells: dict, b: str, i: int) -> list[str]:
    """Ways a manager could close a gap on bp `b`, day `i` (best first)."""
    tips = []
    for e, role in ctx.staff[b]:
        cell = cells.get(e, [None] * len(ctx.days))[i]
        if not cell or b in cell["covers"]:
            continue
        who = _name(ctx, e)
        if cell["status"] == "WORK":
            used = _backup_brands(ctx, e, cell)
            same_brand = ctx.bps[b]["brand"] in used
            if role == "PRIMARY" or same_brand or len(used) < max_backup(ctx.employees[e]):
                tips.append(f"{who} is already working that day: add {_bp_name(ctx, b)} to their cover.")
            else:
                tips.append(f"{who} is working but at their backup limit: raise it or move one of their covers.")
        elif cell["status"] in ("WEEK_OFF", "HOLIDAY"):
            tips.append(f"Move {who}'s {cell['status'].replace('_', ' ').lower()} to another day so they can cover.")
    if not tips:
        tips.append("No assigned person is free: assign a new backup from the same pod, or reduce the minimum for this day.")
    return tips


def _weekly_offs(ctx: Ctx, cells: dict) -> list[dict]:
    """Every full Mon-Sun week needs at least one weekly off; more than one is flagged."""
    out = []
    for e, row in cells.items():
        for wk in weeks(ctx.days):
            if len(wk) < 7:
                continue
            offs = sum(1 for i in wk if row[i]["status"] == "WEEK_OFF")
            start = ctx.days[wk[0]].isoformat()
            if offs == 0 and any(row[i]["status"] == "WORK" for i in wk):
                out.append(issue("NO_WEEKLY_OFF", CRITICAL,
                                 f"{_name(ctx, e)} has no weekly off in the week starting {start}.", start, e))
            elif offs > 1 and any(ctx.has_work(e, i) for i in wk):
                out.append(issue("EXTRA_WEEKLY_OFF", WARNING,
                                 f"{_name(ctx, e)} has {offs} weekly offs in the week starting {start}.", start, e))
    return out


def _consecutive(ctx: Ctx, cells: dict) -> list[dict]:
    """No working streak longer than the employee's limit (last month's tail included)."""
    out = []
    for e, row in cells.items():
        limit = max_consecutive(ctx.employees.get(e, {}))
        run = ctx.prev_tail.get(e, 0)
        for i, cell in enumerate(row):
            run = run + 1 if cell["status"] == "WORK" else 0
            if run == limit + 1:
                ds = ctx.days[i].isoformat()
                out.append(issue("TOO_MANY_DAYS", CRITICAL,
                                 f"{_name(ctx, e)} works more than {limit} days in a row (streak reaches {ds}).", ds, e))
    return out


def _preferences(ctx: Ctx, cells: dict) -> list[dict]:
    """Soft: one summary warning per employee whose preferred off day was missed."""
    out = []
    for e, row in cells.items():
        pref = ctx.employees.get(e, {}).get("preferred_off")
        if pref is None:
            continue
        days = [i for i, d in enumerate(ctx.days) if d.weekday() == int(pref) and not ctx.is_holiday(i)]
        missed = [ctx.days[i].isoformat() for i in days if row[i]["status"] == "WORK"]
        if missed:
            out.append(issue("PREFERENCE_MISSED", WARNING,
                             f"{_name(ctx, e)} prefers {DAY_NAMES[int(pref)]} off but works {len(missed)} of "
                             f"{len(days)} of them ({', '.join(missed)}). Usually because coverage needed them.",
                             None, e, dates=missed))
    return out
