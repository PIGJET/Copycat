import { useState } from "react";
import { ArcadeButton, CameraCheckPage, DashboardPage, GameHeader, HomePage, LeaderboardPage, LobbyPage, PageFrame, ScorePage, TempoPage } from "./index";
import type { PoseSequence } from "../../types/pose";
import { ScoreInputError, scoreAttempt } from "../../game/scoreAttempt";
import type { AttemptScore } from "../../game/scoreAttempt";
import { WinnerPage } from "./ResultsPages";
import type { Player, Ranking } from "./uiTypes";

type Screen = "home" | "lobby" | "camera" | "tempo" | "dashboard" | "judging" | "leaderboard" | "finale";
type Mode = "solo" | "team";
type Judging =
  | { status: "scored"; score: AttemptScore }
  | { status: "unscored" }
  | { status: "error"; message: string; recording: "reference" | "attempt" };
const soloPlayer: Player = { id: "solo-player", name: "You", avatar: "cat" };
const referencePlayer: Player = { id: "reference", name: "Reference", avatar: "robot" };

export function GameFlow() {
  const [recordingsByRound, setRecordingsByRound] = useState<Map<number, Map<string, PoseSequence>>>(() => new Map());
  const [scoresByRound, setScoresByRound] = useState<Map<number, Map<string, AttemptScore>>>(() => new Map());
  const [judging, setJudging] = useState<Judging>({ status: "unscored" });
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("team");
  const [players, setPlayers] = useState<Player[]>([soloPlayer]);
  const [format, setFormat] = useState<"quick" | "full">("quick");
  const [round, setRound] = useState(0);
  const [turnIndex, setTurnIndex] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [soundOn, setSoundOn] = useState(true);

  const creator = mode === "solo" ? referencePlayer : players[round] ?? players[0] ?? soloPlayer;
  const challengers = mode === "solo" ? players : players.filter(player => player.id !== creator.id);
  const creatorTurn = mode === "team" && turnIndex === 0;
  const activePlayer = creatorTurn ? creator : challengers[Math.max(0, turnIndex - (mode === "team" ? 1 : 0))] ?? challengers[0] ?? soloPlayer;
  const reference = creatorTurn ? undefined : recordingsByRound.get(round)?.get(String(creator.id));
  const totalRounds = mode === "team" && format === "full" ? players.length : 1;
  const nextCreator = round + 1 < totalRounds ? players[round + 1] : undefined;
  const roundInfo = {
    round: round + 1,
    rounds: totalRounds,
    mode: mode === "solo" ? "SOLO" : format === "full" ? "FULL GAME" : "QUICK GAME",
  };
  const rankings: Ranking[] = players.map(player => {
    const scores = [...scoresByRound.values()].flatMap(scores => {
      const score = scores.get(String(player.id));
      return score ? [score.total] : [];
    });
    const average = scores.length
      ? Math.round(10 * scores.reduce((sum, total) => sum + total, 0) / scores.length) / 10
      : null;
    return { player, average, attempts: scores.length };
  }).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  function resetResults() {
    setRecordingsByRound(new Map());
    setScoresByRound(new Map());
  }

  function returnHome() {
    resetResults();
    setScreen("home");
    setRound(0);
    setTurnIndex(0);
  }

  function openNextTurn() {
    if (creatorTurn) {
      if (challengers.length) setTurnIndex(1);
      else setScreen("leaderboard");
      return;
    }
    const challengerIndex = turnIndex - (mode === "team" ? 1 : 0);
    if (challengerIndex + 1 < challengers.length) {
      setTurnIndex(turnIndex + 1);
      return;
    }
    setScreen("leaderboard");
  }

  function completeTurn(recording: PoseSequence) {
    setRecordingsByRound(previous => {
      const recordings = new Map(previous.get(round));
      recordings.set(recording.playerId, recording);
      return new Map(previous).set(round, recordings);
    });
    if (creatorTurn) {
      openNextTurn();
    } else if (reference) {
      judgeAttempt(reference, recording);
    } else {
      setJudging({ status: "unscored" });
      setScreen("judging");
    }
  }

  function judgeAttempt(reference: PoseSequence, attempt: PoseSequence) {
    setScreen("judging");
    try {
      const score = scoreAttempt(reference, attempt);
      setScoresByRound(previous => {
        const scores = new Map(previous.get(round));
        scores.set(attempt.playerId, score);
        return new Map(previous).set(round, scores);
      });
      setJudging({ status: "scored", score });
    } catch (error) {
      if (!(error instanceof ScoreInputError)) throw error;
      setJudging({ status: "error", message: error.message, recording: error.recording });
    }
  }

  function rerecordReference() {
    setRecordingsByRound(previous => {
      const next = new Map(previous);
      next.delete(round);
      return next;
    });
    setScoresByRound(previous => {
      const next = new Map(previous);
      next.delete(round);
      return next;
    });
    setTurnIndex(0);
    setScreen("dashboard");
  }

  function advanceFromLeaderboard() {
    if (nextCreator) {
      setRound(round + 1);
      setTurnIndex(0);
      setScreen("dashboard");
      return;
    }
    setScreen("finale");
  }

  function replay() {
    resetResults();
    setRound(0);
    setTurnIndex(0);
    setScreen("camera");
  }

  if (screen === "lobby") {
    return <LobbyPage onBack={returnHome} onStart={(selectedPlayers, selectedFormat) => {
      setPlayers(selectedPlayers);
      setFormat(selectedFormat);
      setRound(0);
      setTurnIndex(0);
      setScreen("camera");
    }} />;
  }

  if (screen === "camera") {
    return <CameraCheckPage player={mode === "solo" ? soloPlayer : creator} onMenu={returnHome}
      onContinue={() => setScreen("tempo")} />;
  }

  if (screen === "tempo") {
    return <TempoPage key={`${mode}-${round}`} initialBpm={bpm} onMenu={returnHome} onBack={() => setScreen("camera")} onStart={selectedBpm => {
      setBpm(selectedBpm);
      setTurnIndex(0);
      setScreen("dashboard");
    }} />;
  }

  if (screen === "dashboard") {
    return <DashboardPage key={`${round}-${turnIndex}`} reference={reference} player={activePlayer} creator={creator} players={rankings} round={round + 1} rounds={totalRounds} bpm={bpm}
      onMenu={returnHome} onRecord={completeTurn} onSkip={creatorTurn ? undefined : openNextTurn} />;
  }

  if (screen === "judging") {
    if (judging.status === "scored") {
      return <ScorePage player={activePlayer} score={judging.score} onContinue={openNextTurn} onMenu={returnHome} roundInfo={roundInfo} />;
    }

    return (
      <PageFrame>
        <GameHeader title={activePlayer.name} label="SCORE REVEAL" onMenu={returnHome} {...roundInfo} />
        <div className="result-footer" role="status">
          {judging.status === "unscored" && <p>Dance captured. You need a reference dance to get a score.</p>}
          {judging.status === "error" && <p>{judging.message}</p>}
        </div>
        <div className="result-footer">
          {judging.status === "unscored" && <ArcadeButton onClick={openNextTurn}>SEE RESULTS</ArcadeButton>}
          {judging.status === "error" && <>
            {judging.recording === "reference"
              ? <ArcadeButton onClick={rerecordReference}>REDO ROUND</ArcadeButton>
              : <>
                <ArcadeButton onClick={() => setScreen("dashboard")}>RECORD AGAIN</ArcadeButton>
                <ArcadeButton secondary onClick={openNextTurn}>SKIP SCORE</ArcadeButton>
              </>}
          </>}
        </div>
      </PageFrame>
    );
  }

  if (screen === "leaderboard") {
    return <LeaderboardPage players={rankings} onMenu={returnHome} onNext={advanceFromLeaderboard}
      roundInfo={roundInfo} nextCreator={nextCreator?.name} nextLabel={nextCreator ? "NEXT ROUND" : "REVEAL WINNER"} />;
  }

  if (screen === "finale") {
    return <WinnerPage players={rankings} onReplay={replay} onMenu={returnHome} roundInfo={roundInfo} />;
  }

  return <HomePage soundOn={soundOn} onSoundToggle={() => setSoundOn(value => !value)}
    onSolo={() => { setMode("solo"); setPlayers([soloPlayer]); setRound(0); setScreen("camera"); }}
    onTeam={() => { setMode("team"); setScreen("lobby"); }} />;
}
