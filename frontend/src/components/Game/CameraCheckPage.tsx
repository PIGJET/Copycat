import { useEffect, useRef, useState } from "react";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Player } from "./uiTypes";
import { ArcadeButton, GameHeader, PageFrame, PosePlaceholder } from "./primitives";
import { usePoseDetection } from "../../hooks/usePoseDetection";
import { bodyInFrame, framingHint } from "../../game/teamTurn";
import "../Camera/ChallengeRecorder.css";

export type CameraCheckPageProps = {
  player?: Player;
  onMenu: () => void;
  onContinue: () => void;
  /** Dev-only mock mode (?mock=1): no camera needed, CONTINUE always works. */
  mock?: boolean;
};

function cameraError(error: unknown) {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotFoundError":
        return "Connect a camera and try again.";
      case "NotAllowedError":
        return "Allow camera access in your browser settings and try again.";
      case "NotReadableError":
        return "Close other apps that may be using the camera and try again.";
    }
  }
  return "The camera could not start. Try again.";
}

/** John's camera check, plus pose tracking: CONTINUE only unlocks with the full body in frame. */
export function CameraCheckPage({ player, onMenu, onContinue, mock = false }: CameraCheckPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(false);
  const [state, setState] = useState<"off" | "checking" | "ready">("off");
  const [detail, setDetail] = useState("Enable your camera to continue.");
  const pose = usePoseDetection(videoRef);
  const bodyOk = state === "ready" && pose.isReady && bodyInFrame(pose.landmarks);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  // Skeleton overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !video?.videoWidth || !ctx) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pose.landmarks) {
      new DrawingUtils(ctx).drawConnectors(pose.landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: bodyInFrame(pose.landmarks) ? "#33e88e" : "#ffcb65", lineWidth: 3 });
    }
  }, [pose.landmarks]);

  function resetCamera(message: string) {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("off");
    setDetail(message);
  }

  async function enableCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setDetail("Camera access is unavailable. Open the game over HTTPS or localhost in a browser with camera support.");
      return;
    }

    setState("checking");
    setDetail("Waiting for the camera to start…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      const video = videoRef.current;
      if (!mounted.current || !video) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track?.readyState !== "live") {
        resetCamera("Connect a camera and try again.");
        return;
      }
      track.addEventListener("ended", () => {
        if (streamRef.current === stream) {
          resetCamera("Camera disconnected. Reconnect it and try again.");
        }
      }, { once: true });

      video.srcObject = stream;
      await video.play();
      if (streamRef.current === stream && track.readyState === "live") {
        setState("ready");
        setDetail("Check that your head and feet are visible.");
      }
    } catch (error) {
      if (mounted.current) resetCamera(cameraError(error));
    }
  }

  function continueWithCamera() {
    if (mock || (bodyOk && streamRef.current?.getVideoTracks().some(track => track.readyState === "live"))) {
      onContinue();
    }
  }

  const status = mock
    ? "Mock mode (?mock=1): the camera is skipped and recordings are fake."
    : pose.error
      ? pose.error
      : state !== "ready"
        ? detail
        : !pose.isReady
          ? "Loading pose tracking…"
          : framingHint(pose.landmarks);

  return (
    <PageFrame>
      <GameHeader title="CAMERA CHECK" onMenu={onMenu} />
      <div className="camera-check-layout">
        <section className="camera-check-stage" aria-label="Camera preview">
          <div className="camera-check-viewport">
            <div className="challenge-recorder__camera" hidden={state !== "ready"}>
              <video ref={videoRef} muted playsInline style={{ width: "100%", display: "block" }} />
              <canvas ref={canvasRef} aria-hidden="true" />
            </div>
            {state !== "ready" && (
              <div className="camera-check-placeholder">
                <PosePlaceholder />
                <strong>{state === "checking" ? "Checking camera…" : mock ? "Camera skipped" : "Camera off"}</strong>
              </div>
            )}
          </div>
        </section>
        <aside className="camera-check-settings">
          <div className="camera-check-status">
            <strong>{player?.name ? `${player.name}'s camera` : "Camera setup"}</strong>
            <span role="status">{status}</span>
          </div>
          <div className="camera-check-actions">
            {!mock && state !== "ready" && (
              <ArcadeButton secondary onClick={enableCamera} disabled={state === "checking"}>ENABLE CAMERA</ArcadeButton>
            )}
            <ArcadeButton onClick={continueWithCamera} disabled={!mock && !bodyOk}>CONTINUE</ArcadeButton>
          </div>
        </aside>
      </div>
    </PageFrame>
  );
}
