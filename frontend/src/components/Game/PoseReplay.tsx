import { useEffect, useRef } from "react";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseSequence } from "../../types/pose";

export function PoseReplay({ sequence, creator }: { sequence: PoseSequence; creator: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const drawing = new DrawingUtils(context);
    const start = performance.now();
    let request = 0;
    let frameIndex = -1;

    const draw = (now: number) => {
      const elapsed = now - start;
      const previousIndex = frameIndex;
      while (sequence.frames[frameIndex + 1]?.t <= elapsed) frameIndex++;

      const frame = sequence.frames[frameIndex];
      if (frame && frameIndex !== previousIndex) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        drawing.drawConnectors(frame.landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: "#73d9e9", lineWidth: 4 });
        drawing.drawLandmarks(frame.landmarks, { color: "#ffcb65", radius: 3 });
      }

      if (elapsed < sequence.duration) request = requestAnimationFrame(draw);
    };

    request = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(request);
  }, [sequence]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={480}
      role="img"
      aria-label={`${creator}’s dance pose replay`}
      style={{ display: "block", width: "100%", maxWidth: 640, background: "#251b31", transform: "scaleX(-1)" }}
    />
  );
}
