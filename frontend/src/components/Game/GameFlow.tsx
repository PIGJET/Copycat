import { useCallback, useEffect, useState } from "react";
import { CameraCheckPage, DashboardPage, FinalePage, HomePage, LeaderboardPage, LobbyPage, ScorePage, TempoPage } from "./index";
import Game from "../../game/Game";
import type { Player as UiPlayer, Ranking, Score } from "./uiTypes";
import { checkHealth } from "../../game/api";
import { getRecording } from "../../game/recordingSource";
import { allAttempts, startError } from "../../game/rules";
import { useGame } from "../../game/useGame";
import { FinaleScene } from "../../shame/FinaleScene";
import type { Player, RankingRow, ScoreResult } from "../../game/types";

/** Screens before the game itself starts. After "game", useGame's phase decides the page. */
type Screen = "home" | "lobby" | "camera" | "tempo" | "game";

const AVATARS = ["cat", "rabbit", "robot", "frog"];
const DEFAULT_LOBBY: UiPlayer[] = [{ id: 1, name: "", avatar: "cat" }, { id: 2, name: "", avatar: "rabbit" }];
const EMPTY_SCORE: Score = { total: null, arms: null, legs: null, torso: null, timing: null };
const SERVER_DOWN = "Game server isn't running. Start the backend on port 8000, then retry.";

const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
const newSeed = () => Math.floor(Math.random() * 1e6);

function toScore(s: ScoreResult | null | undefined): Score {
  return s ? { total: s.total, arms: s.arms, legs: s.legs, torso: s.torso, timing: s.timing } : EMPTY_SCORE;
}

