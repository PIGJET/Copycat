// The shame video at the start of the team finale (10-15 s, with SKIP):
//   1. BREAKING NEWS intro with a generated sting (the clips and segmenter load meanwhile).
//   2. The loser, cut out of their worst take (dance part only, MediaPipe selfie segmenter),
//      dancing lower-right on top of up to 2 random reaction clips from public/shame-clips/.
//      Too slow (< 15 fps) or failed segmentation: their plain clip in a picture-in-picture box.
//      No reaction clips: the same over a dark BREAKING NEWS background.
//   3. Lower-third banner with the /roast headline and a ticker with the roast line throughout.
// No clip for the loser: intro, then the headline card only. Every failure path still finishes.
import { Component, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { RoastResult } from "../game/types";
import { benchmark, createCutout, loopDance, waitForData } from "./cutout";
import type { Cutout } from "./cutout";
import { MIN_FPS, fpsFromSamples, pushSample, tooSlow } from "./sceneMath";
import { HEADLINE_ONLY_MS, INTRO_MS, MAX_PREP_MS, TOTAL_MS, clipNames, introLength, pickReactions, segmentLengths, tickerText } from "./shamePlan";
import { playSting } from "./sting";
import "./ShameVideo.css";

export type ShameFinish = "ended" | "skipped" | "failed";

export interface ShameVideoProps {
  playerName: string;
  /** Object URL of the loser's worst take. null → headline card only. */
  clipUrl: string | null;
  /** Where the dance starts in the clip (ms); the camera records a countdown before it. */
  clipStartMs?: number;
  /** Loop only [clipStartMs, clipStartMs + clipDurationMs] when given. */
  clipDurationMs?: number;
  /** The /roast call already in flight. */
  roast?: Promise<RoastResult> | null;
  /** Folder of reaction clips, with its index.json (served by vite.config.ts). */
  clipsBase?: string;
  /** Called once, when the video ends, is skipped or gives up. */
  onFinish: (reason: ShameFinish, detail?: string) => void;
}

export const SHAME_CLIPS_BASE = `${import.meta.env.BASE_URL}shame-clips/`;
/** While playing, only switch to the plain clip after this long so one slow frame doesn't. */
const RUNTIME_GRACE_MS = 1500;
/** ...and only with at least this many frames measured after that. */
const MIN_RUNTIME_SAMPLES = 15;
const LIST_TIMEOUT_MS = 3000;

type Phase = "intro" | "cut" | "card";
type Overlay = "cutout" | "pip";

const soundOn = () => document.querySelector("#sound")?.getAttribute("aria-pressed") !== "false";

async function fetchClipList(base: string, signal: AbortSignal): Promise<string[]> {
  try {
    const own = new AbortController();
    const stop = () => own.abort();
    signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, LIST_TIMEOUT_MS);
    const res = await fetch(`${base}index.json`, { signal: own.signal, cache: "no-store" }).finally(() => clearTimeout(timer));
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return [];
    return clipNames(await res.json());
  } catch {
    return [];
  }
}

