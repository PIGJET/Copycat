"""Copycat backend: scores dance copies and roasts the worst one."""

from typing import Any, Optional, Literal

import logging
from pathlib import Path
import tempfile

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

import reference_video

from roast import RoastInputError, decode_image, make_roast
from scoring import BROKEN_RECORDING_MSG, ScoringError, score_dance, score_solo_partial

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
    mode: Literal["legacy", "solo_partial"] = "legacy"


class ReferenceVideoRequest(BaseModel):
    url: str
    start_seconds: float = Field(default=0, ge=0, allow_inf_nan=False)
    duration_seconds: float = Field(default=10, ge=5, le=60, allow_inf_nan=False)


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
    if request.url.path == "/reference-video":
        return JSONResponse(status_code=400, content={
            "detail": "Provide a YouTube link, a nonnegative start and a duration between 5 and 60 seconds.",
            "reason": "invalid_request"})
    return await request_validation_exception_handler(request, exc)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/score")
def score(req: ScoreRequest):
    try:
        return score_solo_partial(req.reference, req.attempt) if req.mode == "solo_partial" else score_dance(req.reference, req.attempt)
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


@app.post("/reference-video", response_class=Response)
async def reference_video_import(req: ReferenceVideoRequest, request: Request):
    # One local import at a time; a thread lock works across request event loops.
    if not reference_video.IMPORT_LOCK.acquire(blocking=False):
        return JSONResponse(status_code=503, content={
            "detail": "Another dance is being prepared. Try again shortly.", "reason": "busy"})
    directory = None
    try:
        directory = await run_in_threadpool(tempfile.TemporaryDirectory, prefix="copycat-reference-")
        output = await reference_video.prepare_reference(
            req.url, req.start_seconds, req.duration_seconds, Path(directory.name), request.is_disconnected)
        # Bounded bytes outlive the temporary file, including response disconnects.
        data = await run_in_threadpool(output.read_bytes)
        return Response(content=data, media_type="video/mp4")
    except reference_video.ImportFailure as exc:
        return JSONResponse(status_code=exc.status, content={"detail": exc.detail, "reason": exc.reason})
    except OSError:
        return JSONResponse(status_code=502, content={
            "detail": "Video storage is unavailable. Try again or choose a local MP4.",
            "reason": "storage_error"})
    finally:
        try:
            if directory is not None:
                await run_in_threadpool(directory.cleanup)
        finally:
            reference_video.IMPORT_LOCK.release()
