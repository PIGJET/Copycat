# Copycat backend

FastAPI service that scores how well each player copied the dance and writes the
"breaking news" roast for the lowest scorer.

## Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # then paste your Gemini key into .env
.venv/bin/uvicorn main:app --port 8000
.venv/bin/pytest -q         # tests never call the real Gemini API
```

### `.env`

| Variable | Required | What it is |
|---|---|---|
| `GEMINI_API_KEY` | no* | Key from <https://aistudio.google.com/apikey> |
| `GEMINI_MODEL` | no | Defaults to `gemini-3.5-flash-lite` (fast, stable, accepts images) |

\* Without a key, `/roast` still works and returns a canned fallback.
`.env` is gitignored. Never commit it or paste the key into code.

## `GET /health`

```json
{"status": "ok"}
```

## `POST /score`

Send both recordings as MediaPipe Pose landmarks (33 per frame), in the CONTRACT.md format:
`{"t": ms, "lm": [[x, y, visibility], ...]}`. `t` can start anywhere (e.g. `performance.now()`)
and frame rates can differ. Also accepted: `"landmarks"` instead of `"lm"`, 4-value
`[x, y, z, visibility]` lists, and `{"x", "y", "z", "visibility"}` dicts.
Landmarks with visibility below 0.5 are ignored.

Frames that are `null` (no pose detected), or whose `lm` is `null`, are skipped.

**Errors.** Every `/score` 422 has a player-friendly `detail` you can show on screen as is:

```json
{"detail": "We couldn't see enough of you. Step back so your whole body is in frame, then try again.",
 "reason": "only 3 usable frames, need 5",
 "recording": "attempt"}
```

| When | `detail` says |
|---|---|
| Fewer than 5 usable frames | step back so your whole body is in frame |
| Body in frame but blurry / half hidden (no limb visible in both recordings) | step back into good light, whole body in frame |
| Frames span less than ~67 ms | keep dancing for the whole 10 seconds |
| Malformed request or frames (a frontend bug) | something went wrong, record it again |

`reason` is the technical cause (also logged by the server) and `recording` is `"reference"`,
`"attempt"` or `null`. Use it to tell the creator vs. the copier to redo their recording.

```json
{
  "reference": {"frames": [{"t": 0, "lm": [[0.51, 0.22, 0.99], "... 33 total"]}, null, "..."]},
  "attempt":   {"frames": [{"t": 0, "lm": null}, {"t": 33, "lm": ["..."]}, "..."]}
}
```

Response (scores 0-100; `arms`/`legs`/`torso` are `null` if that group was never visible):

```json
{
  "total": 72.4, "arms": 65.0, "legs": 88.1, "torso": 91.3, "timing": 70.2,
  "worst_part": "left forearm",
  "worst_moment": {"reference_ms": 3200, "attempt_ms": 3450},
  "best_moment":  {"reference_ms": 7400, "attempt_ms": 7533},
  "parts": {"left upper arm": 80.1, "left forearm": 41.0, "...": "..."}
}
```

`worst_moment`/`best_moment` are timestamps in each recording's own timeline: use them to
grab the frames for `/roast`.

How the score works: limb directions -> resample to 15 fps -> dynamic time warping
(up to 1 s of drift) -> per-limb angle error (10° is free, 60° or worse is 0). Limbs that
barely move in the reference count less toward `total`, and `total = pose × (0.7 + 0.3 × timing/100)`,
so standing still "on time" doesn't score well. Tuning constants are at the top of `scoring.py`.

## `POST /roast`

```json
{
  "player_name": "Alex",
  "total": 41.2, "arms": 30.5, "legs": 55.0, "torso": 70.1, "timing": 38.0,
  "worst_part": "left forearm",
  "reference_image": "<optional base64 JPEG of the creator at worst_moment.reference_ms>",
  "attempt_image": "<optional base64 JPEG of the player at worst_moment.attempt_ms>"
}
```

Response:

```json
{
  "headline": "BREAKING: Alex's left forearm scores 30/100, experts baffled",
  "roast_line": "You were supposed to raise your arms, not hail a taxi.",
  "source": "gemini"
}
```

- `source` is `"gemini"` or `"fallback"`. The endpoint returns 200 even if Gemini is down,
  slow (> 8 s), returns bad JSON or breaks the length rules, or no key is set. In all of
  those cases you get a random canned roast with `source: "fallback"`.
- Headline starts with `BREAKING:` and is under 90 chars; roast line is under 120.
- Images are only used when **both** are sent. Plain base64 or a `data:image/jpeg;base64,...`
  URL both work (e.g. `canvas.toDataURL("image/jpeg", 0.7)`). Gemini is told to compare poses
  only and never comment on the person. Requests are sent with `store=false`.
- Errors: missing/blank `player_name` -> 400, invalid base64 -> 400,
  any image over 2 MB -> 413, missing `total` -> 422.
- `total` is required; the other scores and `worst_part` are optional, so you can pass
  `/score`'s output straight through.

## Dance-video import: `POST /reference-video`

Backend support for a local YouTube-reference workflow. The frontend game/reference processor
is separate lane work; the current Camera screen does not call this endpoint yet.

Install native tools on the Mac running uvicorn:

```bash
brew install yt-dlp ffmpeg node
which yt-dlp ffmpeg ffprobe node
yt-dlp --version
node --version
```

Restart uvicorn after changing PATH. FFmpeg must support the scale filter’s reset_sar option
(tested with FFmpeg 9.0.2); this preserves display aspect ratio when producing square pixels. yt-dlp uses the explicitly selected Node runtime and
its EJS components; see [runtime setup](https://github.com/yt-dlp/yt-dlp/wiki/EJS).
Homebrew's native yt-dlp is invoked directly; no Python yt-dlp/ffmpeg package is required.
The importer ignores personal yt-dlp configuration, disables disk cache, and uses no cookies.
It does not attempt to bypass unavailable/private/blocked sources.

```bash
curl --fail-with-body http://localhost:8000/reference-video \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://www.youtube.com/watch?v=BaW_jenozKc","start_seconds":0,"duration_seconds":5}' \
  --output /tmp/copycat-reference.mp4
