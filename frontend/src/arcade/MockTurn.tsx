// Dev-only stand-in for the camera (?mock=1, or the arcade's CONTINUE DEMO): a short fake
// countdown and take, then a mock Recording in the CONTRACT.md format. Scoring stays on the backend.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { mockRecording } from "../game/mockRecorder";
import type { Recording } from "../game/types";
import type { ArcadeHost } from "../components/Game/TeamTurnDashboard";

const TICK_MS = 300;
/** The creator's mock dance; copiers copy it (more or less). */
let danceSeed = 1;

export function MockTurn({ arcade, role, onComplete }: { arcade: ArcadeHost; role: "creator" | "copier"; onComplete: (r: Recording) => void }) {
  const [step, setStep] = useState<number | null>(null); // 0-2: countdown 3-2-1, 3-6: "recording"
  const done = useRef(onComplete);
  useEffect(() => {
    done.current = onComplete;
  });

  useEffect(() => {
    if (step === null) return;
    if (step < 3) arcade.phaseChanged("countdown", 3 - step, null);
    else arcade.phaseChanged("recording", null, Math.max(0, 10 - (step - 3) * 3));
    const timer = window.setTimeout(() => {
      if (step < 6) return setStep(step + 1);
      arcade.phaseChanged("idle", null, null);
      if (role === "creator") danceSeed = Math.floor(Math.random() * 1e6);
      done.current(role === "creator"
        ? mockRecording({ seed: danceSeed })
        : mockRecording({ seed: danceSeed, sloppiness: 0.05 + Math.random() * 0.5, lagMs: Math.random() * 400 }));
    }, TICK_MS);
    return () => window.clearTimeout(timer);
  }, [step, arcade, role]);

  return <>
    <p className="dashboard-camera-note">Mock recorder: no camera, fake dance data</p>
    {createPortal(
      <button className="ui-primary" disabled={step !== null} onClick={() => setStep(0)}>
        {step === null ? (role === "creator" ? "Start recording" : "Your turn: start copying") : "Get ready…"}
      </button>,
      arcade.controls,
    )}
  </>;
}
