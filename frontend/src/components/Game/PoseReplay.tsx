import { useEffect, useRef } from "react";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { ScoreFrame } from "../../game/types";
import "./PoseReplay.css";

/** Landmarks from either frame format ({t, landmarks} or contract {t, lm: [x, y, visibility]}). */
function landmarksOf(frame: ScoreFrame): NormalizedLandmark[] | null {
  if (!frame) return null;
  if ("landmarks" in frame && frame.landmarks) return frame.landmarks;
  if ("lm" in frame && frame.lm) return frame.lm.map(([x, y, visibility]) => ({ x, y, z: 0, visibility }));
  return null;
}

/** Replays a recorded dance as a skeleton (used when the creator's take has no video). */
export function PoseReplay({ frames, durationMs, creator, startedAt }: { frames: ScoreFrame[]; durationMs: number; creator: string; startedAt?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const drawing = new DrawingUtils(context);
    const timed = frames.filter((f): f is NonNullable<ScoreFrame> => f !== null);
    const start = startedAt ?? performance.now();
    const frameOrigin = startedAt === undefined ? timed[0]?.t ?? 0 : 0;
    let request = 0;
    let frameIndex = -1;

    const draw = (now: number) => {
      const elapsed = Math.min(now - start, durationMs);
      const previousIndex = frameIndex;
      while (timed[frameIndex + 1] && timed[frameIndex + 1].t - frameOrigin <= elapsed) frameIndex++;

      const landmarks = timed[frameIndex] ? landmarksOf(timed[frameIndex]) : null;
      if (frameIndex !== previousIndex) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (landmarks) {
          drawing.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: "#73d9e9", lineWidth: 4 });
          drawing.drawLandmarks(landmarks, { color: "#ffcb65", radius: 3 });
        }
      }

      if (elapsed < durationMs) request = requestAnimationFrame(draw);
    };

    request = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(request);
  }, [frames, durationMs, startedAt]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        role="img"
        aria-label={`${creator}’s dance pose replay`}
        style={{ display: "block", width: "100%", maxWidth: 640, background: "#251b31", transform: "scaleX(-1)" }}
      />
      <p className="pose-replay-caption" role="status">
        <span aria-hidden="true" className="pose-replay-icon" />
        <span>Watch <strong>{creator}’s move</strong></span>
      </p>
    </>
  );
}
