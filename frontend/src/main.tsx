import { createRoot, type Root } from "react-dom/client";
import { DashboardPage, type ArcadeTurn } from "./components/Game/DashboardPage";
import type { Player } from "./components/Game/uiTypes";
import { scoreAttempt } from "./game/scoreAttempt";
import type { PoseSequence } from "./types/pose";

type LiveTurn = {
  stage: HTMLElement; controls: HTMLElement; player: Player; creator: Player;
  reference?: PoseSequence; phaseChanged: ArcadeTurn["phaseChanged"];
  onRecord: (sequence: PoseSequence) => void; onSkip?: () => void;
};
let root: Root | undefined;
Object.assign(globalThis, { CopycatTracking: {
  scoreAttempt,
  mount(turn: LiveTurn) {
    root = createRoot(turn.stage);
    root.render(<DashboardPage arcade={turn} players={[]} round={1} rounds={1}
      player={turn.player} creator={turn.creator} reference={turn.reference}
      onRecord={turn.onRecord} onSkip={turn.onSkip} onMenu={() => {}} />);
  },
  unmount() { root?.unmount(); root = undefined; }
}});
