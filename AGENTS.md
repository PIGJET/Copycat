# Rules for agents (Claude Code, Codex, Copilot) and humans

Copycat is a 36-hour Hack Western 13 project. Keep it simple: no databases, auth, extra endpoints
or new frameworks unless the team agrees.

## Before you start

1. Read [`CONTRACT.md`](CONTRACT.md). It defines every request, response and data format shared between lanes.
2. Work on your lane's branch (`recorder`, `game`, `shame`, or the backend branch). Get changes into `main` through PRs.
3. Pull `main` often, and merge it into your branch so you see the other lanes' work.

## Stay in your lane

- Only edit files in your lane's folder (see the Lanes table in `CONTRACT.md`).
- If you need something changed in another lane's folder, **stop and tell your human**. Don't edit it yourself.
- Root files (`CONTRACT.md`, `AGENTS.md`, root config) are shared. Change them only after telling the team.

## The contract

- Code to `CONTRACT.md`, not to what you guess the other lane does.
- If the contract seems wrong or is missing something, tell your human. Don't quietly work around it.
- A contract change ships with matching code and tests in the lanes it affects, or it doesn't ship.

## Secrets

- API keys go in `.env` files, which are gitignored. Commit only `.env.example` with placeholders.
- Never print, log or commit a key. Gemini is called **only from the backend**, never from the browser.

## Commits

- Small commits with clear messages. No AI co-author lines (`Co-Authored-By:` and the like).
- Don't force-push shared branches (`main`, or any lane another person is on) without asking the team.
- Run your lane's tests before pushing. Backend: `cd backend && .venv/bin/pytest -q`. Gemini is mocked, so tests are free.

## When in doubt

Ask your human. A one-line question is cheaper than a broken demo.