```

The URL above is an example/test-video ID, not a guarantee of continued availability. Use an
authorized video. Error bodies are JSON; check the status/content type before playing output.

The endpoint returns a completed `video/mp4` response. It retrieves a bounded full source,
accurately trims the selected section via transcoding, then verifies H.264/yuv420p, dimensions,
both container and visual-stream duration (within 250 ms of requested) and near-zero
start times using ffprobe. A long audio track cannot mask a truncated visual stream. The final clip
is its own timeline; do not add the original YouTube start offset to score timestamps.
Reference frames are extracted in the browser with MediaPipe, not by FFmpeg or this endpoint.
Game should fetch a Blob, create an object URL and revoke it when no longer used.

Limits: section 5–60 seconds; one import per process; 180-second total deadline; approximately
250 MiB temporary data, sampled every 100 ms; final output <=100 MiB; metadata <=1 MiB.
Native subprocess groups are terminated on timeout, size excess or request disconnect.
Temporary files are always cleaned before the bounded response bytes are sent. A bounded
100 MiB response can occupy memory until sent; do not run this local demo with multiple workers.
Full-source retrieval can exceed the budget even for a short selected section. Use a shorter
source or permitted local MP4 if that happens. No persistent video library or job queue is created.

Errors: 400 input/source; 502 retrieval/conversion/size/storage; 503 tools missing/busy;
504 timeout. `detail` is safe to display; `reason` is a stable developer category. Client
cancellation terminates processing; the internal disconnected category uses 499.

Tests never download YouTube. `test_reference_video.py` mocks retrieval/API failures and
runs real native process supervision; its FFmpeg normalization smoke test runs only when
ffmpeg/ffprobe are available. Existing scoring/roast tests remain unchanged.

Synthetic scoring profile on the development Mac (15 fps, current unmodified scorer):
10 s: ~0.010 s; 30 s: ~0.045 s; 60 s: ~0.182 s. Process high-water memory reached ~315 MiB
by the 60-second case. This is synthetic evidence, not a webcam accuracy benchmark. The
scorer allocates all frame-pair costs before banded DTW, so longer durations are not enabled.

Reference architecture: [Jigglewiggle](https://github.com/cindyzli/jigglewiggle) documents local
MP4 download followed by browser MediaPipe extraction. This implementation uses Copycat's
existing FastAPI stack and returns a completed clip in one response instead of adding a
persistent video-serving route. [yt-dlp options](https://github.com/yt-dlp/yt-dlp),
[FFmpeg documentation](https://ffmpeg.org/ffmpeg.html).

Live retrieval check: yt-dlp returned “video unavailable” for the public test ID used during
development. Native conversion is verified, but a successful live YouTube import still needs
to be checked with a working authorized source on the demo network.
