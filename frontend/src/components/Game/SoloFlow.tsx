import { useState } from "react";
import { CameraCheckPage, DashboardPage, FinalePage, HomePage, LeaderboardPage, LobbyPage, ScorePage, TempoPage } from "./index";
import type { Player, Ranking, Score } from "./uiTypes";

type Screen = "home" | "lobby" | "camera" | "tempo" | "dashboard" | "score" | "leaderboard" | "finale";
type Mode = "solo" | "team";
const emptyScore: Score = { total: null, arms: null, legs: null, torso: null, timing: null };
const soloPlayer: Player = { id: "solo-player", name: "You", avatar: "cat" };
const referencePlayer: Player = { id: "reference", name: "Reference", avatar: "robot" };

/**
 * Solo mode: John's original UI navigation shell, unchanged except that it starts at the
 * camera check and "home" hands back to GameFlow. Justin owns solo; team play lives in GameFlow.
 */
export function SoloFlow({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>("camera");
  const [mode, setMode] = useState<Mode>("solo");
  const [players, setPlayers] = useState<Player[]>([soloPlayer]);
  const [format, setFormat] = useState<"quick" | "full">("quick");
  const [round, setRound] = useState(0);
  const [turnIndex, setTurnIndex] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [soundOn, setSoundOn] = useState(true);
  const [lastScoredPlayer, setLastScoredPlayer] = useState<Player>(soloPlayer);

  const creator = mode === "solo" ? referencePlayer : players[round] ?? players[0] ?? soloPlayer;
  const challengers = mode === "solo" ? players : players.filter(player => player.id !== creator.id);
  const creatorTurn = mode === "team" && turnIndex === 0;
  const activePlayer = creatorTurn ? creator : challengers[Math.max(0, turnIndex - (mode === "team" ? 1 : 0))] ?? challengers[0] ?? soloPlayer;
  const totalRounds = mode === "team" && format === "full" ? players.length : 1;
  const rankings: Ranking[] = players.map(player => ({ player, average: null, attempts: 0 }));

  function returnHome() {
    onExit();
  }

  function openNextTurn() {
    if (creatorTurn) {
      setTurnIndex(1);
      return;
    }
    const challengerIndex = turnIndex - (mode === "team" ? 1 : 0);
    if (challengerIndex + 1 < challengers.length) {
      setTurnIndex(turnIndex + 1);
      return;
    }
    setScreen("leaderboard");
  }

  function completeTurn() {
    if (creatorTurn) {
      openNextTurn();
      return;
    }
    setLastScoredPlayer(activePlayer);
    setScreen("score");
  }

  function continueAfterScore() {
    const challengerIndex = turnIndex - (mode === "team" ? 1 : 0);
    if (challengerIndex + 1 < challengers.length) {
      setTurnIndex(turnIndex + 1);
      setScreen("dashboard");
    } else {
      setScreen("leaderboard");
    }
  }

  function advanceFromLeaderboard() {
    if (round + 1 < totalRounds) {
      setRound(round + 1);
      setTurnIndex(0);
      setScreen("dashboard");
      return;
    }
    setScreen("finale");
  }

  function replay() {
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
      status="Camera preview is not connected" detail="Continue to BPM setup. Recorder integration is still needed."
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
    return <DashboardPage player={activePlayer} creator={creator} players={rankings} round={round + 1} rounds={totalRounds} bpm={bpm}
      onMenu={returnHome} onRecord={completeTurn} onSkip={openNextTurn} />;
  }

  if (screen === "score") {
    return <ScorePage player={lastScoredPlayer} score={emptyScore} onMenu={returnHome} onContinue={continueAfterScore} />;
  }

  if (screen === "leaderboard") {
    return <LeaderboardPage players={rankings} onMenu={returnHome} onNext={advanceFromLeaderboard} />;
  }

  if (screen === "finale") {
    const loser = players[players.length - 1] ?? soloPlayer;
    return <FinalePage loser={loser} worstScore={emptyScore} headline="Results are waiting for gameplay scoring" roastLine="Connect recording and scoring to see the final report." players={rankings} onReplay={replay} onMenu={returnHome} />;
  }

  return <HomePage soundOn={soundOn} onSoundToggle={() => setSoundOn(value => !value)}
    onSolo={() => { setMode("solo"); setPlayers([soloPlayer]); setRound(0); setScreen("camera"); }}
    onTeam={() => { setMode("team"); setScreen("lobby"); }} />;
}
