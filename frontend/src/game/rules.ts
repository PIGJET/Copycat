// Pure game rules: no React, no network. Matches the ui-preview rules (demo-model.test.cjs).
import type { Attempt, GameMode, Player, RankChange, RankingRow, RoastRequest, Round } from "./types.ts";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const MAX_NAME_LENGTH = 20;

export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

/** Why a name can't be added, or null if it's fine. */
export function nameError(name: string, players: Player[], exceptId?: string): string | null {
  const clean = cleanName(name);
  if (!clean) return "Enter a name.";
  const taken = players.some(
    (p) => p.id !== exceptId && p.name.toLocaleLowerCase() === clean.toLocaleLowerCase(),
  );
  return taken ? `${clean} is already playing. Pick a different name.` : null;
}

/** Why the game can't start yet, or null if it can. */
export function startError(players: Player[]): string | null {
  if (players.length < MIN_PLAYERS) return `Add at least ${MIN_PLAYERS} players.`;
  if (players.length > MAX_PLAYERS) return `At most ${MAX_PLAYERS} players.`;
  for (const p of players) {
    const err = nameError(p.name, players, p.id);
    if (err) return err;
  }
  return null;
}

/** Quick: player 1 creates once. Full: every player creates once, in player order. */
export function creatorOrder(mode: GameMode, players: Player[]): string[] {
  return mode === "quick" ? players.slice(0, 1).map((p) => p.id) : players.map((p) => p.id);
}

/** Builds the rounds. Copiers are everyone except the creator, in player order. */
export function buildRounds(mode: GameMode, players: Player[]): Round[] {
  return creatorOrder(mode, players).map((creatorId, index) => ({
    index,
    creatorId,
    reference: null,
    copierIds: players.filter((p) => p.id !== creatorId).map((p) => p.id),
    attempts: [],
  }));
}

export function allAttempts(rounds: Round[]): Attempt[] {
  return rounds.flatMap((r) => r.attempts);
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function meanOf(attempts: Attempt[], pick: (a: Attempt) => number | null | undefined): number | null {
  return mean(attempts.map(pick).filter((v): v is number => typeof v === "number" && Number.isFinite(v)));
}

/**
 * Leaderboard, best first. Only scored attempts count, and creators are never scored
 * in their own round (they don't have attempts there).
 *   - higher average total ranks higher
 *   - tie: higher average timing ranks higher (so lower timing loses)
 *   - still tied: earlier in the player list ranks higher
 *   - players with no scored attempts go last, unranked (average null, never 0)
 */
export function rankings(players: Player[], attempts: Attempt[]): RankingRow[] {
  return players
    .map((player, index) => {
      const scored = attempts.filter((a) => a.playerId === player.id && a.score !== null);
      return {
        player,
        index,
        attempts: scored,
        average: meanOf(scored, (a) => a.score?.total),
        timing: meanOf(scored, (a) => a.score?.timing),
      };
    })
    .sort((a, b) => {
      if (a.average === null) return b.average === null ? a.index - b.index : 1;
      if (b.average === null) return -1;
      return b.average - a.average || (b.timing ?? 0) - (a.timing ?? 0) || a.index - b.index;
    });
}

/** Rank movement between two snapshots, keyed by player id. Ranks start at 1. */
export function rankTransition(
  players: Player[],
  before: Attempt[],
  after: Attempt[],
): { before: RankingRow[]; after: RankingRow[]; changes: Map<string, RankChange> } {
  const b = rankings(players, before);
  const a = rankings(players, after);
  const ranksOf = (rows: RankingRow[]) =>
    new Map(rows.filter((r) => r.average !== null).map((r, i) => [r.player.id, i + 1]));
  const prev = ranksOf(b);
  const curr = ranksOf(a);
  const changes = new Map<string, RankChange>(
    a.map((row) => {
      const previous = prev.get(row.player.id) ?? null;
      const current = curr.get(row.player.id) ?? null;
      return [
        row.player.id,
        {
          previous,
          current,
          delta: previous !== null && current !== null ? previous - current : 0,
          isNew: previous === null && current !== null,
        },
      ];
    }),
  );
  return { before: b, after: a, changes };
}

/** The loser: lowest-ranked player who has a score. null if nobody was scored. */
export function pickLoser(players: Player[], attempts: Attempt[]): RankingRow | null {
  const ranked = rankings(players, attempts).filter((r) => r.average !== null);
  return ranked.length ? ranked[ranked.length - 1] : null;
}

/** The player's lowest-total scored attempt (earliest wins a tie). */
export function worstAttempt(attempts: Attempt[], playerId: string): Attempt | null {
  let worst: Attempt | null = null;
  for (const a of attempts) {
    if (a.playerId !== playerId || !a.score) continue;
    if (!worst || a.score.total < (worst.score?.total ?? Infinity)) worst = a;
  }
  return worst;
}

const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/** /roast body for the loser: their averages, plus worst_part from their worst attempt. */
export function roastRequestFor(row: RankingRow, attempts: Attempt[]): RoastRequest {
  const mine = row.attempts;
  const worst = worstAttempt(attempts, row.player.id);
  return {
    player_name: row.player.name,
    total: round1(row.average) ?? 0,
    arms: round1(meanOf(mine, (a) => a.score?.arms)),
    legs: round1(meanOf(mine, (a) => a.score?.legs)),
    torso: round1(meanOf(mine, (a) => a.score?.torso)),
    timing: round1(row.timing),
    worst_part: worst?.score?.worst_part ?? null,
  };
}