/** Team play runs on useGame (frontend/src/game). Solo play is Justin's dance challenge (game/Game.tsx). */
export function GameFlow() {
  const game = useGame();
  const [screen, setScreen] = useState<Screen>("home");
  const [solo, setSolo] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [soundOn, setSoundOn] = useState(true);
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [lobbyError, setLobbyError] = useState<string | undefined>(undefined);
  /** True from a copier's submit until they press CONTINUE on their score. */
  const [revealPending, setRevealPending] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [gameSeed, setGameSeed] = useState(newSeed);
  /** The full-screen finale scene has finished (or fell back); show the headline. */
  const [sceneDone, setSceneDone] = useState(false);

  // ---- GET /health ----
  useEffect(() => {
    let alive = true;
    checkHealth().then((ok) => alive && setHealth(ok ? "ok" : "down"));
    return () => { alive = false; };
  }, []);
  const recheckHealth = useCallback(() => {
    setHealth("checking");
    checkHealth().then((ok) => setHealth(ok ? "ok" : "down"));
  }, []);

  // ---- helpers ----
  const toUi = (p: Player | null | undefined): UiPlayer => {
    if (!p) return { id: "nobody", name: "", avatar: "cat" };
    const index = Math.max(0, game.players.findIndex((x) => x.id === p.id));
    return { id: p.id, name: p.name, avatar: avatars[p.name.toLocaleLowerCase()] ?? AVATARS[index % AVATARS.length] };
  };
  const toRanking = (r: RankingRow): Ranking => ({ player: toUi(r.player), average: round1(r.average), attempts: r.attempts.length });
  const rankings = game.rankings.map(toRanking);

  function goHome() {
    setSceneDone(false);
    game.restart();
    setRevealPending(false);
    setRecordingBusy(false);
    setSolo(false);
    setScreen("home");
    recheckHealth();
  }

  /** Copy the lobby's players into useGame and start. */
  function startFromLobby(players: UiPlayer[], format: "quick" | "full") {
    setAvatars(Object.fromEntries(players.map((p) => [p.name.trim().toLocaleLowerCase(), p.avatar ?? "cat"])));
    for (const p of game.players) game.removePlayer(p.id);
    for (const p of players) game.addPlayer(p.name);
    game.setMode(format);
    game.startGame();
    setGameSeed(newSeed());
    setSceneDone(false);
    setScreen("camera");
  }

  // Live lobby validation, using useGame's own rules and messages.
  const { setMode } = game;
  const onLobbyChange = useCallback((players: UiPlayer[], format: "quick" | "full") => {
    setLobbyError(startError(players.map((p) => ({ id: String(p.id), name: p.name }))) ?? "");
    setMode(format);
  }, [setMode]);

  async function record() {
    const role = game.phase === "creatorRecording" ? "creator" : "copier";
    setRecordingBusy(true);
    try {
      const recording = await getRecording({ role, danceSeed: gameSeed + game.state.roundIndex * 1000 });
      game.submitRecording(recording);
      if (role === "copier") setRevealPending(true);
    } finally {
      setRecordingBusy(false);
    }
  }

  function replay() {
    setSceneDone(false);
    game.restart();
    game.startGame(); // same players and mode
    setRevealPending(false);
    setGameSeed(newSeed());
    setScreen("camera");
  }

  // ---- solo ----
  if (solo) return <Game onBack={() => { setSolo(false); setScreen("home"); }} />;

  // ---- pre-game screens ----
  const lobby = (
    <LobbyPage
      initialPlayers={game.players.length ? game.players.map(toUi) : DEFAULT_LOBBY}
      initialFormat={game.mode}
      error={game.setupError ?? lobbyError}
      onChange={onLobbyChange}
      onBack={goHome}
      onStart={startFromLobby}
    />
  );
  if (screen === "lobby") return lobby;
  if ((screen === "camera" || screen === "tempo" || screen === "game") && game.phase === "setup") {
    // Start was rejected (setupError), or the game was reset: back to the right pre-game screen.
    return screen === "game" ? <HomePage soundOn={soundOn} onSoundToggle={() => setSoundOn((v) => !v)} onSolo={() => setSolo(true)} onTeam={() => setScreen("lobby")} /> : lobby;
  }
  if (screen === "camera") {
    return <CameraCheckPage player={toUi(game.creator)} onMenu={goHome}
      status="Camera preview is not connected" detail="Continue to BPM setup. Recorder integration is still needed."
      onContinue={() => setScreen("tempo")} />;
  }
  if (screen === "tempo") {
    return <TempoPage initialBpm={bpm} onMenu={goHome} onBack={() => setScreen("camera")} onStart={(selected) => {
      setBpm(selected);
      setScreen("game");
    }} />;
  }

  if (screen === "home") {
    return <HomePage soundOn={soundOn} onSoundToggle={() => setSoundOn((v) => !v)}
      notice={health === "down" ? SERVER_DOWN : undefined} onNoticeRetry={recheckHealth}
      onSolo={() => setSolo(true)}
      onTeam={() => setScreen("lobby")} />;
  }

  // ---- in-game: useGame's phase decides ----
  if (game.phase === "scoring" || revealPending) {
    if (game.phase === "scoring") {
      const err = game.currentAttempt?.status === "error" ? game.currentAttempt.error : null;
      const player = toUi(game.currentPlayer);
      if (!err) {
        return <ScorePage player={player} score={EMPTY_SCORE} status="Scoring…" continueDisabled onContinue={() => {}} onMenu={goHome} />;
      }
      if (err.recording === "reference") {
        return <ScorePage player={player} score={EMPTY_SCORE} status={err.message} onMenu={goHome}
          continueLabel={`${game.creator?.name ?? "CREATOR"} RE-RECORDS`}
          onContinue={() => { setRevealPending(false); game.redoReference(); }} />;
      }
      if (err.recording === "attempt") {
        return <ScorePage player={player} score={EMPTY_SCORE} status={err.message} onMenu={goHome}
          continueLabel="RECORD AGAIN" onContinue={() => { setRevealPending(false); game.redoAttempt(); }} />;
      }
      return <ScorePage player={player} score={EMPTY_SCORE} status={err.message} onMenu={goHome}
        continueLabel="RETRY" onContinue={game.retryScore}
        secondaryAction={{ label: "RECORD AGAIN", onClick: () => { setRevealPending(false); game.redoAttempt(); } }} />;
    }
    // Scored: reveal the attempt that was just scored (the latest scored one).
    const latest = allAttempts(game.rounds).filter((a) => a.score).at(-1);
    const player = toUi(game.players.find((p) => p.id === latest?.playerId));
    return <ScorePage player={player} score={toScore(latest?.score)} worstPart={latest?.score?.worst_part} onMenu={goHome}
      onContinue={() => {
        setRevealPending(false);
        if (game.phase === "roundResults") game.nextStep();
      }} />;
  }

  if (game.phase === "creatorRecording" || game.phase === "copying") {
    // No onSkip: team play has no skip rule, so DashboardPage hides the Skip turn button.
    return <DashboardPage player={toUi(game.currentPlayer)} creator={toUi(game.creator)} players={rankings}
      round={game.roundNumber} rounds={game.totalRounds} bpm={bpm} phase={recordingBusy ? "recording" : "idle"}
      onMenu={goHome} onRecord={record} />;
  }

  if (game.phase === "roundResults" || game.phase === "leaderboard") {
    return <LeaderboardPage players={rankings} onMenu={goHome}
      nextLabel={game.phase === "roundResults" ? "LEADERBOARD" : game.isLastRound ? "BREAKING NEWS" : "NEXT ROUND"}
      onNext={game.nextStep} />;
  }

  // finale: the full-screen scene first (falls back to the plain finale on its own), then the headline
  if (!sceneDone) {
    return <FinaleScene loserClipUrl={game.loserWorstAttempt?.recording.videoUrl ?? null} onFinish={() => setSceneDone(true)} />;
  }
  const roast = game.roast;
  const headline = roast.status === "done" && roast.result ? roast.result.headline
    : roast.status === "error" ? "REPORT UNAVAILABLE" : "DEVELOPING STORY...";
  const roastLine = roast.status === "done" && roast.result ? roast.result.roast_line
    : roast.status === "error" ? roast.error?.message ?? "" : "Our reporters are reviewing the footage.";
  return <FinalePage loser={toUi(game.loser?.player)} worstScore={toScore(game.loserWorstAttempt?.score)}
    headline={headline} roastLine={roastLine} players={rankings}
    onRetry={roast.status === "error" ? game.retryRoast : undefined}
    onReplay={replay} onMenu={goHome} />;
}
