// React hook that runs a whole Copycat game. Screens read `phase` and call the actions.
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { ApiError, fetchRoast, scoreAttempt } from "./api.ts";
import {
  currentAttempt,
  currentPlayerId,
  currentRound,
  gameReducer,
  heldRecordings,
  initialGameState,
} from "./gameReducer.ts";
import type { GameState } from "./gameReducer.ts";
import { allAttempts, pickLoser, rankTransition, roastRequestFor, startError, worstAttempt } from "./rules.ts";
import type { Attempt, GameError, GameMode, Player, Recording, RoastRequest } from "./types.ts";

export interface RoastImageContext {
  loser: Player;
  /** The loser's lowest-scoring attempt; its score has worst_moment.attempt_ms. */
  worstAttempt: Attempt;
  /** The creator's recording for that round; grab the frame at worst_moment.reference_ms. */
  reference: Recording;
}

export interface UseGameOptions {
  initialPlayers?: Player[];
  initialMode?: GameMode;
  /**
   * Optional: return the two worst-moment JPEGs (base64 or data: URLs) for /roast.
   * Return null, or throw, to roast from the stats alone.
   */
  getRoastImages?: (ctx: RoastImageContext) => Promise<{ reference_image: string; attempt_image: string } | null>;
}

function toGameError(e: unknown, fallback: string): GameError {
  if (e instanceof ApiError) return e.error;
  return { message: fallback, recording: null, status: null };
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export function useGame(options: UseGameOptions = {}) {
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    () => initialGameState(options.initialPlayers ?? [], options.initialMode ?? "quick"),
  );
  const stateRef = useRef<GameState>(state);
  const optionsRef = useRef(options);
  useEffect(() => {
    stateRef.current = state;
    optionsRef.current = options;
  });

  // ---- /score: runs whenever the current attempt is waiting to be scored ----
  const attempt = currentAttempt(state);
  const scoringId = attempt?.status === "scoring" ? attempt.id : null;
  useEffect(() => {
    if (!scoringId) return;
    const s = stateRef.current;
    const round = currentRound(s);
    const target = currentAttempt(s);
    if (!round?.reference || !target) return;
    const controller = new AbortController();
    scoreAttempt(round.reference, target.recording, controller.signal)
      .then((score) => dispatch({ type: "scoreSucceeded", attemptId: scoringId, score }))
      .catch((e) => {
        if (isAbort(e)) return;
        dispatch({ type: "scoreFailed", attemptId: scoringId, error: toGameError(e, "Scoring failed. Please try again.") });
      });
    return () => controller.abort();
  }, [scoringId]); // retry flips status error -> scoring, so scoringId goes null -> id and this reruns

  // ---- /roast: runs when the finale starts (or on retry) ----
  const roastLoading = state.phase === "finale" && state.roast.status === "loading";
  useEffect(() => {
    if (!roastLoading) return;
    const s = stateRef.current;
    const attempts = allAttempts(s.rounds);
    const loser = pickLoser(s.players, attempts);
    if (!loser) {
      dispatch({ type: "roastFailed", error: { message: "Nobody was scored, so there's no one to roast.", recording: null, status: null } });
      return;
    }
    const controller = new AbortController();
    (async () => {
      const body: RoastRequest = roastRequestFor(loser, attempts);
      const worst = worstAttempt(attempts, loser.player.id);
      const reference = worst ? s.rounds[worst.roundIndex]?.reference : null;
      const getImages = optionsRef.current.getRoastImages;
      if (getImages && worst && reference) {
        try {
          const images = await getImages({ loser: loser.player, worstAttempt: worst, reference });
          if (images) Object.assign(body, images);
        } catch {
          // Screenshots are optional: roast from the stats alone.
        }
      }
      if (controller.signal.aborted) return;
      try {
        const result = await fetchRoast(body, controller.signal);
        dispatch({ type: "roastSucceeded", result });
      } catch (e) {
        if (isAbort(e)) return;
        dispatch({ type: "roastFailed", error: toGameError(e, "The news desk is down. Please try again.") });
      }
    })();
    return () => controller.abort();
  }, [roastLoading]);

  // ---- free video object URLs of recordings the game no longer holds ----
  const heldUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(heldRecordings(state).map((r) => r.videoUrl).filter((u): u is string => !!u));
    for (const url of heldUrls.current) if (!now.has(url)) URL.revokeObjectURL(url);
    heldUrls.current = now;
  }, [state]);
  useEffect(() => () => heldUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  // ---- derived values for screens ----
  const derived = useMemo(() => {
    const round = currentRound(state);
    const attempts = allAttempts(state.rounds);
    const byId = (id: string | null | undefined) => state.players.find((p) => p.id === id) ?? null;
    const beforeThisRound = state.rounds.slice(0, state.roundIndex).flatMap((r) => r.attempts);
    const throughThisRound = state.rounds.slice(0, state.roundIndex + 1).flatMap((r) => r.attempts);
    const transition = rankTransition(state.players, beforeThisRound, throughThisRound);
    const loser = state.phase === "finale" ? pickLoser(state.players, attempts) : null;
    const turnAttempt = currentAttempt(state);
    return {
      round,
      roundNumber: state.roundIndex + 1,
      totalRounds: state.rounds.length,
      isLastRound: state.roundIndex + 1 >= state.rounds.length,
      creator: byId(round?.creatorId),
      currentPlayer: byId(currentPlayerId(state)),
      currentAttempt: turnAttempt,
      /** This round's scored attempts, in turn order (roundResults screen). */
      roundAttempts: round?.attempts.filter((a) => a.score) ?? [],
      rankings: transition.after,
      /** Rank movement caused by the current round, keyed by player id (leaderboard screen). */
      rankChanges: transition.changes,
      loser,
      loserWorstAttempt: loser ? worstAttempt(attempts, loser.player.id) : null,
      canStart: startError(state.players) === null,
      /** Error to show on the current screen, if any. */
      error: turnAttempt?.error ?? (state.phase === "finale" ? state.roast.error : null),
    };
  }, [state]);

  // ---- actions ----
  const addPlayer = useCallback((name: string) => dispatch({ type: "addPlayer", name }), []);
  const removePlayer = useCallback((id: string) => dispatch({ type: "removePlayer", id }), []);
  const renamePlayer = useCallback((id: string, name: string) => dispatch({ type: "renamePlayer", id, name }), []);
  const setMode = useCallback((mode: GameMode) => dispatch({ type: "setMode", mode }), []);
  const startGame = useCallback(() => dispatch({ type: "startGame" }), []);
  const submitRecording = useCallback((recording: Recording) => dispatch({ type: "submitRecording", recording }), []);
  const nextStep = useCallback(() => dispatch({ type: "nextStep" }), []);
  const retryScore = useCallback(() => dispatch({ type: "retryScore" }), []);
  const redoAttempt = useCallback(() => dispatch({ type: "redoAttempt" }), []);
  const redoReference = useCallback(() => dispatch({ type: "redoReference" }), []);
  const retryRoast = useCallback(() => dispatch({ type: "retryRoast" }), []);
  const restart = useCallback(() => dispatch({ type: "restart" }), []);

  return {
    state,
    phase: state.phase,
    mode: state.mode,
    players: state.players,
    rounds: state.rounds,
    setupError: state.setupError,
    roast: state.roast,
    ...derived,
    addPlayer,
    removePlayer,
    renamePlayer,
    setMode,
    startGame,
    submitRecording,
    nextStep,
    retryScore,
    redoAttempt,
    redoReference,
    retryRoast,
    restart,
  };
}

export type GameApi = ReturnType<typeof useGame>;
