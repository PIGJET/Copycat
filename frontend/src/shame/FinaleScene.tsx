// Full-screen finale scene: plays /scenes/proposal.mp4 with the loser cut out of their clip
// (MediaPipe selfie segmentation) dancing on the right. Falls back to the plain finale by
// calling onFinish if the scene or clip is missing, segmentation fails, or it runs under 15 fps.
import { useEffect, useRef, useState } from "react";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

import { MIN_FPS, confidenceToAlpha, fpsFromSamples, pushSample, scaledWidth, tooSlow } from "./sceneMath";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
export const DEFAULT_SCENE_URL = "/scenes/proposal.mp4";

/** Segment at this height; smaller is faster, and the dancer is only ~1/3 of the screen. */
const SEG_HEIGHT = 256;
const BENCHMARK_FRAMES = 12;
const WARMUP_FRAMES = 2;
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

function waitForData(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  // The error may already have happened before we started listening.
  if (video.error) return Promise.reject(new Error("clip failed to load"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("clip took too long to load")), timeoutMs);
    video.addEventListener("loadeddata", () => { clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("clip failed to load")); }, { once: true });
  });
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

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
    let segmenter: ImageSegmenter | null = null;
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
      const loopStart = clipStartMs / 1000;
      const loopEnd = clipDurationMs ? (clipStartMs + clipDurationMs) / 1000 : Infinity;
      clip.currentTime = loopStart;
      // Loop just the dance, not the countdown recorded before it (checked every frame in step()).
      const wrap = () => {
        if (clip.ended || clip.currentTime >= loopEnd || clip.currentTime < loopStart - 0.5) {
          clip.currentTime = loopStart;
          if (clip.paused) void clip.play().catch(() => {});
        }
      };
      clip.addEventListener("ended", wrap);

      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      if (done) return;
      const create = (delegate: "GPU" | "CPU") =>
        ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      // GPU is much faster; some laptops can't start it, so try CPU before giving up.
      segmenter = await create("GPU").catch(() => create("CPU"));
      if (done) {
        segmenter.close();
        return;
      }

      // Small working canvases: the frame we segment, and the cut-out with alpha applied.
      const w = scaledWidth(clip.videoWidth, clip.videoHeight, SEG_HEIGHT);
      const h = SEG_HEIGHT;
      const frame = document.createElement("canvas");
      frame.width = w;
      frame.height = h;
      const fctx = frame.getContext("2d", { willReadFrequently: true });
      overlay.width = w;
      overlay.height = h;
      const octx = overlay.getContext("2d");
      if (!fctx || !octx) return finish("failed", "no 2D canvas");

      let lastTs = 0;
      /** Segment the current clip frame and draw the cut-out. Returns processing time in ms. */
      const step = (): number => {
        const t0 = performance.now();
        wrap();
        fctx.drawImage(clip, 0, 0, w, h);
        const ts = Math.max(lastTs + 1, performance.now()); // timestamps must strictly increase
        lastTs = ts;
        const result = segmenter!.segmentForVideo(frame, ts);
        try {
          const mask = result.confidenceMasks?.[0];
          if (!mask) throw new Error("no confidence mask");
          const conf = mask.getAsFloat32Array();
          const img = fctx.getImageData(0, 0, w, h);
          for (let i = 0, p = 3; i < conf.length; i++, p += 4) img.data[p] = confidenceToAlpha(conf[i]);
          octx.clearRect(0, 0, w, h);
          octx.putImageData(img, 0, 0);
        } finally {
          result.close();
        }
        return performance.now() - t0;
      };

      // Benchmark before showing anything: too slow → plain finale.
      const samples: number[] = [];
      for (let i = 0; i < BENCHMARK_FRAMES && !done; i++) {
        const ms = step();
        if (i >= WARMUP_FRAMES) samples.push(ms);
        await nextFrame();
      }
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
