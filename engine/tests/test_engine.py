"""Engine tests. Run: .venv/bin/python -m pytest -q"""
import copy
from datetime import date

import pytest

from roster import generate, regenerate, validate
from roster.rules import ALL_DAYS, NO_SUN_NO_PH, operates
from roster.sample import sample_data

HARD_TYPES = {"WORK_ON_LEAVE", "COVER_WHILE_OFF", "NOT_ASSIGNED", "BACKUP_OVERLOAD", "NO_WEEKLY_OFF", "TOO_MANY_DAYS"}


@pytest.fixture(scope="module")
def data():
    return sample_data()


@pytest.fixture(scope="module")
def roster(data):
    return generate(data)


def day(r, iso):
    return r["days"].index(iso)


def types(issues):
    return {i["type"] for i in issues}


def test_calendar_rules():
    holidays = {date(2026, 12, 25)}
    sun, xmas = date(2026, 12, 6), date(2026, 12, 25)
    assert operates({"calendar": ALL_DAYS}, xmas, holidays)
    assert not operates({"calendar": NO_SUN_NO_PH}, sun, holidays)
    assert not operates({"calendar": NO_SUN_NO_PH}, xmas, holidays)


def test_sample_shape(data):
    brands = {}
    for a in data["assignments"]:
        if a["role"] == "PRIMARY":
            bp = next(b for b in data["brand_processes"] if b["id"] == a["bp"])
            brands.setdefault(bp["brand"], set()).add(a["employee"])
    single = sum(1 for people in brands.values() if len(people) == 1)
    assert len(data["employees"]) >= 30
    assert single / len(brands) >= 0.75


def test_generated_roster_breaks_no_hard_rule(data, roster):
    assert not types(validate(data, roster)) & HARD_TYPES


def test_same_input_same_roster(data, roster):
    assert generate(data) == roster


def test_unavoidable_gap_is_flagged_not_hidden(data, roster):
    """Kesar Kitchen's only person (Zoya) is on leave on 10 Dec and there is no backup."""
    gaps = [i for i in validate(data, roster) if i["type"] == "COVERAGE_GAP"]
    assert [(g["bp"], g["date"]) for g in gaps] == [("kesarkitchen-cs", "2026-12-10")]
    assert "Zoya Ali: LEAVE" in gaps[0]["message"]
    assert "assign a new backup" in gaps[0]["suggestions"][0]


def test_single_resource_brand_covered_by_backup_on_leave(data, roster):
    """Riya (Bloom Botanics, alone) is on leave 15 Dec: someone else must cover."""
    i = day(roster, "2026-12-15")
    assert roster["entries"]["E05"][i]["status"] == "LEAVE"
    covering = [e for e, row in roster["entries"].items() if "bloombotanics-cs" in row[i]["covers"]]
    assert covering and "E05" not in covering


def test_one_of_three_absent_others_keep_coverage(data, roster):
    """Omkar (1 of 3 on GlowLeaf CS, needs 2) is on leave 22 Dec."""
    i = day(roster, "2026-12-22")
    assert roster["entries"]["E26"][i]["status"] == "LEAVE"
    covering = [e for e, row in roster["entries"].items() if "glowleaf-cs" in row[i]["covers"]]
    assert len(covering) >= 2


def test_manual_edit_is_validated(data, roster):
    edited = copy.deepcopy(roster)
    i = day(edited, "2026-12-15")
    edited["entries"]["E05"][i] = {"status": "WORK", "covers": ["bloombotanics-cs"]}  # Riya is on leave
    j = day(edited, "2026-12-03")
    edited["entries"]["E20"][j] = {"status": "WEEK_OFF", "covers": []}  # Harsh off on a working day
    found = types(validate(data, edited))
    assert "WORK_ON_LEAVE" in found
    assert "COVERAGE_GAP" in found or "EXTRA_WEEKLY_OFF" in found


def test_regenerate_after_new_leave_changes_little(data, roster):
    changed = copy.deepcopy(data)
    changed["leaves"].append({"employee": "E13", "date": "2026-12-18", "type": "LEAVE"})  # Ananya
    out = regenerate(changed, roster, freeze_before="2026-12-12")
    new = out["roster"]
    assert new["entries"]["E13"][day(new, "2026-12-18")]["status"] == "LEAVE"
    assert all(c["date"] >= "2026-12-12" for c in out["diff"])          # past days untouched
    assert len(out["diff"]) <= 4                                        # small change, not a rebuild
    assert not types(validate(changed, new)) & HARD_TYPES


def test_brand_with_nobody_reports_gap_instead_of_crashing(data):
    d = copy.deepcopy(data)
    d["brand_processes"].append({"id": "newbrand-cs", "brand": "New Brand", "process": "CS",
                                 "calendar": ALL_DAYS, "min_staff": 1})
    r = generate(d)
    gaps = [i for i in validate(d, r) if i["bp"] == "newbrand-cs"]
    assert len(gaps) == len(r["days"]) and "nobody is assigned" in gaps[0]["message"]


def test_coverage_matches_validator(data, roster):
    from roster import coverage
    cov = coverage(data, roster)
    i = day(roster, "2026-12-10")
    assert cov["kesarkitchen-cs"][i] == [0, 1]          # the known gap
    assert cov["inkpotstationery-cs"][day(roster, "2026-12-06")][1] == 0  # NO_SUN brand closed on Sunday


def test_engine_key_required_when_set(monkeypatch):
    from fastapi import HTTPException
    from api import check_key

    monkeypatch.delenv("ENGINE_KEY", raising=False)
    check_key(None)  # local dev: open
    monkeypatch.setenv("ENGINE_KEY", "s3cret")
    check_key("s3cret")
    for bad in (None, "wrong"):
        try:
            check_key(bad)
            raise AssertionError("expected 401")
        except HTTPException as err:
            assert err.status_code == 401


def test_stale_roster_edge_cases():
    """Config changed after the roster was made: validate and re-plan must still work."""
    import copy
    from roster import generate, regenerate, validate
    from roster.sample import sample_data

    d = sample_data(2026, 12)
    r = generate(d)
    # Employee deactivated, roster still has them (with 2 offs in one week): no crash, flagged.
    d2 = copy.deepcopy(d)
    d2["employees"] = [e for e in d2["employees"] if e["id"] != "E09"]
    d2["assignments"] = [a for a in d2["assignments"] if a["employee"] != "E09"]
    r2 = copy.deepcopy(r)
    for i in range(7, 14):
        r2["entries"]["E09"][i] = {"status": "WEEK_OFF", "covers": []}
    validate(d2, r2)
    # Locked past already breaks max-consecutive (manual edit): re-plan still finds a roster.
    r3 = copy.deepcopy(r)
    for i in range(9):
        r3["entries"]["E05"][i] = {"status": "WORK", "covers": ["bloombotanics-cs"]}
    out = regenerate(d, r3, "2026-12-10")
    assert any(x["type"] == "TOO_MANY_DAYS" for x in validate(d, out["roster"]))
