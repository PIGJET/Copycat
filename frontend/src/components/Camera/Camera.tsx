import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import { usePoseDetection } from "../../hooks/usePoseDetection";

import type { Ref } from "react";
import type { PoseLandmark, PoseSequence } from "../../types/pose";

export type CameraHandle = {
  stream: MediaStream | null;
  startRecording: () => boolean;
  stopRecording: (playerId: string) => PoseSequence;
};

type CameraProps = {
  ref: Ref<CameraHandle>;
  onReadyChange: (ready: boolean) => void;
  onPose?: (timestamp: number, landmarks: PoseLandmark[] | null) => void;
};

function Camera({ ref, onReadyChange, onPose }: CameraProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    landmarks,
    isReady,
    startRecording,
    stopRecording,
  } = usePoseDetection(videoRef, { onSample: onPose });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const [track] = stream.getVideoTracks();
          track?.addEventListener("ended", () => setIsPlaying(false), { once: true });
          await videoRef.current.play();
          if (active) setIsPlaying(track?.readyState === "live");
        }
      } catch (error) {
        console.error("Could not access camera:", error);
      }
    }

    startCamera();

    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Draw the detected skeleton
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (landmarks) {
      const drawingUtils = new DrawingUtils(ctx);

      drawingUtils.drawConnectors(
        landmarks,
        PoseLandmarker.POSE_CONNECTIONS,
        { color: "#00FF00", lineWidth: 4 }
      );

      drawingUtils.drawLandmarks(landmarks, {
        color: "#FF0000",
        lineWidth: 2,
        radius: 4,
      });
    }
  }, [landmarks]);

  const ready = isReady && isPlaying;
  useEffect(() => {
    onReadyChange(ready);
  }, [onReadyChange, ready]);

  useImperativeHandle(ref, () => ({
    get stream() { return videoRef.current?.srcObject as MediaStream | null },
    startRecording() {
      if (!ready) return false;
      startRecording();
      return true;
    },
    stopRecording,
  }));

  return (
    <div>
      <div style={{ position: "relative", maxWidth: "640px" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            display: "block",
            transform: "scaleX(-1)",
          }}
        />

        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            transform: "scaleX(-1)",
          }}
        />
      </div>
    </div>
  );
}

export default Camera;
