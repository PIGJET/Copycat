// Full-screen finale scene: plays /scenes/proposal.mp4 with the loser cut out of their clip
// (MediaPipe selfie segmentation) dancing on the right. Falls back to the plain finale by
// calling onFinish if the scene or clip is missing, segmentation fails, or it runs under 15 fps.
// (The old React GameFlow uses this; the arcade finale plays ShameVideo.tsx instead.)
import { useEffect, useRef, useState } from "react";

import { benchmark, createCutout, loopDance, waitForData } from "./cutout";
import type { Cutout } from "./cutout";
import { MIN_FPS, fpsFromSamples, pushSample, tooSlow } from "./sceneMath";

export const DEFAULT_SCENE_URL = "/scenes/proposal.mp4";
/** While playing, only bail out after this long so one slow frame doesn't kill the scene. */
const RUNTIME_GRACE_MS = 2000;
/** Safety net: if the scene isn't playing by now (slow wifi, stuck load), show the plain finale. */
const PREPARE_TIMEOUT_MS = 20000;

export type FinishReason = "ended" | "skipped" | "no-scene" | "no-clip" | "too-slow" | "failed";

export interface FinaleSceneProps {
  /** Object URL of the loser's clip (their worst attempt). null → plain finale. */
  loserClipUrl: string | null;
  /** Where the dance starts in the clip (ms); the camera records a countdown before it. */
  clipStartMs?: number;
  /** Loop only [clipStartMs, clipStartMs + clipDurationMs] when given. */
  clipDurationMs?: number;
  sceneUrl?: string;
  /** Called once: the scene ended, was skipped, or we fell back. Show the headline next. */
  onFinish: (reason: FinishReason, detail?: string) => void;
}

/** True if the URL serves a video (Vite's dev server answers missing files with index.html). */
async function videoExists(url: string, signal: AbortSignal): Promise<boolean> {
  if (/^(blob|data):/.test(url)) return true; // in-memory video: nothing to check
  const isVideo = (res: Response) => res.ok && (res.headers.get("content-type") ?? "").startsWith("video/");
  try {
    const head = await fetch(url, { method: "HEAD", signal });
    if (head.status !== 405) return isVideo(head);
    // Some servers refuse HEAD: ask for one byte instead.
    return isVideo(await fetch(url, { headers: { Range: "bytes=0-0" }, signal }));
  } catch {
    return false;
  }
}

export function FinaleScene({ loserClipUrl, clipStartMs = 0, clipDurationMs, sceneUrl = DEFAULT_SCENE_URL, onFinish }: FinaleSceneProps) {
  const [stage, setStage] = useState<"preparing" | "playing">("preparing");
  const clipRef = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const finishRef = useRef<(reason: FinishReason, detail?: string) => void>(() => {});
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  useEffect(() => {
    const controller = new AbortController();
    let done = false;
    let raf = 0;
    let segmenter: Cutout | null = null;
    let prepareTimer = 0;

    const finish = (reason: FinishReason, detail?: string) => {
      if (done) return;
      done = true;
      clearTimeout(prepareTimer);
      controller.abort();
      cancelAnimationFrame(raf);
      clipRef.current?.pause();
      sceneRef.current?.pause();
      segmenter?.close();
      segmenter = null;
      if (reason !== "ended" && reason !== "skipped") console.info(`[finale scene] plain finale: ${reason}${detail ? ` (${detail})` : ""}`);
      onFinishRef.current(reason, detail);
    };
    finishRef.current = finish;
    prepareTimer = window.setTimeout(() => finish("failed", "took too long to prepare"), PREPARE_TIMEOUT_MS);

    (async () => {
      if (!loserClipUrl) return finish("no-clip");
      if (!(await videoExists(sceneUrl, controller.signal))) return finish("no-scene", sceneUrl);
      const clip = clipRef.current;
      const scene = sceneRef.current;
      const overlay = overlayRef.current;
      if (done || !clip || !scene || !overlay) return;

      await clip.play().catch(() => {});
      await waitForData(clip);
      const wrap = loopDance(clip, clipStartMs, clipDurationMs);
      const made = await createCutout(clip, overlay, wrap);
      if (done) {
        made.close();
        return;
      }
      segmenter = made;
      const step = () => made.step();

      // Benchmark before showing anything: too slow → plain finale.
      const samples = await benchmark(made, () => done);
      if (done) return;
      if (tooSlow(samples)) return finish("too-slow", `${fpsFromSamples(samples).toFixed(1)} fps < ${MIN_FPS}`);
      console.info(`[finale scene] segmentation ~${Math.round(fpsFromSamples(samples))} fps, playing scene`);

      // Play the scene full screen; the loser keeps looping until it ends.
      scene.addEventListener("ended", () => finish("ended"), { once: true });
      scene.addEventListener("error", () => finish("failed", "scene video error"), { once: true });
      try {
        await scene.play();
      } catch {
        scene.muted = true; // autoplay with sound blocked: play muted rather than not at all
        await scene.play().catch((e) => finish("failed", String(e)));
      }
      if (done) return;
      clearTimeout(prepareTimer);
      setStage("playing");

      const started = performance.now();
      let window: number[] = [];
      const loop = () => {
        if (done) return;
        try {
          window = pushSample(window, step());
        } catch (e) {
          return finish("failed", String(e));
        }
        if (performance.now() - started > RUNTIME_GRACE_MS && tooSlow(window)) {
          return finish("too-slow", `${fpsFromSamples(window).toFixed(1)} fps while playing`);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })().catch((e) => finish("failed", e instanceof Error ? e.message : String(e)));

    return () => {
      // Unmount (or StrictMode re-run): stop quietly without reporting a finish.
      done = true;
      clearTimeout(prepareTimer);
      controller.abort();
      cancelAnimationFrame(raf);
      segmenter?.close();
      segmenter = null;
    };
  }, [loserClipUrl, clipStartMs, clipDurationMs, sceneUrl]);

  const playing = stage === "playing";
  return (
    <div
      role="dialog"
      aria-label="Breaking news scene"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#000", overflow: "hidden" }}
    >
      {/* Hidden source for segmentation: the loser's own clip, looping. */}
      <video ref={clipRef} src={loserClipUrl ?? undefined} muted playsInline style={{ display: "none" }} />
      <video
        ref={sceneRef}
        src={sceneUrl}
        playsInline
        preload="auto"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: playing ? 1 : 0 }}
      />
      <canvas
        ref={overlayRef}
        aria-hidden="true"
        style={{ position: "absolute", right: "8vw", bottom: "14vh", height: "33vh", width: "auto", opacity: playing ? 1 : 0, pointerEvents: "none" }}
      />
      {!playing && (
        <p style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", margin: 0, color: "#fff", font: "700 1.5rem/1.2 sans-serif", letterSpacing: "0.08em" }}>
          DEVELOPING STORY...
        </p>
      )}
      <button
        type="button"
        onClick={() => finishRef.current("skipped")}
        style={{ position: "absolute", top: 16, right: 16, padding: "8px 14px", background: "rgba(0,0,0,0.55)", color: "#fff", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 4, cursor: "pointer" }}
      >
        SKIP
      </button>
    </div>
  );
}
