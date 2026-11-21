// The whole game as a pure reducer. useGame.ts adds the network calls on top.
import type { Attempt, GameError, GameMode, Phase, Player, Recording, RoastResult, RoastState, Round, ScoreResult } from "./types.ts";
import { MAX_PLAYERS, buildRounds, cleanName, nameError, startError } from "./rules.ts";

export interface GameState {
  phase: Phase;
  mode: GameMode;
  players: Player[];
  rounds: Round[];
  roundIndex: number;
  /** Index into the current round's copierIds. */
  copierIndex: number;
  /** Last setup problem (bad name, too many players, can't start). */
  setupError: string | null;
  roast: RoastState;
  /** Counter for stable ids. */
  nextId: number;
}

export type GameAction =
  | { type: "addPlayer"; name: string }
  | { type: "removePlayer"; id: string }
  | { type: "renamePlayer"; id: string; name: string }
  | { type: "setMode"; mode: GameMode }
  | { type: "startGame" }
  | { type: "submitRecording"; recording: Recording }
  | { type: "scoreSucceeded"; attemptId: string; score: ScoreResult }
  | { type: "scoreFailed"; attemptId: string; error: GameError }
  | { type: "retryScore" }
  | { type: "redoAttempt" }
  | { type: "redoReference" }
  | { type: "nextStep" }
  | { type: "roastSucceeded"; result: RoastResult }
  | { type: "roastFailed"; error: GameError }
  | { type: "retryRoast" }
  | { type: "restart" };

const IDLE_ROAST: RoastState = { status: "idle", result: null, error: null };

export function initialGameState(players: Player[] = [], mode: GameMode = "quick"): GameState {
  return {
    phase: "setup",
    mode,
    players,
    rounds: [],
    roundIndex: 0,
    copierIndex: 0,
    setupError: null,
    roast: IDLE_ROAST,
    nextId: players.length + 1,
  };
}

export function currentRound(s: GameState): Round | null {
  return s.rounds[s.roundIndex] ?? null;
}

/** The attempt being scored (or that failed to score) in the current turn. */
export function currentAttempt(s: GameState): Attempt | null {
  if (s.phase !== "scoring") return null;
  const round = currentRound(s);
  return round?.attempts[round.attempts.length - 1] ?? null;
}

/** Whose turn it is: the creator while recording, the copier while copying/scoring. */
export function currentPlayerId(s: GameState): string | null {
  const round = currentRound(s);
  if (!round) return null;
  if (s.phase === "creatorRecording") return round.creatorId;
  if (s.phase === "copying" || s.phase === "scoring") return round.copierIds[s.copierIndex] ?? null;
  return null;
}

function updateRound(s: GameState, update: (r: Round) => Round): Round[] {
  return s.rounds.map((r, i) => (i === s.roundIndex ? update(r) : r));
}

function updateAttempt(s: GameState, attemptId: string, update: (a: Attempt) => Attempt): Round[] {
  return s.rounds.map((r) =>
    r.attempts.some((a) => a.id === attemptId)
      ? { ...r, attempts: r.attempts.map((a) => (a.id === attemptId ? update(a) : a)) }
      : r,
  );
}

