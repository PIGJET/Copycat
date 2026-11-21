import { useEffect, useRef } from "react";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import { usePoseDetection } from "../../hooks/usePoseDetection";

function Camera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    landmarks,
    isReady,
    startRecording,
    stopRecording,
  } = usePoseDetection(videoRef);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        console.error("Could not access camera:", error);
      }
    }

    startCamera();

    return () => {
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

  function handleStartRecording() {
    startRecording();
    console.log("Recording started!");
  }

  function handleStopRecording() {
    const sequence = stopRecording("player-1");

    console.log("Recorded dance:", sequence);
    console.log("Number of frames:", sequence.frames.length);
  }

  return (
    <div>
      <h2>Dance Camera</h2>

      <p>
        {isReady ? "Pose detection ready!" : "Loading pose detection..."}
      </p>

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

      <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
        <button onClick={handleStartRecording} disabled={!isReady}>
          Start Recording
        </button>

        <button onClick={handleStopRecording} disabled={!isReady}>
          Stop Recording
        </button>
      </div>
    </div>
  );
}

export default Camera;
