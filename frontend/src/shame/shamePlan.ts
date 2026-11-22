// Pure timing and clip-picking helpers for the shame video (no DOM), so they can be unit-tested.

/** The BREAKING NEWS intro (with its sting) lasts at least this long. */
export const INTRO_MS = 2500;
/** Hold the intro at most this long while the clips, model and benchmark get ready. */
export const MAX_PREP_MS = 6000;
/** Whole video, intro included, when the loser has a clip. */
export const TOTAL_MS = 14000;
/** Whole video when the loser has no clip: intro, then the headline card. */
export const HEADLINE_ONLY_MS = 10000;
/** Never play more than this many reaction clips back to back. */
export const MAX_REACTIONS = 2;

/** Just the .mp4 names from the clip list (anything else, or a bad list, is ignored). */
export function clipNames(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.filter((name): name is string => typeof name === "string" && /^[^/\\]+\.mp4$/i.test(name));
}

/** A random pick of up to MAX_REACTIONS different clips. */
export function pickReactions(names: string[], random: () => number = Math.random): string[] {
  const pool = [...new Set(names)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, MAX_REACTIONS);
}

/** How long the intro really lasts: INTRO_MS, longer while still preparing, never past MAX_PREP_MS. */
export function introLength(preparedAtMs: number | null): number {
  return Math.min(MAX_PREP_MS, Math.max(INTRO_MS, preparedAtMs ?? MAX_PREP_MS));
}

/**
 * Split what's left after the intro between the reaction clips (one segment over the dark
 * background when there are none), so the whole video lasts `totalMs`.
 */
export function segmentLengths(introMs: number, clipCount: number, totalMs = TOTAL_MS): number[] {
  const count = Math.max(1, Math.min(MAX_REACTIONS, clipCount));
  const rest = Math.max(0, totalMs - introMs);
  const each = Math.floor(rest / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? rest - each * (count - 1) : each));
}

/** The ticker repeats its text so the 25% scroll in Liangray's .news-ticker animation loops seamlessly. */
export function tickerText(line: string, copies = 4): string[] {
  const text = line.trim() || "More on this developing story";
  return Array.from({ length: copies }, () => text);
}
