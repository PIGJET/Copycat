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

/** The ticker repeats its text so the 25% scroll in Liangray's .news-ticker animation loops seamlessly. */
export function tickerText(line: string, copies = 4): string[] {
  const text = line.trim() || "More on this developing story";
  return Array.from({ length: copies }, () => text);
}

/** Where the loser stands in a reaction clip, as fractions of the clip's frame. */
export interface LoserPlacement {
  /** Horizontal centre (0 = left edge, 1 = right edge). */
  x: number;
  /** Where their feet touch the floor (0 = top, 1 = bottom). */
  feetY: number;
  /** Their height as a fraction of the frame height. */
  height: number;
}

/** One entry of public/shame-clips/clips.json. Times are seconds in the clip. */
export interface ClipSettings {
  file: string;
  start?: number;
  end?: number;
  insertAt?: number;
  loser?: LoserPlacement;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const fraction = (v: unknown): v is number => num(v) && v >= 0 && v <= 1;

/** Settings by file name. Bad entries (or fields) are dropped, so a typo never breaks the finale. */
export function parseClipSettings(json: unknown): Map<string, ClipSettings> {
  const out = new Map<string, ClipSettings>();
  if (!Array.isArray(json)) return out;
  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const file = clipNames([e.file])[0];
    if (!file) continue;
    const s: ClipSettings = { file };
    if (num(e.start) && e.start >= 0) s.start = e.start;
    if (num(e.end) && e.end > (s.start ?? 0)) s.end = e.end;
    if (num(e.insertAt) && e.insertAt >= (s.start ?? 0) && (s.end === undefined || e.insertAt < s.end)) s.insertAt = e.insertAt;
    const l = e.loser as Record<string, unknown> | undefined;
    if (l && fraction(l.x) && fraction(l.feetY) && num(l.height) && l.height > 0 && l.height <= 1) s.loser = { x: l.x, feetY: l.feetY, height: l.height };
    out.set(file, s);
  }
  return out;
}

/** One reaction clip as it will play. */
export interface ReactionPlan {
  file: string;
  /** Seconds in the clip. */
  start: number;
  /** When the loser appears (seconds in the clip). */
  insertAt: number;
  /** null → the default lower-right spot. */
  loser: LoserPlacement | null;
  /** How long it's on screen. */
  lengthMs: number;
  /** Clips without a set range loop to fill their time. */
  loop: boolean;
}

/** Shortest slot worth giving a clip without a set range. */
export const MIN_FREE_SEGMENT_MS = 4000;

/**
 * The reaction timeline after the intro. A clip with start/end plays exactly that range (so the
 * video can run past TOTAL_MS); the others share what's left of TOTAL_MS and are dropped if that's
 * under MIN_FREE_SEGMENT_MS (the first pick always stays).
 */
export function planReactions(files: string[], settings: Map<string, ClipSettings>, introMs: number, totalMs = TOTAL_MS): ReactionPlan[] {
  const fixedMs = (s?: ClipSettings) => (s?.end !== undefined ? Math.round((s.end - (s.start ?? 0)) * 1000) : null);
  const fixed = files.map((f) => fixedMs(settings.get(f)));
  const fixedTotal = fixed.reduce<number>((a, ms) => a + (ms ?? 0), 0);
  let free = files.filter((_, i) => fixed[i] === null).length;
  const left = Math.max(0, totalMs - introMs - fixedTotal);
  while (free > 0 && left / free < MIN_FREE_SEGMENT_MS && !(free === 1 && files.length === 1)) free--;
  let freeKept = 0;
  const plan: ReactionPlan[] = [];
  files.forEach((file, i) => {
    const s = settings.get(file);
    let lengthMs = fixed[i];
    if (lengthMs === null) {
      if (freeKept >= free) return;
      freeKept++;
      lengthMs = Math.floor(left / free);
    }
    const start = s?.start ?? 0;
    plan.push({ file, start, insertAt: s?.insertAt ?? start, loser: s?.loser ?? null, lengthMs, loop: fixed[i] === null });
  });
  if (!plan.length && files.length) plan.push({ file: files[0], start: 0, insertAt: 0, loser: null, lengthMs: Math.max(0, totalMs - introMs), loop: true });
  return plan;
}

/** A box as fractions (0-1) of the cut-out canvas. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

/**
 * CSS position (px) for the cut-out canvas so the person inside `box` stands at `place` in a
 * reaction video drawn with object-fit: cover in a `screenW` × `screenH` element.
 */
export function placeCutout(box: Box, canvasAspect: number, place: LoserPlacement, video: { w: number; h: number }, screenW: number, screenH: number) {
  const scale = Math.max(screenW / video.w, screenH / video.h);
  const offX = (screenW - video.w * scale) / 2;
  const offY = (screenH - video.h * scale) / 2;
  const personPx = place.height * video.h * scale;
  const boxH = Math.max(0.05, box.y1 - box.y0);
  const height = personPx / boxH;
  const width = height * canvasAspect;
  const feetX = offX + place.x * video.w * scale;
  const feetY = offY + place.feetY * video.h * scale;
  return { left: feetX - ((box.x0 + box.x1) / 2) * width, top: feetY - box.y1 * height, width, height };
}

/** The same spot for the picture-in-picture fallback: a box as tall as the loser, feet on the floor. */
export function placePip(place: LoserPlacement, aspect: number, video: { w: number; h: number }, screenW: number, screenH: number) {
  return placeCutout({ x0: 0, y0: 0, x1: 1, y1: 1 }, aspect, place, video, screenW, screenH);
}
