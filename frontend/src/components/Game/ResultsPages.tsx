import "./WinnerPage.css";
import type { Player, Ranking, Score } from "./uiTypes";
import { ArcadeButton, GameHeader, PageFrame, PlayerAvatar, PosePlaceholder } from "./primitives";
export function ScorePage({ player, score, onContinue, onMenu, worstPart, status, continueLabel = "CONTINUE", continueDisabled = false, secondaryAction }: { player: Player; score: Score; onContinue: () => void; onMenu: () => void; worstPart?: string; status?: string; continueLabel?: string; continueDisabled?: boolean; secondaryAction?: { label: string; onClick: () => void } }) {
 const parts = ["arms", "legs", "torso", "timing"] as const;
 return <PageFrame><GameHeader title={player.name} label="SCORE REVEAL" onMenu={onMenu}/><div className="score-stage"><PlayerAvatar player={player} className="result-player"/><div className="score-result"><div className="score-display" aria-label={`${score.total ?? "Unscored"} out of 100`}><span>{score.total ?? "—"}</span><span className="score-denominator">/100</span></div>{worstPart && <p className="data-note">Worst part: {worstPart}</p>}</div></div><dl className="score-breakdown">{parts.map(part => <div className="score-part" key={part}><dt>{part}</dt><dd>{score[part] ?? "—"}<span>/100</span></dd><div className="score-track"><span style={{ width: `${score[part] ?? 0}%` }}/></div></div>)}</dl><div className="result-footer">{status && <p role="status">{status}</p>}{secondaryAction && <ArcadeButton secondary onClick={secondaryAction.onClick}>{secondaryAction.label}</ArcadeButton>}<ArcadeButton onClick={onContinue} disabled={continueDisabled}>{continueLabel}</ArcadeButton></div></PageFrame>;
}
export function LeaderboardPage({ players, onNext, onMenu, final = false, nextLabel }: { players: Ranking[]; onNext: () => void; onMenu: () => void; final?: boolean; nextLabel?: string }) {
 const ranked = [...players].sort((a,b) => (b.average ?? -1) - (a.average ?? -1));
 return <PageFrame><GameHeader title={final ? "FINAL RANKING" : "LEADERBOARD"} label={final ? "FINAL RESULTS" : "ROUND RESULTS"} onMenu={onMenu}/><div className="leaderboard-layout"><div className="leaderboard"><div className="board-labels"><span>RANK / PLAYER</span><span>AVG SCORE</span></div><ol aria-label="Player rankings">{ranked.map((row, i) => <li className={`rank-row ${i === 0 ? "first-place" : ""} ${i === ranked.length - 1 ? "last-place" : ""}`} key={row.player.id}><span className="rank-number">{row.average == null ? "—" : i + 1}</span><PlayerAvatar player={row.player} className="rank-avatar"/><div className="rank-name"><strong>{row.player.name}</strong><span className="rank-attempts">{row.average == null ? "Creator (not scored)" : `${row.attempts ?? 1} performance${row.attempts === 1 ? "" : "s"}`}</span></div><strong className="rank-score">{row.average ?? "—"}<small>/100</small></strong></li>)}</ol></div><aside className="next-round"><p className="data-note">Ranked by average score.</p><ArcadeButton onClick={onNext}>{nextLabel ?? (final ? "RETURN TO MENU" : "NEXT ROUND")}</ArcadeButton></aside></div></PageFrame>;
}
export function FinalePage({ loser, worstScore, headline, roastLine, players, onReplay, onMenu, onRetry }: { loser: Player; worstScore: Score; headline: string; roastLine: string; players: Ranking[]; onReplay: () => void; onMenu: () => void; onRetry?: () => void }) {
 return <PageFrame className="news-active"><GameHeader title="FINAL RESULTS" label="BREAKING NEWS" onMenu={onMenu}/><div className="finale-layout"><div className="broadcast"><div className="news-top"><span className="channel-brand">CCN <small>COPYCAT NEWS</small></span><span className="news-source">PERFORMANCE REPORT</span></div><div className="news-banner">BREAKING NEWS</div><div className="news-video"><PosePlaceholder/><strong>{loser.name}</strong><span>Performance replay</span></div><div className="news-headline"><span>PERFORMANCE REPORT</span><h3>{headline}</h3><p>{roastLine}</p></div><div className="news-ticker">{loser.name} / LOWEST PERFORMANCE {worstScore.total ?? "—"}/100</div></div><aside className="final-standings"><h3>FINAL RANKING</h3><ol className="leaderboard compact-board">{players.map((p, i) => <li className="rank-row" key={p.player.id}><span className="rank-number">{i + 1}</span><PlayerAvatar player={p.player} className="rank-avatar"/><div className="rank-name"><strong>{p.player.name}</strong></div><strong className="rank-score">{p.average ?? "—"}</strong></li>)}</ol></aside></div><div className="finale-controls">{onRetry && <ArcadeButton onClick={onRetry}>RETRY REPORT</ArcadeButton>}<ArcadeButton secondary onClick={onReplay}>REPLAY</ArcadeButton><ArcadeButton onClick={onMenu}>RETURN TO MENU</ArcadeButton></div></PageFrame>;
}

/** John's winner reveal (from refactored-ui-to-react). Not in the team flow yet; the finale is the breaking-news shame. */
export function WinnerPage({ players, onReplay, onMenu }: { players: Ranking[]; onReplay: () => void; onMenu: () => void }) {
  const topScore = players[0]?.average ?? null;
  const winners = topScore === null ? [] : players.filter(row => row.average === topScore);

  return (
    <PageFrame>
      <GameHeader title="FINAL RESULTS" onMenu={onMenu} />
      <section className="winner-reveal" aria-label="Winner reveal">
        <h3>{winners.length === 0 ? "No scored performances" : winners.length === 1 ? "Copycat champion" : "Copycat champions"}</h3>
        {winners.length > 0 && (
          <>
            <div className="winner-players">
              {winners.map(({ player }) => (
                <div className="winner-player" key={player.id}>
                  <PlayerAvatar player={player} />
                  <strong>{player.name}</strong>
                </div>
              ))}
            </div>
            <p>{topScore}<small> / 100 AVG</small></p>
          </>
        )}
      </section>
      <ol className="leaderboard compact-board winner-standings" aria-label="Final standings">
        {players.map(row => (
          <li className="rank-row" key={row.player.id}>
            <span className="rank-number">{row.average === null ? "—" : players.findIndex(other => other.average === row.average) + 1}</span>
            <PlayerAvatar player={row.player} className="rank-avatar" />
            <div className="rank-name"><strong>{row.player.name}</strong></div>
            <strong className="rank-score">{row.average ?? "—"}<small>/100</small></strong>
          </li>
        ))}
      </ol>
      <div className="finale-controls">
        <ArcadeButton onClick={onReplay}>PLAY AGAIN</ArcadeButton>
        <ArcadeButton secondary onClick={onMenu}>RETURN TO MENU</ArcadeButton>
      </div>
    </PageFrame>
  );
}