export function gameReducer(s: GameState, action: GameAction): GameState {
  switch (action.type) {
    // ---- setup -------------------------------------------------------------
    case "addPlayer": {
      if (s.phase !== "setup") return s;
      if (s.players.length >= MAX_PLAYERS) return { ...s, setupError: `At most ${MAX_PLAYERS} players.` };
      const err = nameError(action.name, s.players);
      if (err) return { ...s, setupError: err };
      const player = { id: `p${s.nextId}`, name: cleanName(action.name) };
      return { ...s, players: [...s.players, player], nextId: s.nextId + 1, setupError: null };
    }
    case "removePlayer":
      if (s.phase !== "setup") return s;
      return { ...s, players: s.players.filter((p) => p.id !== action.id), setupError: null };
    case "renamePlayer": {
      if (s.phase !== "setup") return s;
      const err = nameError(action.name, s.players, action.id);
      if (err) return { ...s, setupError: err };
      const name = cleanName(action.name);
      return { ...s, players: s.players.map((p) => (p.id === action.id ? { ...p, name } : p)), setupError: null };
    }
    case "setMode":
      if (s.phase !== "setup") return s;
      return { ...s, mode: action.mode };
    case "startGame": {
      if (s.phase !== "setup") return s;
      const err = startError(s.players);
      if (err) return { ...s, setupError: err };
      return {
        ...s,
        phase: "creatorRecording",
        rounds: buildRounds(s.mode, s.players),
        roundIndex: 0,
        copierIndex: 0,
        setupError: null,
        roast: IDLE_ROAST,
      };
    }

    // ---- recording and scoring ----------------------------------------------
    case "submitRecording": {
      const round = currentRound(s);
      if (!round) return s;
      if (s.phase === "creatorRecording") {
        // Creator's take becomes the reference. The creator is never scored in their own round.
        return { ...s, phase: "copying", copierIndex: 0, rounds: updateRound(s, (r) => ({ ...r, reference: action.recording })) };
      }
      if (s.phase === "copying") {
        const playerId = round.copierIds[s.copierIndex];
        const attempt: Attempt = {
          id: `a${s.nextId}`,
          roundIndex: s.roundIndex,
          playerId,
          recording: action.recording,
          status: "scoring",
          score: null,
          error: null,
        };
        return {
          ...s,
          phase: "scoring",
          nextId: s.nextId + 1,
          rounds: updateRound(s, (r) => ({ ...r, attempts: [...r.attempts, attempt] })),
        };
      }
      return s;
    }
    case "scoreSucceeded": {
      const attempt = currentAttempt(s);
      if (!attempt || attempt.id !== action.attemptId || attempt.status !== "scoring") return s; // stale
      const rounds = updateAttempt(s, action.attemptId, (a) => ({ ...a, status: "scored", score: action.score, error: null }));
      const round = rounds[s.roundIndex];
      const next = s.copierIndex + 1;
      if (next < round.copierIds.length) return { ...s, rounds, phase: "copying", copierIndex: next };
      return { ...s, rounds, phase: "roundResults" };
    }
    case "scoreFailed": {
      const attempt = currentAttempt(s);
      if (!attempt || attempt.id !== action.attemptId || attempt.status !== "scoring") return s;
      return { ...s, rounds: updateAttempt(s, action.attemptId, (a) => ({ ...a, status: "error", error: action.error })) };
    }
    case "retryScore": {
      const attempt = currentAttempt(s);
      if (!attempt || attempt.status !== "error") return s;
      return { ...s, rounds: updateAttempt(s, attempt.id, (a) => ({ ...a, status: "scoring", error: null })) };
    }
    case "redoAttempt": {
      // The copier records again; their failed attempt is discarded.
      const attempt = currentAttempt(s);
      if (!attempt || attempt.status === "scored") return s;
      return {
        ...s,
        phase: "copying",
        rounds: updateRound(s, (r) => ({ ...r, attempts: r.attempts.filter((a) => a.id !== attempt.id) })),
      };
    }
    case "redoReference": {
      // The creator's take was unusable: re-record it, and everyone in this round copies again.
      if (s.phase !== "scoring" && s.phase !== "copying") return s;
      return {
        ...s,
        phase: "creatorRecording",
        copierIndex: 0,
        rounds: updateRound(s, (r) => ({ ...r, reference: null, attempts: [] })),
      };
    }

    // ---- between rounds and the finale ---------------------------------------
    case "nextStep": {
      if (s.phase === "roundResults") return { ...s, phase: "leaderboard" };
      if (s.phase === "leaderboard") {
        if (s.roundIndex + 1 < s.rounds.length) {
          return { ...s, phase: "creatorRecording", roundIndex: s.roundIndex + 1, copierIndex: 0 };
        }
        return { ...s, phase: "finale", roast: { status: "loading", result: null, error: null } };
      }
      return s;
    }
    case "roastSucceeded":
      if (s.phase !== "finale" || s.roast.status !== "loading") return s;
      return { ...s, roast: { status: "done", result: action.result, error: null } };
    case "roastFailed":
      if (s.phase !== "finale" || s.roast.status !== "loading") return s;
      return { ...s, roast: { status: "error", result: null, error: action.error } };
    case "retryRoast":
      if (s.phase !== "finale" || s.roast.status !== "error") return s;
      return { ...s, roast: { status: "loading", result: null, error: null } };

    case "restart":
      // Same players and mode, fresh game.
      return { ...initialGameState(s.players, s.mode), nextId: s.nextId };
  }
}

/** Every recording still held by the game (for revoking object URLs of discarded ones). */
export function heldRecordings(s: GameState): Recording[] {
  return s.rounds.flatMap((r) => [...(r.reference ? [r.reference] : []), ...r.attempts.map((a) => a.recording)]);
}
