// Unstyled click-through of a whole game: mock recordings, real backend.
// Not wired into App.tsx. To try it, temporarily render <DevHarness /> somewhere.
import { useEffect, useState } from "react";

import { apiUrl, checkHealth } from "./api.ts";
import { mockRecording } from "./mockRecorder.ts";
import { useGame } from "./useGame.ts";
import type { Recording } from "./types.ts";

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toFixed(1));

function blankRecording(): Recording {
  // Nobody in frame: every frame is null, so /score answers with a 422.
  return { frames: Array.from({ length: 200 }, () => null), videoBlob: null, videoUrl: null, durationMs: 10_000 };
}

export default function DevHarness() {
  const game = useGame();
  const [name, setName] = useState("");
  const [health, setHealth] = useState<boolean | null>(null);
  // One random dance per round; copies reuse the round's seed so "good copy" really is close.
  const [gameSeed] = useState(() => Math.floor(Math.random() * 1e6));

  useEffect(() => {
    const controller = new AbortController();
    checkHealth(controller.signal).then(setHealth);
    return () => controller.abort();
  }, []);

  const roundSeed = gameSeed + game.state.roundIndex * 1000;
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;

  return (
    <div style={{ fontFamily: "monospace", padding: 16, maxWidth: 720 }}>
      <h1>Copycat game harness</h1>
      <p>
        Backend {apiUrl()}: {health === null ? "checking…" : health ? "ok" : "NOT REACHABLE"} · phase: <b>{game.phase}</b>
        {game.totalRounds > 0 && ` · round ${game.roundNumber}/${game.totalRounds}`}
      </p>
      {game.error && (
        <p style={{ border: "1px solid", padding: 8 }}>
          Error{game.error.status ? ` ${game.error.status}` : ""}: {game.error.message}
          {game.error.recording && ` (redo: ${game.error.recording === "reference" ? "creator" : "copier"})`}
        </p>
      )}

      {game.phase === "setup" && (
        <section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              game.addPlayer(name);
              setName("");
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" />
            <button type="submit">Add player</button>
          </form>
          <ol>
            {game.players.map((p) => (
              <li key={p.id}>
                {p.name} <button onClick={() => game.removePlayer(p.id)}>remove</button>
              </li>
            ))}
          </ol>
          <label>
            <input type="radio" checked={game.mode === "quick"} onChange={() => game.setMode("quick")} /> Quick (1 round)
          </label>{" "}
          <label>
            <input type="radio" checked={game.mode === "full"} onChange={() => game.setMode("full")} /> Full (everyone creates)
          </label>
          {game.setupError && <p>{game.setupError}</p>}
          <p>
            <button onClick={game.startGame} disabled={!game.canStart}>Start game</button>
          </p>
        </section>
      )}

      {game.phase === "creatorRecording" && (
        <section>
          <h2>{game.creator?.name} records the dance</h2>
          <button onClick={() => game.submitRecording(mockRecording({ seed: roundSeed }))}>Record (mock dance)</button>{" "}
          <button onClick={() => game.submitRecording(blankRecording())}>Record with nobody in frame</button>
        </section>
      )}

      {game.phase === "copying" && (
        <section>
          <h2>{game.currentPlayer?.name} copies {game.creator?.name}</h2>
          <button onClick={() => game.submitRecording(mockRecording({ seed: roundSeed, sloppiness: 0.05, lagMs: 150 }))}>Good copy</button>{" "}
          <button onClick={() => game.submitRecording(mockRecording({ seed: roundSeed, sloppiness: 0.4, lagMs: 400 }))}>Sloppy copy</button>{" "}
          <button onClick={() => game.submitRecording(mockRecording({ seed: roundSeed + 1, sloppiness: 1 }))}>Totally different</button>{" "}
          <button onClick={() => game.submitRecording(blankRecording())}>Nobody in frame</button>
        </section>
      )}

      {game.phase === "scoring" && (
        <section>
          <h2>Scoring {game.currentPlayer?.name}…</h2>
          {game.currentAttempt?.status === "error" && (
            <p>
              <button onClick={game.retryScore}>Retry scoring</button>{" "}
              <button onClick={game.redoAttempt}>{game.currentPlayer?.name} records again</button>{" "}
              <button onClick={game.redoReference}>{game.creator?.name} re-records the dance</button>
            </p>
          )}
        </section>
      )}

      {game.phase === "roundResults" && (
        <section>
          <h2>Round {game.roundNumber} results ({game.creator?.name} created, not scored)</h2>
          <ul>
            {game.roundAttempts.map((a) => (
              <li key={a.id}>
                {nameOf(a.playerId)}: total {fmt(a.score?.total)} · arms {fmt(a.score?.arms)} · legs {fmt(a.score?.legs)} ·
                torso {fmt(a.score?.torso)} · timing {fmt(a.score?.timing)} · worst: {a.score?.worst_part}
              </li>
            ))}
          </ul>
          <button onClick={game.nextStep}>Leaderboard</button>
        </section>
      )}

      {game.phase === "leaderboard" && (
        <section>
          <h2>Leaderboard</h2>
          <ol>
            {game.rankings.map((r) => {
              const change = game.rankChanges.get(r.player.id);
              const move = !change || r.average === null ? "" : change.isNew ? " (new)" : change.delta > 0 ? ` (↑${change.delta})` : change.delta < 0 ? ` (↓${-change.delta})` : " (=)";
              return (
                <li key={r.player.id}>
                  {r.player.name}: avg {fmt(r.average)} · timing {fmt(r.timing)}{move}
                </li>
              );
            })}
          </ol>
          <button onClick={game.nextStep}>{game.isLastRound ? "Breaking news…" : "Next round"}</button>
        </section>
      )}

      {game.phase === "finale" && (
        <section>
          <h2>Loser: {game.loser?.player.name} (avg {fmt(game.loser?.average)})</h2>
          {game.roast.status === "loading" && <p>Developing story…</p>}
          {game.roast.result && (
            <>
              <h3>{game.roast.result.headline}</h3>
              <p>{game.roast.result.roast_line}</p>
              <p>source: {game.roast.result.source}</p>
            </>
          )}
          {game.roast.status === "error" && <button onClick={game.retryRoast}>Retry roast</button>}
          <p>
            <button onClick={game.restart}>Play again (same players)</button>
          </p>
        </section>
      )}
    </div>
  );
}