function ShameVideoInner({ playerName, clipUrl, clipStartMs = 0, clipDurationMs, roast, clipsBase = SHAME_CLIPS_BASE, onFinish }: ShameVideoProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [overlay, setOverlay] = useState<Overlay>("pip");
  const [reactions, setReactions] = useState<string[]>([]);
  const [segment, setSegment] = useState(0);
  const [roasted, setRoasted] = useState<{ from: Promise<RoastResult>; headline: string; line: string } | "failed" | null>(null);
  const clipRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reactionRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const finishRef = useRef<(reason: ShameFinish, detail?: string) => void>(() => {});
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  // The headline: Gemini's (or the backend fallback), DEVELOPING STORY while it loads.
  useEffect(() => {
    let live = true;
    roast?.then((r) => live && setRoasted({ from: roast, headline: r.headline, line: r.roast_line }), () => live && setRoasted("failed"));
    return () => { live = false; };
  }, [roast]);
  const fallback = { headline: `${playerName.toUpperCase()} MAKES THE NEWS`, line: "More on this developing story after the break." };
  const news = !roast || roasted === "failed" ? fallback : roasted?.from === roast ? roasted : null;

  useEffect(() => {
    const controller = new AbortController();
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const started = performance.now();
    const elapsed = () => performance.now() - started;
    let done = false;
    let raf = 0;
    let cutout: Cutout | null = null;
    let mode: Overlay | null = null;
    let wrap = () => {};
    const stopSting = soundOn() ? playSting() : () => {};

    const stopCutout = () => {
      cutout?.close();
      cutout = null;
    };
    const finish = (reason: ShameFinish, detail?: string) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      controller.abort();
      cancelAnimationFrame(raf);
      stopSting();
      stopCutout();
      clipRef.current?.pause();
      reactionRefs.current.forEach((v) => v?.pause());
      if (detail) console.info(`[shame video] ${reason}: ${detail}`);
      onFinishRef.current(reason, detail);
    };
    finishRef.current = finish;
    // Safety net: whatever happens, hand over to the finale screen.
    later(() => finish("ended", "safety timeout"), TOTAL_MS + 2000);

    let begun = false; // the cut or the headline card has been scheduled
    const headlineOnly = (why?: string) => {
      if (done || begun) return;
      begun = true;
      if (why) console.info(`[shame video] headline card only: ${why}`);
      mode = null;
      stopCutout();
      later(() => setPhase("card"), Math.max(0, INTRO_MS - elapsed()));
      later(() => finish("ended"), Math.max(0, HEADLINE_ONLY_MS - elapsed()));
    };

    let pipLogged = false;
    const switchToPip = (why: string) => {
      if (!pipLogged) console.info(`[shame video] picture-in-picture: ${why}`);
      pipLogged = true;
      mode = "pip";
      stopCutout();
      setOverlay("pip");
    };

    // Draw the loser every frame: segment (cut-out) or just keep the plain clip looping (PiP).
    const draw = () => {
      if (done) return;
      wrap();
      raf = requestAnimationFrame(draw);
    };
    let samples: number[] = [];
    const drawCutout = () => {
      if (done || !cutout) return draw();
      let ms: number;
      try {
        ms = cutout.step();
      } catch (e) {
        switchToPip(`segmentation failed (${String(e)})`);
        return draw();
      }
      // Only judge the speed once the cut has settled: the reaction clip starting can stall a
      // frame or two, and one long stall would drag the average down on its own.
      if (performance.now() - cutStarted > RUNTIME_GRACE_MS) samples = pushSample(samples, ms);
      if (samples.length >= MIN_RUNTIME_SAMPLES && tooSlow(samples)) {
        switchToPip(`${fpsFromSamples(samples).toFixed(1)} fps while playing`);
        return draw();
      }
      raf = requestAnimationFrame(drawCutout);
    };

    let cutStarted = 0;
    const startCut = (names: string[]) => {
      if (done || begun) return;
      if (!mode) return headlineOnly("the clip is not ready");
      begun = true;
      cutStarted = performance.now();
      setPhase("cut");
      const lengths = segmentLengths(elapsed(), names.length);
      const playReaction = (i: number) => {
        setSegment(i);
        reactionRefs.current.forEach((v, j) => { if (v && j !== i) v.pause(); });
        const video = reactionRefs.current[i];
        if (!video) return;
        video.currentTime = 0;
        video.muted = !soundOn();
        video.play().catch(() => { video.muted = true; return video.play().catch(() => {}); });
      };
      let at = 0;
      lengths.forEach((ms, i) => {
        if (names.length) later(() => playReaction(i), at);
        at += ms;
      });
      later(() => finish("ended"), at);
      raf = requestAnimationFrame(mode === "cutout" ? drawCutout : draw);
    };

    (async () => {
      if (!clipUrl) return headlineOnly("no clip for the loser");
      const clip = clipRef.current;
      const canvas = canvasRef.current;
      if (!clip || !canvas) return headlineOnly("no video element");

      // The reaction clips load while the intro plays.
      const names = pickReactions(await fetchClipList(clipsBase, controller.signal));
      if (done) return;
      setReactions(names);

      let prepared: number | null = null;
      const go = () => startCut(names);
      // Never hold the intro past MAX_PREP_MS: go with whatever is ready.
      later(() => { if (prepared === null) go(); }, MAX_PREP_MS);

      try {
        await clip.play().catch(() => {});
        await waitForData(clip);
      } catch (e) {
        return headlineOnly(e instanceof Error ? e.message : String(e));
      }
      if (done) return;
      wrap = loopDance(clip, clipStartMs, clipDurationMs);
      mode = "pip"; // the plain clip works from here on; try to upgrade to the cut-out

      try {
        const made = await createCutout(clip, canvas, () => wrap());
        if (done || elapsed() >= MAX_PREP_MS) {
          made.close();
          if (!done) console.info("[shame video] picture-in-picture: the segmenter was not ready in time");
          return;
        }
        cutout = made;
        const bench = await benchmark(made, () => done || elapsed() >= MAX_PREP_MS);
        if (done) return;
        if (elapsed() >= MAX_PREP_MS) return switchToPip("the benchmark was not done in time");
        if (tooSlow(bench)) return switchToPip(`${fpsFromSamples(bench).toFixed(1)} fps < ${MIN_FPS}`);
        console.info(`[shame video] segmentation ~${Math.round(fpsFromSamples(bench))} fps`);
        mode = "cutout";
        setOverlay("cutout");
      } catch (e) {
        if (!done && elapsed() < MAX_PREP_MS) switchToPip(`segmentation failed (${e instanceof Error ? e.message : String(e)})`);
        if (elapsed() >= MAX_PREP_MS) return;
      }
      prepared = elapsed();
      later(go, Math.max(0, introLength(prepared) - elapsed()));
    })().catch((e) => finish("failed", e instanceof Error ? e.message : String(e)));

    return () => {
      // Unmount (or StrictMode re-run): stop quietly without reporting a finish.
      done = true;
      timers.forEach(clearTimeout);
      controller.abort();
      cancelAnimationFrame(raf);
      stopSting();
      stopCutout();
    };
  }, [clipUrl, clipStartMs, clipDurationMs, clipsBase]);

  const cut = phase === "cut";
  const headline = news?.headline ?? "DEVELOPING STORY...";
  return (
    <div className={`shame-video finale-screen is-${phase}`} role="dialog" aria-label="Breaking news">
      <div className="shame-backdrop" aria-hidden="true"><span>BREAKING NEWS</span></div>
      {reactions.map((name, i) => (
        <video key={name} ref={(el) => { reactionRefs.current[i] = el; }} className={`shame-reaction ${cut && segment === i ? "is-active" : ""}`}
          src={`${clipsBase}${encodeURIComponent(name)}`} preload="auto" loop playsInline
          onError={(e) => { e.currentTarget.hidden = true; }} />
      ))}
      <video ref={clipRef} className={`shame-loser shame-pip ${cut && overlay === "pip" ? "is-visible" : ""}`}
        src={clipUrl ?? undefined} muted playsInline aria-label={`${playerName}'s dance`} />
      <canvas ref={canvasRef} className={`shame-loser shame-cutout ${cut && overlay === "cutout" ? "is-visible" : ""}`} aria-hidden="true" />
      {phase === "intro" ? (
        <div className="shame-intro">
          <div className="news-top"><span className="channel-brand">CCN</span><span className="news-banner">Breaking news</span></div>
        </div>
      ) : (
        <div className={`shame-lower-third ${phase === "card" ? "is-card" : ""}`} aria-live="polite">
          <div className="news-top"><span className="channel-brand">CCN</span><span className="news-banner">Breaking news</span></div>
          <div className="news-headline"><span>{playerName}</span><h3>{headline}</h3></div>
          <div className="news-ticker" aria-label={news?.line}>
            <div aria-hidden="true">{tickerText(news?.line ?? "").map((text, i) => <span key={i}>{text} ◆ </span>)}</div>
          </div>
        </div>
      )}
      <button type="button" className="ui-secondary shame-skip" onClick={() => finishRef.current("skipped")}>SKIP</button>
    </div>
  );
}

/** Never let a render error break the finale: report it and move on to the finale screen. */
class ShameBoundary extends Component<{ onError: (detail: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ShameVideo(props: ShameVideoProps) {
  return (
    <ShameBoundary onError={(detail) => props.onFinish("failed", detail)}>
      <ShameVideoInner {...props} />
    </ShameBoundary>
  );
}
