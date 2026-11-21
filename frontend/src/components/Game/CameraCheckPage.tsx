import { useEffect, useRef, useState } from "react";
import type { Player } from "./uiTypes";
import { ArcadeButton, GameHeader, PageFrame, PosePlaceholder } from "./primitives";

export type CameraCheckPageProps = {
  player?: Player;
  onMenu: () => void;
  onContinue: () => void;
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

export function CameraCheckPage({ player, onMenu, onContinue }: CameraCheckPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(false);
  const [state, setState] = useState<"off" | "checking" | "ready">("off");
  const [detail, setDetail] = useState("Enable your camera to continue.");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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
    if (state === "ready" && streamRef.current?.getVideoTracks().some(track => track.readyState === "live")) {
      onContinue();
    }
  }

  return (
    <PageFrame>
      <GameHeader title="CAMERA CHECK" onMenu={onMenu} />
      <div className="camera-check-layout">
        <section className="camera-check-stage" aria-label="Camera preview">
          <div className="camera-check-viewport">
            <video ref={videoRef} muted playsInline hidden={state !== "ready"} style={{ width: "100%", transform: "scaleX(-1)" }} />
            {state !== "ready" && (
              <div className="camera-check-placeholder">
                <PosePlaceholder />
                <strong>{state === "checking" ? "Checking camera…" : "Camera off"}</strong>
              </div>
            )}
          </div>
        </section>
        <aside className="camera-check-settings">
          <div className="camera-check-status">
            <strong>{player?.name ? `${player.name}'s camera` : "Camera setup"}</strong>
            <span role="status">{detail}</span>
          </div>
          <div className="camera-check-actions">
            {state !== "ready" && (
              <ArcadeButton secondary onClick={enableCamera} disabled={state === "checking"}>ENABLE CAMERA</ArcadeButton>
            )}
            <ArcadeButton onClick={continueWithCamera} disabled={state !== "ready"}>CONTINUE</ArcadeButton>
          </div>
        </aside>
      </div>
    </PageFrame>
  );
}
