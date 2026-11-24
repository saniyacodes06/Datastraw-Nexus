"""Roster generator built on Google OR-Tools CP-SAT.

Idea in one line: for every (employee, day) the solver answers "works or not?",
obeying hard rules, and picks the answer with the smallest total penalty.

Hard rules (never broken):
  - leave / comp-off day -> not working
  - no brand of theirs is open -> not working
  - exactly 1 weekly off in every full Mon-Sun week
  - never more than `max_consecutive` days in a row (last month's tail counted)
  - a backup covers at most `max_backup` extra brand-processes per day

Soft rules (penalties, heaviest first):
  - coverage shortage .......... 1000 per missing person
  - (regenerate) changed cell ...  30 per changed working day, 3 per changed backup cover
  - preferred off day missed ....  20
  - unfair Sunday offs ..........   5 per Sunday of max-min spread
  - holiday worked (comp-off) ...   3
  - backup used .................   2
"""
from __future__ import annotations

from datetime import date

from ortools.sat.python import cp_model

from .rules import SUNDAY, Ctx, build_ctx, max_backup, max_consecutive, weeks

W_SHORT, W_CHANGE, W_PREF, W_FAIR, W_HOLIDAY, W_COVER_CHANGE, W_BACKUP = 1000, 30, 20, 5, 3, 3, 2


