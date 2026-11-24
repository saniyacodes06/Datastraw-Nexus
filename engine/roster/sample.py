"""Realistic fictional dataset: 31 employees, 4 pods, 21 brands.

- 17 brands (81%) have ONE dedicated employee doing all their processes.
- 4 brands have 2-3 employees: split processes (Urban Kurta, PetPals),
  a shared process (GlowLeaf CS needs 2 on weekdays), and overlap (FitFuel).
- Single-brand employees back each other up in a ring inside their pod,
  and the pod lead backs up every brand in the pod (up to 2 brands a day).
- Kesar Kitchen is a NEW brand with no backup yet -> its owner's leave
  creates a real, unavoidable gap the validator must flag.
"""
from __future__ import annotations

from .rules import ALL_DAYS as D365, NO_PUBLIC_HOLIDAYS as NOPH, NO_SUN_NO_PH as NOSUN

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)

PODS = {  # pod -> (lead id, lead name)
    "alpha": ("E01", "Neha Kapoor"),
    "bravo": ("E02", "Arjun Mehta"),
    "celeste": ("E03", "Farah Khan"),
    "delta": ("E04", "Vikram Rao"),
}

# (pod, brand, [(process, calendar)], (employee id, name, preferred off))
SINGLE = [
    ("alpha", "Bloom Botanics", [("CS", D365), ("ACC", NOPH)], ("E05", "Riya Sharma", SUN)),
    ("alpha", "Chai Culture", [("CS", NOPH)], ("E06", "Aman Verma", SAT)),
    ("alpha", "Desi Denim", [("CS", D365), ("NDR", NOSUN)], ("E07", "Pooja Iyer", SUN)),
    ("alpha", "Ecoware", [("CS", NOSUN)], ("E08", "Rohan Das", None)),
    ("alpha", "Fable Footwear", [("CS", D365), ("ACC", NOPH), ("RET", NOSUN)], ("E09", "Sneha Patil", WED)),
    ("bravo", "Glamstreet", [("CS", NOPH), ("ACC", NOPH)], ("E10", "Karan Malhotra", SUN)),
    ("bravo", "Herbnest", [("CS", D365)], ("E11", "Ishita Roy", FRI)),
    ("bravo", "Inkpot Stationery", [("CS", NOSUN)], ("E12", "Dev Nair", None)),
    ("bravo", "Jhumka Junction", [("CS", D365), ("NDR", NOPH)], ("E13", "Ananya Joshi", SUN)),
    ("celeste", "Kriya Yogawear", [("CS", NOPH)], ("E14", "Yash Kulkarni", MON)),
    ("celeste", "Loom Lane", [("CS", D365), ("ACC", NOSUN)], ("E15", "Meera Pillai", SUN)),
    ("celeste", "Masala Box", [("CS", NOPH), ("NDR", NOPH)], ("E16", "Siddharth Rao", TUE)),
    ("celeste", "Nimbu Naturals", [("CS", NOSUN)], ("E17", "Tanvi Shah", None)),
    ("delta", "Orbit Gadgets", [("CS", D365), ("RET", NOPH)], ("E18", "Nikhil Bose", SUN)),
    ("delta", "Quill Books", [("CS", NOPH)], ("E19", "Divya Menon", THU)),
    ("delta", "Rangoli Home", [("CS", D365)], ("E20", "Harsh Gupta", SAT)),
    ("delta", "Kesar Kitchen", [("CS", NOSUN)], ("E21", "Zoya Ali", None)),  # new brand, no backup
]

# (pod, brand, [(process, calendar, min, min_by_weekday)], [(id, name, pref, [(process, role)])])
MULTI = [
    ("alpha", "Urban Kurta", [("CS", D365, 1, None), ("ACC", NOPH, 1, None), ("NDR", NOSUN, 1, None)], [
        ("E22", "Kabir Singh", SUN, [("CS", "PRIMARY")]),
        ("E23", "Lavanya Reddy", SAT, [("ACC", "PRIMARY"), ("CS", "BACKUP")]),
        ("E24", "Manav Chawla", None, [("NDR", "PRIMARY")]),
    ]),
    ("bravo", "GlowLeaf", [("CS", D365, 2, {str(SUN): 1}), ("ACC", NOPH, 1, None)], [
        ("E25", "Nisha Agarwal", SUN, [("CS", "PRIMARY"), ("ACC", "PRIMARY")]),  # overlap: CS + ACC
        ("E26", "Omkar Jain", WED, [("CS", "PRIMARY")]),
        ("E27", "Priya Saxena", FRI, [("CS", "PRIMARY")]),
    ]),
    ("celeste", "FitFuel", [("CS", NOPH, 1, None), ("RET", NOSUN, 1, None)], [
        ("E28", "Rahul Khanna", SUN, [("CS", "PRIMARY"), ("RET", "PRIMARY")]),
        ("E29", "Simran Kaur", MON, [("CS", "PRIMARY")]),  # shares CS with Rahul
    ]),
    ("delta", "PetPals", [("CS", D365, 1, None), ("NDR", NOSUN, 1, None)], [
        ("E30", "Tushar Pandey", SUN, [("CS", "PRIMARY")]),
        ("E31", "Uma Krishnan", None, [("NDR", "PRIMARY"), ("CS", "BACKUP")]),
    ]),
]

