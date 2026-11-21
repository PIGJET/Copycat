
import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import type { PoseLandmark, PoseSequence } from "../types/pose";
import { PoseRecorder } from "../utils/poseRecorder";

export function usePoseDetection(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [landmarks, setLandmarks] = useState<PoseLandmark[] | null>(null);
  const [isReady, setIsReady] = useState(false);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const recorderRef = useRef(new PoseRecorder());

  useEffect(() => {
    let active = true;
    let animationFrameId = 0;
    let lastVideoTime = -1;

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
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;

          const results = landmarker.detectForVideo(
            video,
            performance.now()
          );

          if (results.landmarks.length > 0) {
            const detectedLandmarks = results.landmarks[0].map((point) => ({
              x: point.x,
              y: point.y,
              z: point.z,
              visibility: point.visibility ?? 0,
            }));

            setLandmarks(detectedLandmarks);

            // Save the frame if recording is active
            recorderRef.current.addFrame(detectedLandmarks);
          } else {
            setLandmarks(null);
          }
        }
      }

      animationFrameId = requestAnimationFrame(detect);
    }

    initialize().catch((error) => {
      console.error("MediaPipe initialization failed:", error);
    });

    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);

      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [videoRef]);

  function startRecording() {
    recorderRef.current.start();
  }

  function stopRecording(playerId: string): PoseSequence {
    return recorderRef.current.stop(playerId);
  }

  return {
    landmarks,
    isReady,
    startRecording,
    stopRecording,
  };
}
