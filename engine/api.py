"""HTTP door to the engine. Stateless: the website sends all data each call.

Run locally: .venv/bin/uvicorn api:app --reload --port 8000
"""
import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from roster import coverage, generate, regenerate, validate
from roster.sample import sample_data


def check_key(x_engine_key: str | None = Header(default=None)) -> None:
    """When ENGINE_KEY is set (production), only the website may call the solver."""
    key = os.environ.get("ENGINE_KEY")
    if key and not hmac.compare_digest(x_engine_key or "", key):
        raise HTTPException(401, "Missing or wrong X-Engine-Key")


app = FastAPI(title="DataStraw Nexus Roster Engine")


class Config(BaseModel):
    data: dict  # employees, brand_processes, assignments, holidays, leaves, year, month


class WithRoster(Config):
    roster: dict
    freeze_before: str | None = None  # ISO date; days before it are locked on regenerate


def run(fn, *args):
    """Turn engine errors into a clear 422 instead of a crash."""
    try:
        return fn(*args)
    except (ValueError, KeyError) as err:
        raise HTTPException(422, f"Engine could not process the input: {err}") from err


def report(data: dict, roster: dict) -> dict:
    """Everything the website shows next to a roster: issues + per-day coverage."""
    return {"issues": validate(data, roster), "coverage": coverage(data, roster)}


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/sample", dependencies=[Depends(check_key)])
def sample(year: int = 2026, month: int = 12):
    return sample_data(year, month)


@app.post("/generate", dependencies=[Depends(check_key)])
def generate_roster(body: Config):
    roster = run(generate, body.data)
    return {"roster": roster, **report(body.data, roster)}


@app.post("/validate", dependencies=[Depends(check_key)])
def validate_roster(body: WithRoster):
    return run(report, body.data, body.roster)


@app.post("/regenerate", dependencies=[Depends(check_key)])
def regenerate_roster(body: WithRoster):
    out = run(regenerate, body.data, body.roster, body.freeze_before)
    return {**out, **report(body.data, out["roster"])}