HOLIDAYS = {"2026-12-25": "Christmas", "2027-01-01": "New Year", "2027-01-26": "Republic Day"}

LEAVES = [
    ("E05", "2026-12-15", "LEAVE"), ("E05", "2026-12-16", "LEAVE"),  # Riya, single-resource brand
    ("E26", "2026-12-22", "LEAVE"),                                   # one of three on GlowLeaf
    ("E11", "2026-12-09", "COMP_OFF"),                                # Ishita uses a comp-off
    ("E21", "2026-12-10", "LEAVE"),                                   # Zoya: no backup -> real gap
]


def slug(text: str) -> str:
    return "".join(c for c in text.lower() if c.isalnum())


def sample_data(year: int = 2026, month: int = 12) -> dict:
    pods, employees, bps, assignments = [], [], [], []

    def add_employee(eid, name, pod, pref, role="Executive", max_backup=1):
        email = name.lower().replace(" ", ".") + "@datastraw.demo"
        employees.append({"id": eid, "name": name, "email": email, "pod": pod, "role": role, "preferred_off": pref,
                          "max_consecutive": 6, "max_backup": max_backup})

    def add_bp(brand, process, cal, pod, mn=1, by_day=None):
        bp = {"id": f"{slug(brand)}-{process.lower()}", "brand": brand, "process": process, "pod": pod,
              "calendar": cal, "min_staff": mn, "min_by_weekday": by_day or {}}
        bps.append(bp)
        return bp["id"]

    def assign(emp, bp, role="PRIMARY"):
        assignments.append({"employee": emp, "bp": bp, "role": role})

    for pod, (lead, name) in PODS.items():
        pods.append({"id": pod, "name": f"Pod {pod.title()}", "lead": lead})
        add_employee(lead, name, pod, SUN, role="Pod Lead", max_backup=2)

    ring: dict[str, list[tuple[str, list[str]]]] = {p: [] for p in PODS}  # pod -> [(emp, bps)]
    for pod, brand, procs, (eid, name, pref) in SINGLE:
        add_employee(eid, name, pod, pref)
        ids = [add_bp(brand, p, cal, pod) for p, cal in procs]
        for b in ids:
            assign(eid, b)
        if brand != "Kesar Kitchen":
            ring[pod].append((eid, ids))

    for pod, brand, procs, people in MULTI:
        ids = {p: add_bp(brand, p, cal, pod, mn, by_day) for p, cal, mn, by_day in procs}
        for eid, name, pref, roles in people:
            add_employee(eid, name, pod, pref)
            for p, role in roles:
                assign(eid, ids[p], role)
        for b in ids.values():
            assign(PODS[pod][0], b, "BACKUP")

    # Backups: each single-brand owner covers the NEXT brand in their pod's ring; lead covers all.
    for pod, members in ring.items():
        for k, (_, ids) in enumerate(members):
            backup_emp = members[(k + 1) % len(members)][0]
            for b in ids:
                assign(backup_emp, b, "BACKUP")
                assign(PODS[pod][0], b, "BACKUP")

    return {
        "year": year, "month": month, "pods": pods, "employees": employees,
        "brand_processes": bps, "assignments": assignments,
        "holidays": list(HOLIDAYS), "holiday_names": HOLIDAYS,
        "leaves": [{"employee": e, "date": d, "type": t} for e, d, t in LEAVES],
        "prev_tail": {},
    }


if __name__ == "__main__":  # python -m roster.sample > ../db/seed.json
    import json
    print(json.dumps(sample_data(), indent=1))
