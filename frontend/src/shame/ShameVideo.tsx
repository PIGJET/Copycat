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
import { HEADLINE_ONLY_MS, INTRO_MS, MAX_PREP_MS, TOTAL_MS, clipNames, introLength, parseClipSettings, pickReactions, placeCutout, placePip, planReactions, tickerText } from "./shamePlan";
import type { Box, ClipSettings, ReactionPlan } from "./shamePlan";
import { ShameRecorder, canRecord } from "./recorder";
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
  /**
   * Called once, when the video ends, is skipped or gives up. `video` is the recording of the
   * composite as shown (for Download video), or null when it couldn't be recorded: unsupported
   * browser, no reaction clips, segmentation fell back, or skipped before the loser appeared.
   */
  onFinish: (reason: ShameFinish, detail?: string, video?: Blob | null) => void;
}

export const SHAME_CLIPS_BASE = `${import.meta.env.BASE_URL}shame-clips/`;
/** While playing, only switch to the plain clip after this long so one slow frame doesn't. */
const RUNTIME_GRACE_MS = 1500;
/** ...and only with at least this many frames measured after that. */
const MIN_RUNTIME_SAMPLES = 15;
const LIST_TIMEOUT_MS = 3000;
/** Reaction clips play a little quieter so the gasp still lands without drowning everything. */
const REACTION_VOLUME = 0.75;
/** How fast the cut-out's placement follows the dancer's outline (per frame), to avoid jitter. */
const BOX_SMOOTHING = 0.15;
/** A clip with a set end may run this much past its planned length (buffering) before we move on. */
const END_SLACK_MS = 1500;

type Phase = "intro" | "cut" | "card";
type Overlay = "cutout" | "pip";

const soundOn = () => document.querySelector("#sound")?.getAttribute("aria-pressed") !== "false";

/** GET a JSON file next to the clips; null if it's missing, slow or broken. */
async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  try {
    const own = new AbortController();
    const stop = () => own.abort();
    signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, LIST_TIMEOUT_MS);
    const res = await fetch(url, { signal: own.signal, cache: "no-store" }).finally(() => clearTimeout(timer));
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The clip names (index.json) and their optional per-clip settings (clips.json). */
async function fetchClips(base: string, signal: AbortSignal): Promise<{ names: string[]; settings: Map<string, ClipSettings> }> {
  const [list, settings] = await Promise.all([fetchJson(`${base}index.json`, signal), fetchJson(`${base}clips.json`, signal)]);
  return { names: clipNames(list), settings: parseClipSettings(settings) };
}