class Model:
    """CP-SAT model for one month. `old` + `freeze_before` turn on minimal-change mode."""

    def __init__(self, ctx: Ctx, old: dict | None = None, freeze_before: date | None = None):
        self.ctx, self.old = ctx, old
        self.m = cp_model.CpModel()
        self.cost: list = []
        self.D = range(len(ctx.days))
        self.frozen = {i for i in self.D if old and freeze_before and ctx.days[i] < freeze_before}
        self.works = {(e, i): self.m.new_bool_var(f"w_{e}_{i}") for e in ctx.employees for i in self.D}
        self.covers: dict[tuple[str, str, int], object] = {}
        self.short: dict[tuple[str, int], object] = {}
        self._availability()
        self._coverage()
        self._weekly_offs()
        self._consecutive()
        self._preferences()
        self._fairness()
        if old:
            self._stay_close()
        self.m.minimize(sum(self.cost))

    # ---- helpers ----
    def old_cell(self, e: str, i: int) -> dict:
        row = self.old["entries"].get(e)
        return row[i] if row else {"status": "NEW", "covers": []}

    def is_decision(self, e: str, i: int) -> bool:
        """A day the solver may choose work/off for (not leave, some brand open)."""
        return (e, self.ctx.days[i]) not in self.ctx.leave and self.ctx.has_work(e, i)

    # ---- hard rules ----
    def _availability(self) -> None:
        for (e, i), w in self.works.items():
            if i in self.frozen:
                self.m.add(w == int(self.old_cell(e, i)["status"] == "WORK"))
            elif not self.is_decision(e, i):
                self.m.add(w == 0)

    def _coverage(self) -> None:
        ctx = self.ctx
        for e in ctx.employees:
            for i in self.D:
                extra: dict[str, list] = {}  # backup brand -> its cover vars
                for b in ctx.primary[e]:
                    if ctx.needed(b, i):
                        self.covers[e, b, i] = self.works[e, i]  # primary covers whenever working
                for b in ctx.backup[e]:
                    if ctx.needed(b, i):
                        c = self.m.new_bool_var(f"c_{e}_{b}_{i}")
                        self.m.add(c <= self.works[e, i])
                        if i in self.frozen:
                            self.m.add(c == int(b in self.old_cell(e, i)["covers"]))
                        self.covers[e, b, i] = c
                        self.cost.append(W_BACKUP * c)
                        extra.setdefault(ctx.bps[b]["brand"], []).append(c)
                if extra:  # limit counts extra BRANDS, not processes
                    used = []
                    for brand, cs in extra.items():
                        u = self.m.new_bool_var(f"u_{e}_{brand}_{i}")
                        for c in cs:
                            self.m.add(c <= u)
                        used.append(u)
                    self.m.add(sum(used) <= max_backup(ctx.employees[e]))
        for b in ctx.bps:
            for i in self.D:
                need = ctx.needed(b, i)
                if not need:
                    continue
                s = self.m.new_int_var(0, need, f"s_{b}_{i}")
                self.m.add(sum(self.covers[e, b, i] for e, _ in ctx.staff[b]) + s >= need)
                self.short[b, i] = s
                self.cost.append(W_SHORT * s)

    def _weekly_offs(self) -> None:
        ctx = self.ctx
        for e in ctx.employees:
            for wk in weeks(ctx.days):
                if any(i in self.frozen for i in wk):
                    continue
                # Days already off for free (brand closed, not a holiday) count as the weekly off.
                free_off = sum(1 for i in wk if not self.is_decision(e, i)
                               and (e, ctx.days[i]) not in ctx.leave and not ctx.is_holiday(i))
                choose = [i for i in wk if self.is_decision(e, i) and not ctx.is_holiday(i)]
                if not choose:
                    continue
                need = min(max(0, 1 - free_off), len(choose))
                offs = sum(1 - self.works[e, i] for i in choose)
                self.m.add(offs == need) if len(wk) == 7 else self.m.add(offs <= need)

    def _consecutive(self) -> None:
        for e, emp in self.ctx.employees.items():
            limit = max_consecutive(emp)
            tail = min(self.ctx.prev_tail.get(e, 0), limit)
            seq = [1] * tail + [self.works[e, i] for i in self.D]
            fixed = [True] * tail + [i in self.frozen for i in self.D]
            for s in range(len(seq) - limit):
                # A window made only of the past can't be changed any more; if it already breaks the
                # rule (manual edit), the validator reports it. Constraining it would make re-plans infeasible.
                if not all(fixed[s:s + limit + 1]):
                    self.m.add(sum(seq[s:s + limit + 1]) <= limit)

    # ---- soft rules ----
    def _preferences(self) -> None:
        for e, emp in self.ctx.employees.items():
            # Working on a holiday earns a comp-off: allowed but discouraged.
            for i in self.D:
                if self.ctx.is_holiday(i) and self.is_decision(e, i) and i not in self.frozen:
                    self.cost.append(W_HOLIDAY * self.works[e, i])
            pref = emp.get("preferred_off")
            if pref is None:
                continue
            for i in self.D:
                if self.ctx.days[i].weekday() == int(pref) and self.is_decision(e, i) \
                        and not self.ctx.is_holiday(i) and i not in self.frozen:
                    self.cost.append(W_PREF * self.works[e, i])

    def _fairness(self) -> None:
        sundays = [i for i in self.D if self.ctx.days[i].weekday() == SUNDAY]
        counts = []
        for e in self.ctx.employees:
            mine = [i for i in sundays if self.is_decision(e, i)]
            if mine:
                n = self.m.new_int_var(0, len(sundays), f"sun_{e}")
                self.m.add(n == sum(1 - self.works[e, i] for i in mine))
                counts.append(n)
        if len(counts) > 1:
            top = len(sundays)
            hi, lo = self.m.new_int_var(0, top, "sun_hi"), self.m.new_int_var(0, top, "sun_lo")
            self.m.add_max_equality(hi, counts)
            self.m.add_min_equality(lo, counts)
            self.cost.append(W_FAIR * (hi - lo))

    def _stay_close(self) -> None:
        for (e, i), w in self.works.items():
            if i not in self.frozen:
                was = self.old_cell(e, i)["status"] == "WORK"
                self.cost.append(W_CHANGE * ((1 - w) if was else w))
        for (e, b, i), c in self.covers.items():
            if b in self.ctx.backup[e] and i not in self.frozen:
                was = b in self.old_cell(e, i)["covers"]
                self.cost.append(W_COVER_CHANGE * ((1 - c) if was else c))

    # ---- solve + read answer ----
    def solve(self, seconds: float = 20.0) -> dict:
        solver = cp_model.CpSolver()
        p = solver.parameters
        # 8 workers that take turns (interleave) = fast AND same input -> same roster.
        p.num_workers, p.interleave_search, p.random_seed = 8, True, 0
        p.max_deterministic_time = seconds    # deterministic budget, not wall clock
        status = solver.solve(self.m)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            raise ValueError("No roster satisfies the hard rules (check leaves, weekly offs, max consecutive days).")
        return self._read(solver, status == cp_model.OPTIMAL)

    def _read(self, solver: cp_model.CpSolver, optimal: bool) -> dict:
        ctx, entries, comp_offs = self.ctx, {}, []
        for e in ctx.employees:
            row = []
            for i, d in enumerate(ctx.days):
                leave = ctx.leave.get((e, d))
                if solver.value(self.works[e, i]):
                    covers = [b for b in ctx.primary[e] + ctx.backup[e]
                              if (e, b, i) in self.covers and solver.value(self.covers[e, b, i])]
                    row.append({"status": "WORK", "covers": covers})
                    if ctx.is_holiday(i):
                        comp_offs.append({"employee": e, "date": d.isoformat()})
                else:
                    status = leave or ("HOLIDAY" if ctx.is_holiday(i) else "WEEK_OFF")
                    row.append({"status": status, "covers": []})
            entries[e] = row
        return {
            "year": ctx.year,
            "month": ctx.month,
            "days": [d.isoformat() for d in ctx.days],
            "entries": entries,
            "comp_offs_earned": comp_offs,
            "shortage_units": sum(solver.value(s) for s in self.short.values()),
            "optimal": optimal,
        }


def generate(data: dict) -> dict:
    """Build a fresh roster for data['year']/data['month']."""
    return Model(build_ctx(data)).solve()


def diff(old: dict, new: dict) -> list[dict]:
    """Cells whose status or covered brands changed."""
    out = []
    for e, row in new["entries"].items():
        for i, cell in enumerate(row):
            before = old["entries"].get(e, [None] * len(row))[i]
            if before != cell:
                out.append({"employee": e, "date": new["days"][i], "before": before, "after": cell})
    return out


def regenerate(data: dict, old: dict, freeze_before: str | None = None) -> dict:
    """Re-solve after a change, keeping as much of `old` as possible.
    Days before `freeze_before` (ISO date, e.g. today) are locked exactly."""
    fb = date.fromisoformat(freeze_before) if freeze_before else None
    new = Model(build_ctx(data), old=old, freeze_before=fb).solve()
    return {"roster": new, "diff": diff(old, new)}
