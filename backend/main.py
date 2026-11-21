"""Copycat backend: scores dance copies and roasts the worst one."""

from typing import Any, Optional

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from roast import RoastInputError, decode_image, make_roast
from scoring import BROKEN_RECORDING_MSG, ScoringError, score_dance

log = logging.getLogger("copycat")

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


def score_error(message: str, reason: str, recording: Optional[str] = None) -> JSONResponse:
    """/score 422: `detail` is shown to players; `reason` and `recording` are for developers."""
    log.warning("/score 422 (%s): %s", recording or "both", reason)
    return JSONResponse(status_code=422,
                        content={"detail": message, "reason": reason, "recording": recording})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Keep /score's 422s player-friendly; other endpoints get FastAPI's default.
    if request.url.path == "/score":
        return score_error(BROKEN_RECORDING_MSG, f"invalid request body: {exc.errors()}")
    return await request_validation_exception_handler(request, exc)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/score")
def score(req: ScoreRequest):
    try:
        return score_dance(req.reference, req.attempt)
    except ScoringError as e:
        return score_error(e.message, e.reason, e.recording)
    except (KeyError, TypeError, ValueError, IndexError) as e:
        return score_error(BROKEN_RECORDING_MSG, f"bad recording format: {type(e).__name__}: {e}")


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
