
import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import type { PoseLandmark, PoseSequence } from "../types/pose";
import { PoseRecorder } from "../utils/poseRecorder";

interface PoseOptions {
  sampleIntervalMs?: number;
  onSample?: (timestamp: number, landmarks: PoseLandmark[] | null) => void;
}

export function usePoseDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  { sampleIntervalMs, onSample }: PoseOptions = {},
) {
  const [landmarks, setLandmarks] = useState<PoseLandmark[] | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sampleCallback = useRef(onSample);

  useEffect(() => {
    sampleCallback.current = onSample;
  }, [onSample]);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const recorderRef = useRef(new PoseRecorder());

  useEffect(() => {
    let active = true;
    let animationFrameId = 0;
    let lastVideoTime = -1;
    let lastSlot = -1;

    async function initialize() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm"
      );

      if (!active) return;

      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });

      if (!active) {
        landmarker.close();
        return;
      }

      landmarkerRef.current = landmarker;
      setIsReady(true);

      detect();
    }

    function detect() {
      if (!active) return;

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (video && landmarker && video.readyState >= 2) {
        const sampledAt = performance.now();
        const slot = sampleIntervalMs ? Math.floor(sampledAt / sampleIntervalMs) : 0;
        if (video.currentTime !== lastVideoTime && (!sampleIntervalMs || slot !== lastSlot)) {
          lastVideoTime = video.currentTime;
          lastSlot = slot;
          try {
            const points = landmarker.detectForVideo(video, sampledAt).landmarks[0];
            const detected = points?.length === 33 ? points : null;
            setLandmarks(detected);
            sampleCallback.current?.(sampledAt, detected);
            if (detected) recorderRef.current.addFrame(detected, sampledAt);
          } catch {
            setError("Pose tracking stopped. Reload the camera and try again.");
            setIsReady(false);
            return;
          }
        }
      }

      animationFrameId = requestAnimationFrame(detect);
    }

    initialize().catch((error) => {
      if (active) {
        console.error("MediaPipe initialization failed:", error);
        setError("Could not load pose tracking. Reload the camera and try again.");
      }
    });

    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);

      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [videoRef, sampleIntervalMs]);

  function startRecording() {
    recorderRef.current.start();
  }

  function stopRecording(playerId: string): PoseSequence {
    return recorderRef.current.stop(playerId);
  }

  return {
    landmarks,
    isReady,
    error,
    startRecording,
    stopRecording,
  };
}
