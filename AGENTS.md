# Rules for agents (Claude Code, Codex, Copilot) and humans

Copycat is a 36-hour Hack Western 13 project. Keep it simple: no databases, auth, extra endpoints
or new frameworks unless the team agrees. The [README](README.md) explains how the game and the code fit together.

## Before you start

1. Read [`CONTRACT.md`](CONTRACT.md). It defines the backend API, the Recording format and the
   bridge between the arcade UI and the engine.
2. Branch from `main` (`git fetch origin` first), one branch per change. Get changes into `main`
   through pull requests, merged with a regular merge commit.
3. Pull `main` often so you build on everyone else's work.

## Who owns what

| Area | Folder | Owner |
|---|---|---|
| Arcade UI (screens, styles, fonts, music, song catalog) | `frontend/src/game/ui-preview/dist/` | Liangray |
| Engine bridge, team recorder, mock turns | `frontend/src/arcade/`, `frontend/src/components/Game/` | Clement |
| Solo mode, reference import, replay timeline | `frontend/src/game/Game.tsx` and solo files, `frontend/src/components/Camera/`, `backend/reference_video.py` | Justin |
| Breaking-news video and finale download | `frontend/src/shame/`, `ui-preview/dist/finale-video.js` | Clement |
| Backend scoring and roast | `backend/` | Clement |
| Music system, combos, how-to-play, Pages deploy | `frontend/src/game/danceCue.ts`, `.github/workflows/` | John |

- Changing someone else's area is fine when the change needs it, but say so in the PR and keep the
  change small. Don't redesign another person's screens.
- Root files (`README.md`, `CONTRACT.md`, `AGENTS.md`, root config) are shared. Tell the team before
  changing them.

## The contract

- Code to `CONTRACT.md`, not to what you guess the other side does.
- If the contract seems wrong or is missing something, tell your human. Don't quietly work around it.
- A contract change ships with matching code and tests on both sides, or it doesn't ship.

## Secrets and files that stay local

- API keys go in `.env` files, which are gitignored. Commit only `.env.example` with placeholders.
- Never print, log or commit a key. Gemini is called **only from the backend**, never from the browser.
- The repo is public. Never commit song files (`frontend/.song-cache/`), reaction clips
  (`frontend/public/shame-clips/*.mp4`), camera recordings or downloaded videos.
- MediaPipe's wasm and models are served locally (`frontend/src/utils/mediapipeAssets.ts`). Don't
  load them from a CDN: the game has to work offline at a demo.

## Commits

- Small commits with clear messages. No AI co-author lines (`Co-Authored-By:` and the like).
- Don't force-push shared branches (`main`, or a branch another person is on) without asking the team.
- Before pushing, run the checks for what you changed:
  - Backend: `cd backend && .venv/bin/python -m pytest -q` (Gemini is mocked, so tests are free).
  - Frontend: `cd frontend && npm run lint && npm run build && node --test $(find src -name "*.test.mjs" -o -name "*.test.cjs")`.

## When in doubt

Ask your human. A one-line question is cheaper than a broken demo.
