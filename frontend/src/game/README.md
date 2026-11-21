Game lane: players, rounds, calling /score, running averages and picking the loser (see CONTRACT.md).

## Solo dance challenge

Start the FastAPI backend on port 8000 from `backend/` and run `npm run dev`
from `frontend/`. Open `/src/game/solo.html` on the Vite server to exercise the
Game lane. To use a different backend URL, set `VITE_API_BASE_URL` before starting
Vite. The shared React entry point can mount the default export from `Game.tsx`
once the team coordinates that change.

Choose **Use sample link** and **Prepare clip** for the verified 5–10 second
section, or choose a permitted local MP4. Preview the clip, get ready, and
start your turn. Follow the live rating, then review the official score and
paired replay. **Retry score** reuses the captured poses after a request failure.
The webcam video stays local to the browser.

From `frontend/`, run `node --test src/utils/*.test.mjs src/game/game.test.mjs
src/game/ui-preview/tests/*.test.cjs`, `npm run lint`, and `npm run build`.
