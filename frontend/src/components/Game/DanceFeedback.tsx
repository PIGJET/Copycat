import { cueText } from "../../game/danceCue";
import type { DanceCue } from "../../game/danceCue";
import "./DashboardDanceFeedback.css";

const hypePerMove = 10;

export function DanceFeedback({ cue, role }: { cue: DanceCue | null; role: "creator" | "copier" }) {
  const hype = (cue?.hits ?? 0) * hypePerMove;

  return (
    <>
      <div
        className="dashboard-dance-feedback"
        data-alternate={cue !== null && cue.hits % 2 === 0}
        key={cue?.at ?? "go"}
      >
        {cue && <span className="dashboard-dance-bonus">+{hypePerMove} Hype</span>}
        <strong>{cue ? cueText(cue, role) : "Go!"}</strong>
      </div>
      <div className="dashboard-hype-total">
        <span>Hype</span>
        <strong>{hype}</strong>
      </div>
    </>
  );
}
