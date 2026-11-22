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
import { ShameVideo } from "../shame/ShameVideo";
import type { ShameFinish } from "../shame/ShameVideo";
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

/** What the shame video hands the finale: how it ended, and the file for Download video. */
interface FinaleSceneResult {
  reason: ShameFinish;
  /** The recorded breaking-news video, or the loser's own worst take if that couldn't be recorded. */
  video: Blob | null;
  /** True when `video` is the recorded composite. */
  recorded: boolean;
}

/**
 * Play the shame video (src/shame/ShameVideo.tsx) over everything: BREAKING NEWS intro, the loser cut
 * out of their worst take dancing over the reaction clips in public/shame-clips/, and the /roast
 * headline. It's recorded while it plays. Resolves when it ends or is skipped; it never rejects, so
 * the finale screen always follows.
 */
async function finaleScene(loser: ArcadeRanking, roasting?: Promise<RoastResult> | null): Promise<FinaleSceneResult> {
  const clip = worstAttempt(loser)?.recording ?? null;
  const take = clip?.videoBlob?.size ? clip.videoBlob : null;
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let settled = false;
    const done = (reason: ShameFinish, _detail?: string, video?: Blob | null) => {
      if (settled) return;
      settled = true;
      setTimeout(() => { root.unmount(); host.remove(); }, 0);
      resolve({ reason, video: video ?? take, recorded: !!video });
    };
    try {
      root.render(
        <ShameVideo playerName={loser.player.name} clipUrl={clip?.videoUrl ?? null} clipStartMs={clip?.videoOffsetMs ?? 0}
          clipDurationMs={clip?.durationMs} roast={roasting ?? null} onFinish={done} />,
      );
    } catch {
      done("failed");
    }
  });
}

// Justin's solo mode (game/Game.tsx). His startSoloPreview (game-ui.js) mounts it into the game
// screen through globalThis.CopycatSolo and unmounts it on Back to menu. The menu music
// (home-music.js) keeps playing through solo's setup screen and fades out when the dance starts.
async function mountSolo(element: HTMLElement, onBack: () => void) {
  unmountSolo();
  const root = createRoot(element);
  soloRoot = root;
  const { default: Game } = await import("../game/Game");
  if (soloRoot === root) root.render(<Game onBack={onBack} />);
}

function unmountSolo() {
  if (!soloRoot) return;
  soloRoot.unmount();
  soloRoot = null;
  // Let home-music.js pick the menu track back up (it resyncs on visibilitychange).
  setTimeout(() => document.dispatchEvent(new Event("visibilitychange")), 0);
}

/** Free a finished game's recordings (video object URLs). */
function release(results: ArcadeResult[], extra: (Recording | null | undefined)[] = []) {
  for (const r of [...results.map((x) => x.recording), ...extra]) if (r?.videoUrl) URL.revokeObjectURL(r.videoUrl);
}

Object.assign(globalThis, {
  CopycatTracking: Object.freeze({ mock: MOCK, mount, unmount, score, roast, finaleScene, release, checkHealth }),
  CopycatSolo: Object.freeze({ mount: (element: HTMLElement, onBack: () => void) => void mountSolo(element, onBack), unmount: unmountSolo }),
});