const clearPlacement = (el: HTMLElement) => {
  for (const prop of ["left", "top", "right", "bottom", "width", "height", "maxWidth"] as const) el.style[prop] = "";
};

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
  // The recorder redraws the banner from these every frame.
  const live = useRef({ phase, playerName, headline: "", line: "" });
  useEffect(() => {
    live.current = { phase, playerName, headline: news?.headline ?? "DEVELOPING STORY...", line: news?.line ?? "" };
  });

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

    // Recording for Download video: one AudioContext feeds the speakers (silent with SOUND off)
    // and the recorder, which redraws the composite onto its own canvas.
    let audio: AudioContext | null = null;
    let speakers: GainNode | null = null;
    let recorder: ShameRecorder | null = null;
    if (clipUrl && canRecord()) {
      try {
        audio = new AudioContext();
        void audio.resume().catch(() => {});
        speakers = audio.createGain();
        speakers.gain.value = soundOn() ? 1 : 0;
        speakers.connect(audio.destination);
        recorder = new ShameRecorder(audio);
      } catch (e) {
        console.info(`[shame video] can't record: ${e instanceof Error ? e.message : String(e)}`);
        void audio?.close().catch(() => {});
        audio = null;
        speakers = null;
        recorder = null;
      }
    }
    /** The composite is only worth saving if the loser was cut out over a reaction clip throughout. */
    let composite = true;
    let loserEverShown = false;
    let loserVisible = false;
    const noComposite = (why: string) => {
      if (composite && recorder) console.info(`[shame video] download falls back to the loser's take: ${why}`);
      composite = false;
    };
    const stopSting = audio && speakers && recorder
      ? playSting({ ctx: audio, outputs: [speakers, recorder.audioIn] })
      : soundOn() ? playSting() : () => {};
    const routed = new WeakSet<HTMLVideoElement>();
    /** Send a reaction clip's audio through the AudioContext (to the speakers and the recording). */
    const routeAudio = (video: HTMLVideoElement): boolean => {
      if (!audio || !speakers || !recorder) return false;
      if (routed.has(video)) return true;
      try {
        const gain = audio.createGain();
        gain.gain.value = REACTION_VOLUME;
        audio.createMediaElementSource(video).connect(gain);
        gain.connect(speakers);
        gain.connect(recorder.audioIn);
        routed.add(video);
        return true;
      } catch {
        return false;
      }
    };

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
      const rec = recorder;
      recorder = null;
      if (!rec) {
        void audio?.close().catch(() => {});
        return onFinishRef.current(reason, detail, null);
      }
      if (!loserEverShown) noComposite("the loser never appeared");
      if (mode !== "cutout") noComposite("the loser wasn't cut out");
      void rec.stop().then((video) => {
        void audio?.close().catch(() => {});
        if (video && composite) console.info(`[shame video] recorded ${(video.size / 1e6).toFixed(1)} MB ${video.type}`);
        onFinishRef.current(reason, detail, composite ? video : null);
      });
    };
    finishRef.current = finish;
    // Safety net: whatever happens, hand over to the finale screen (moved once the cut's length is known).
    let safety = window.setTimeout(() => finish("ended", "safety timeout"), TOTAL_MS + 2000);
    timers.push(safety);

    let begun = false; // the cut or the headline card has been scheduled
    const headlineOnly = (why?: string) => {
      if (done || begun) return;
      begun = true;
      if (why) console.info(`[shame video] headline card only: ${why}`);
      noComposite("headline card only");
      mode = null;
      stopCutout();
      later(() => setPhase("card"), Math.max(0, INTRO_MS - elapsed()));
      later(() => finish("ended"), Math.max(0, HEADLINE_ONLY_MS - elapsed()));
    };

    let pipLogged = false;
    const switchToPip = (why: string) => {
      if (!pipLogged) console.info(`[shame video] picture-in-picture: ${why}`);
      pipLogged = true;
      noComposite(`picture-in-picture (${why})`);
      mode = "pip";
      stopCutout();
      setOverlay("pip");
    };

    // Where the loser stands: clips.json's spot for the playing clip (feet on the floor), or the
    // default lower-right CSS spot. Hidden until the clip reaches insertAt.
    let plan: ReactionPlan[] = [];
    let planNames: string[] = [];
    let active = -1;
    /** The <video> for plan entry i (the elements are rendered in pick order, not plan order). */
    const reactionAt = (i: number) => (plan[i] ? reactionRefs.current[planNames.indexOf(plan[i].file)] ?? null : null);
    let smooth: Box | null = null;
    let loserShown = false;
    let advance: (i: number) => void = () => {};
    const layoutLoser = () => {
      const p = plan[active];
      const reaction = reactionAt(active);
      if (p && reaction && !p.loop && reaction.currentTime >= p.start + p.lengthMs / 1000 - 0.03) return advance(active + 1);
      const el = mode === "cutout" ? canvasRef.current : clipRef.current;
      if (!el) return;
      const waiting = !!(p && reaction && reaction.currentTime < p.insertAt - 0.05);
      el.style.visibility = waiting ? "hidden" : "";
      loserVisible = !waiting;
      if (loserVisible) loserEverShown = true;
      if (p && reaction && !waiting && !loserShown) {
        loserShown = true;
        // Start their dance from its first beat the moment they appear.
        const clip = clipRef.current;
        if (clip) clip.currentTime = clipStartMs / 1000;
        console.info(`[shame video] ${p.file}: loser appears at ${reaction.currentTime.toFixed(1)} s`);
      }
      if (!p?.loser || !reaction?.videoWidth) return clearPlacement(el);
      const video = { w: reaction.videoWidth, h: reaction.videoHeight };
      let spot;
      if (mode === "cutout" && cutout) {
        const box = cutout.box();
        if (box) smooth = smooth ? {
          x0: smooth.x0 + (box.x0 - smooth.x0) * BOX_SMOOTHING, y0: smooth.y0 + (box.y0 - smooth.y0) * BOX_SMOOTHING,
          x1: smooth.x1 + (box.x1 - smooth.x1) * BOX_SMOOTHING, y1: smooth.y1 + (box.y1 - smooth.y1) * BOX_SMOOTHING,
        } : box;
        spot = placeCutout(smooth ?? { x0: 0, y0: 0, x1: 1, y1: 1 }, cutout.aspect, p.loser, video, reaction.clientWidth, reaction.clientHeight);
      } else {
        const clip = clipRef.current;
        const aspect = clip?.videoWidth ? clip.videoWidth / clip.videoHeight : 4 / 3;
        spot = placePip(p.loser, aspect, video, reaction.clientWidth, reaction.clientHeight);
      }
      Object.assign(el.style, { left: `${spot.left}px`, top: `${spot.top}px`, width: `${spot.width}px`, height: `${spot.height}px`, right: "auto", bottom: "auto", maxWidth: "none" });
    };

    // Draw the loser every frame: segment (cut-out) or just keep the plain clip looping (PiP).
    const draw = () => {
      if (done) return;
      wrap();
      layoutLoser();
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
      layoutLoser();
      raf = requestAnimationFrame(drawCutout);
    };

    let cutStarted = 0;
    const startCut = (names: string[], settings: Map<string, ClipSettings>) => {
      if (done || begun) return;
      if (!mode) return headlineOnly("the clip is not ready");
      begun = true;
      cutStarted = performance.now();
      setPhase("cut");
      plan = planReactions(names, settings, elapsed());
      planNames = names;
      const playReaction = (i: number) => {
        active = i;
        smooth = null;
        loserShown = false;
        setSegment(names.indexOf(plan[i].file));
        const video = reactionAt(i);
        reactionRefs.current.forEach((v) => { if (v && v !== video) v.pause(); });
        if (!video) return;
        video.loop = plan[i].loop;
        video.currentTime = plan[i].start;
        if (routeAudio(video)) {
          video.volume = 1; // the gain node ducks it; SOUND off mutes the speakers, not the recording
          video.muted = false;
        } else {
          video.volume = REACTION_VOLUME;
          video.muted = !soundOn();
        }
        video.play().catch(() => { video.muted = true; return video.play().catch(() => {}); });
        console.info(`[shame video] ${plan[i].file}: clip visible at ${video.currentTime.toFixed(1)} s (loser at ${plan[i].insertAt.toFixed(1)} s)`);
      };
      // Clips with a set range advance when their own playback reaches `end` (a buffering stall
      // must not cut the gasp); the wall clock is only a fallback for them, and drives looping clips.
      let segTimer = 0;
      advance = (i: number) => {
        if (done) return;
        clearTimeout(segTimer);
        const leaving = reactionAt(active);
        if (plan[active] && leaving) console.info(`[shame video] ${plan[active].file}: ends at ${leaving.currentTime.toFixed(1)} s`);
        if (i >= plan.length) return finish("ended");
        playReaction(i);
        segTimer = window.setTimeout(() => advance(i + 1), plan[i].lengthMs + (plan[i].loop ? 0 : END_SLACK_MS));
        timers.push(segTimer);
        const video = reactionAt(i);
        if (video && !plan[i].loop) video.onended = () => { if (active === i) advance(i + 1); };
      };
      if (plan.length) advance(0);
      else later(() => finish("ended"), Math.max(0, TOTAL_MS - elapsed()));
      const planned = plan.reduce((a, p) => a + p.lengthMs + (p.loop ? 0 : END_SLACK_MS), 0) || TOTAL_MS;
      clearTimeout(safety);
      safety = window.setTimeout(() => finish("ended", "safety timeout"), planned + 2000);
      timers.push(safety);
      raf = requestAnimationFrame(mode === "cutout" ? drawCutout : draw);
    };

    (async () => {
      if (!clipUrl) return headlineOnly("no clip for the loser");
      const clip = clipRef.current;
      const canvas = canvasRef.current;
      if (!clip || !canvas) return headlineOnly("no video element");

      // The reaction clips load while the intro plays.
      const { names: all, settings } = await fetchClips(clipsBase, controller.signal);
      const names = pickReactions(all);
      if (done) return;
      setReactions(names);
      if (!names.length) noComposite("no reaction clips");
      if (recorder && composite) {
        try {
          recorder.start(() => ({
            phase: live.current.phase,
            reaction: reactionAt(active),
            loser: mode === "cutout" && loserVisible ? canvasRef.current : null,
            place: plan[active]?.loser ?? null,
            box: smooth,
            playerName: live.current.playerName,
            headline: live.current.headline,
            line: live.current.line,
          }));
        } catch (e) {
          noComposite(`recorder failed to start (${e instanceof Error ? e.message : String(e)})`);
        }
      }

      let prepared: number | null = null;
      const go = () => startCut(names, settings);
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
      void recorder?.stop();
      recorder = null;
      void audio?.close().catch(() => {});
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
