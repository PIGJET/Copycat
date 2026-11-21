import { cueText } from "../../game/danceCue";
import type { DanceCue } from "../../game/danceCue";
import "./DashboardDanceFeedback.css";

export function DanceFeedback({ cue, role }: { cue: DanceCue | null; role: "creator" | "copier" }) {
  return (
    <div
      className="dashboard-dance-feedback"
      data-alternate={cue !== null && cue.hits % 2 === 0}
      key={cue?.at ?? "go"}
    >
      <strong>{cue ? cueText(cue, role) : "Go!"}</strong>
    </div>
  );
}
