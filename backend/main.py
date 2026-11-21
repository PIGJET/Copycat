"""Copycat backend: scores dance copies and roasts the worst one."""

from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from roast import RoastInputError, decode_image, make_roast
from scoring import ScoringError, score_dance

app = FastAPI(title="Copycat backend")

# One-laptop party game: the frontend runs locally, so allow any origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScoreRequest(BaseModel):
    reference: Any
    attempt: Any


class RoastRequest(BaseModel):
    player_name: Optional[str] = None
    total: float
    arms: Optional[float] = None
    legs: Optional[float] = None
    torso: Optional[float] = None
    timing: Optional[float] = None
    worst_part: Optional[str] = None
    reference_image: Optional[str] = None
    attempt_image: Optional[str] = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/score")
def score(req: ScoreRequest) -> dict[str, Any]:
    try:
        return score_dance(req.reference, req.attempt)
    except ScoringError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except (KeyError, TypeError, ValueError, IndexError) as e:
        raise HTTPException(status_code=422, detail=f"bad recording format: {e}")


@app.post("/roast")
async def roast(req: RoastRequest) -> dict[str, str]:
    if not req.player_name or not req.player_name.strip():
        raise HTTPException(status_code=400, detail="player_name is required")
    try:
        ref_img = decode_image(req.reference_image, "reference_image")
        att_img = decode_image(req.attempt_image, "attempt_image")
    except RoastInputError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)
    stats = {"total": req.total, "arms": req.arms, "legs": req.legs,
             "torso": req.torso, "timing": req.timing}
    return await make_roast(req.player_name, stats, req.worst_part, ref_img, att_img)
