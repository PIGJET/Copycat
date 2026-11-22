// The bridge between Liangray's arcade UI (frontend/src/game/ui-preview/dist, plain JS) and the
// engine: the team recorder, POST /score, POST /roast, the finale scene and Justin's solo mode.
// His scripts talk to it through globalThis.CopycatTracking. Nothing here draws his screens.
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

import { TeamTurnDashboard } from "../components/Game/TeamTurnDashboard";
import type { ArcadeHost } from "../components/Game/TeamTurnDashboard";
import { ApiError, checkHealth, fetchRoast, scoreAttempt } from "../game/api";
import { isMockMode } from "../game/teamTurn";
import type { GameError, Recording, RoastRequest, RoastResult, ScoreResult } from "../game/types";
import { DEFAULT_SCENE_URL as SCENE_URL, FinaleScene } from "../shame/FinaleScene";
import { MockTurn } from "./MockTurn";

/** A player as his lobby stores them. */
interface ArcadePlayer {
  id: string | number;
  name: string;
  avatar?: string;
}

export interface LiveTurn extends ArcadeHost {
  /** His .dashboard-camera-scene: the camera (and creator video) render here. */
  stage: HTMLElement;
  player: ArcadePlayer;
  creator: ArcadePlayer;
  /** The creator's Recording for this round (copiers only). */
  reference?: Recording | null;
  /** Use fake recordings (dev: ?mock=1, or his CONTINUE DEMO). */
  mock?: boolean;
  onRecord: (recording: Recording) => void;
  onSkip?: () => void;
}

/** One of his result rows: { playerId, score: ScoreResult, recording }. */
interface ArcadeResult {
  playerId: string | number;
  score: ScoreResult;
  recording?: Recording | null;
}

/** His ranking row (demoRankings): average total, timing tie-break already applied. */
interface ArcadeRanking {
  player: ArcadePlayer;
  attempts: ArcadeResult[];
  average: number | null;
  timing: number | null;
}

const MOCK = typeof window !== "undefined" && isMockMode(window.location.search);
let turnRoot: Root | null = null;
let turnKey = 0;
let soloRoot: Root | null = null;

const toUi = (p: ArcadePlayer) => ({ id: String(p.id), name: p.name, avatar: p.avatar });

function mount(turn: LiveTurn) {
  unmount();
  turnRoot = createRoot(turn.stage);
  const role = turn.reference ? "copier" : "creator";
  const key = ++turnKey;
  turnRoot.render(
    turn.mock || MOCK
      ? <MockTurn key={key} arcade={turn} role={role} onComplete={turn.onRecord} />
      : <TeamTurnDashboard key={key} arcade={turn} role={role} reference={turn.reference ?? null}
          player={toUi(turn.player)} creator={toUi(turn.creator)} players={[]} round={1} rounds={1}
          onMenu={() => {}} onComplete={turn.onRecord} />,
  );
}

function unmount() {
  turnRoot?.unmount();
  turnRoot = null;
}

/** POST /score. Rejects with { message, recording, status } (recording says who should redo). */
async function score(reference: Recording, attempt: Recording): Promise<ScoreResult> {
  try {
    return await scoreAttempt(reference, attempt);
  } catch (e) {
    throw e instanceof ApiError ? e.error : ({ message: "Scoring failed. Please try again.", recording: null, status: null } satisfies GameError);
  }
}

const mean = (values: (number | null | undefined)[]) => {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
};

/** The loser's lowest-total attempt (earliest wins a tie). */
function worstAttempt(row: ArcadeRanking): ArcadeResult | null {
  return row.attempts.reduce<ArcadeResult | null>((worst, a) => (!worst || a.score.total < worst.score.total ? a : worst), null);
}

/** POST /roast for the loser: their averages plus worst_part from their worst attempt. */
async function roast(loser: ArcadeRanking): Promise<RoastResult> {
  const worst = worstAttempt(loser);
  const body: RoastRequest = {
    player_name: loser.player.name,
    total: mean([loser.average]) ?? 0,
    arms: mean(loser.attempts.map((a) => a.score.arms)),
    legs: mean(loser.attempts.map((a) => a.score.legs)),
    torso: mean(loser.attempts.map((a) => a.score.torso)),
    timing: mean(loser.attempts.map((a) => a.score.timing)),
    worst_part: worst?.score.worst_part ?? null,
  };
  try {
    return await fetchRoast(body);
  } catch (e) {
    throw e instanceof ApiError ? e.error : { message: "The news desk is down. Please try again.", recording: null, status: null };
  }
}

/**
 * Play the full-screen finale scene (frontend/public/scenes/proposal.mp4) with the loser cut out of
 * their worst clip. Resolves when it ends, is skipped, or falls back (no scene file, no clip, too slow).
 */
async function finaleScene(loser: ArcadeRanking): Promise<string> {
  const clip = worstAttempt(loser)?.recording ?? null;
  // Check first so the plain finale doesn't flash a black overlay when there's no scene.
  if (!clip?.videoUrl) return "no-clip";
  const scene = await fetch(SCENE_URL, { method: "HEAD" }).catch(() => null);
  if (!scene?.ok || !(scene.headers.get("content-type") ?? "").startsWith("video/")) return "no-scene";
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    root.render(
      <FinaleScene loserClipUrl={clip?.videoUrl ?? null} clipStartMs={clip?.videoOffsetMs ?? 0} clipDurationMs={clip?.durationMs}
        onFinish={(reason) => {
          setTimeout(() => { root.unmount(); host.remove(); }, 0);
          resolve(reason);
        }} />,
    );
  });
}

/** Justin's solo mode (game/Game.tsx), shown in place of the arcade until Back to menu. */
async function openSolo(onExit: () => void) {
  const { default: Game } = await import("../game/Game");
  const arcade = document.querySelector<HTMLElement>(".arcade");
  const host = document.createElement("div");
  host.id = "solo-root";
  document.body.append(host);
  if (arcade) arcade.hidden = true;
  // His menu music (home-music.js) would keep playing under solo's own music: hold it paused.
  const menu = document.querySelector<HTMLAudioElement>("#home-music");
  const hush = () => menu?.pause();
  menu?.addEventListener("play", hush);
  hush();
  soloRoot = createRoot(host);
  soloRoot.render(<Game onBack={() => {
    soloRoot?.unmount();
    soloRoot = null;
    host.remove();
    menu?.removeEventListener("play", hush);
    if (arcade) arcade.hidden = false;
    onExit();
    // Let home-music.js pick the menu track back up (it resyncs on visibilitychange).
    document.dispatchEvent(new Event("visibilitychange"));
  }} />);
}

/** Free a finished game's recordings (video object URLs). */
function release(results: ArcadeResult[], extra: (Recording | null | undefined)[] = []) {
  for (const r of [...results.map((x) => x.recording), ...extra]) if (r?.videoUrl) URL.revokeObjectURL(r.videoUrl);
}

Object.assign(globalThis, {
  CopycatTracking: Object.freeze({ mock: MOCK, mount, unmount, score, roast, finaleScene, openSolo, release, checkHealth }),
});
