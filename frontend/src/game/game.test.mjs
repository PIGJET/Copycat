// Game rule tests. Run from frontend/: node --test src/game/
import assert from 'node:assert/strict'
import test from 'node:test'

import { gameReducer, initialGameState, currentPlayerId, currentRound } from './gameReducer.ts'
import { buildRounds, pickLoser, rankTransition, rankings, roastRequestFor, startError, worstAttempt } from './rules.ts'
import { mockRecording } from './mockRecorder.ts'

const players = (...names) => names.map((name, i) => ({ id: `p${i + 1}`, name }))
const score = (total, timing, extra = {}) => ({
  total, timing, arms: total, legs: total, torso: total, worst_part: 'left forearm',
  worst_moment: { reference_ms: 1000, attempt_ms: 1100 }, best_moment: { reference_ms: 5000, attempt_ms: 5000 }, parts: {}, ...extra,
})
let n = 0
const attempt = (playerId, total, timing, extra) => ({
  id: `a${++n}`, roundIndex: 0, playerId, recording: null, status: 'scored', score: score(total, timing, extra), error: null,
})
const ids = (rows) => rows.map((r) => r.player.id)
const rec = () => mockRecording({ seed: 1, durationMs: 1000 })

/** Drive the reducer: apply actions in order. */
const run = (state, ...actions) => actions.reduce(gameReducer, state)

/** Play a whole game, scoring each copy with scoreFor(playerId, roundIndex). */
function playGame(ps, mode, scoreFor) {
  let s = run(initialGameState(ps, mode), { type: 'startGame' })
  const turns = []
  while (s.phase !== 'finale') {
    if (s.phase === 'creatorRecording') {
      turns.push({ round: s.roundIndex, creator: currentPlayerId(s), copiers: [] })
      s = gameReducer(s, { type: 'submitRecording', recording: rec() })
    } else if (s.phase === 'copying') {
      const who = currentPlayerId(s)
      turns.at(-1).copiers.push(who)
      s = gameReducer(s, { type: 'submitRecording', recording: rec() })
      const pending = currentRound(s).attempts.at(-1)
      s = gameReducer(s, { type: 'scoreSucceeded', attemptId: pending.id, score: scoreFor(who, s.roundIndex) })
    } else {
      s = gameReducer(s, { type: 'nextStep' })
    }
  }
  return { s, turns }
}

// ---- averages and ranking (same rules as ui-preview demo-model.test.cjs) ----

test('ranks by average total, not sum', () => {
  const ps = players('Creator', 'Alex', 'Jamie')
  const rows = rankings(ps, [attempt('p2', 90, 70), attempt('p2', 50, 60), attempt('p3', 75, 80)])
  assert.deepEqual(ids(rows), ['p3', 'p2', 'p1'])
  assert.equal(rows[1].average, 70)
  assert.equal(rows[1].timing, 65)
})

test('unscored players are unranked (null, never 0) and listed last', () => {
  const ps = players('Creator', 'Alex', 'Jamie')
  const rows = rankings(ps, [attempt('p2', 80, 70)])
  assert.deepEqual(ids(rows), ['p2', 'p1', 'p3'])
  assert.equal(rows[1].average, null)
  assert.equal(rows[2].average, null)
  assert.ok(rankings(ps, []).every((r) => r.average === null))
})

test('errored or unscored attempts do not count toward averages', () => {
  const ps = players('A', 'B')
  const failed = { ...attempt('p2', 0, 0), status: 'error', score: null }
  const rows = rankings(ps, [attempt('p2', 60, 60), failed])
  assert.equal(rows[0].average, 60)
})

test('tie on average: lower average timing ranks lower', () => {
  const ps = players('Creator', 'Alex', 'Jamie')
  assert.deepEqual(ids(rankings(ps, [attempt('p2', 80, 90), attempt('p3', 80, 50)])), ['p2', 'p3', 'p1'])
})

test('rank movement reports up, down and new players', () => {
  const ps = players('A', 'B', 'C', 'D')
  const before = [attempt('p1', 90, 90), attempt('p2', 80, 80), attempt('p3', 70, 70), attempt('p4', 60, 60)]
  const after = [...before, attempt('p1', 20, 20), attempt('p2', 70, 70), attempt('p3', 100, 100), attempt('p4', 90, 90)]
  const { changes, after: rows } = rankTransition(ps, before, after)
  assert.equal(changes.get('p3').delta, 2)
  assert.equal(changes.get('p1').delta, -3)
  assert.equal(changes.get('p2').delta, 0)
  assert.deepEqual(ids(rows), ['p3', 'p2', 'p4', 'p1'])
  const fresh = rankTransition(ps, [attempt('p2', 70, 70)], [attempt('p2', 70, 70), attempt('p3', 90, 90)]).changes.get('p3')
  assert.deepEqual(fresh, { previous: null, current: 1, delta: 0, isNew: true })
})

// ---- loser ----

test('loser is the lowest average; a tie goes to the lower timing', () => {
  const ps = players('A', 'B', 'C')
  assert.equal(pickLoser(ps, [attempt('p1', 70, 50), attempt('p2', 40, 90), attempt('p3', 60, 10)]).player.id, 'p2')
  assert.equal(pickLoser(ps, [attempt('p1', 50, 80), attempt('p2', 50, 30), attempt('p3', 90, 90)]).player.id, 'p2')
  assert.equal(pickLoser(ps, []), null)
})

test('roast request uses the loser averages and worst_part from their worst attempt', () => {
  const ps = players('A', 'Alex')
  const atts = [
    attempt('p2', 60, 50, { arms: 50, legs: null, worst_part: 'right shin' }),
    attempt('p2', 30, 20, { arms: 10, legs: 40, worst_part: 'left forearm' }),
    attempt('p1', 90, 90),
  ]
  const loser = pickLoser(ps, atts)
  assert.equal(worstAttempt(atts, 'p2').score.total, 30)
  assert.deepEqual(roastRequestFor(loser, atts), {
    player_name: 'Alex', total: 45, arms: 30, legs: 40, torso: 45, timing: 35, worst_part: 'left forearm',
  })
})

// ---- setup ----

test('setup: 2 to 4 players, names required and unique (case-insensitive)', () => {
  let s = initialGameState()
  s = run(s, { type: 'addPlayer', name: '  Alex  ' }, { type: 'startGame' })
  assert.equal(s.phase, 'setup')
  assert.match(s.setupError, /at least 2/)
  s = run(s, { type: 'addPlayer', name: '' })
  assert.equal(s.setupError, 'Enter a name.')
  s = run(s, { type: 'addPlayer', name: 'alex' })
  assert.match(s.setupError, /already playing/)
  s = run(s, { type: 'addPlayer', name: 'Jamie' }, { type: 'addPlayer', name: 'Sam' }, { type: 'addPlayer', name: 'Kai' })
  assert.deepEqual(s.players.map((p) => p.name), ['Alex', 'Jamie', 'Sam', 'Kai'])
  s = run(s, { type: 'addPlayer', name: 'Fifth' })
  assert.equal(s.players.length, 4)
  assert.match(s.setupError, /At most 4/)
  assert.equal(startError(s.players), null)
  s = run(s, { type: 'removePlayer', id: s.players[3].id }, { type: 'startGame' })
  assert.equal(s.phase, 'creatorRecording')
})

// ---- rotation and the creator rule ----

test('quick mode: one round, player 1 creates, everyone else copies in order', () => {
  const ps = players('A', 'B', 'C')
  const { turns } = playGame(ps, 'quick', () => score(70, 70))
  assert.deepEqual(turns, [{ round: 0, creator: 'p1', copiers: ['p2', 'p3'] }])
})

test('full mode: every player creates once, in order', () => {
  const ps = players('A', 'B', 'C', 'D')
  assert.deepEqual(buildRounds('full', ps).map((r) => r.creatorId), ['p1', 'p2', 'p3', 'p4'])
  const { turns } = playGame(ps, 'full', () => score(70, 70))
  assert.deepEqual(turns.map((t) => t.creator), ['p1', 'p2', 'p3', 'p4'])
  assert.deepEqual(turns[2].copiers, ['p1', 'p2', 'p4'])
})

test('the creator is never scored in their own round', () => {
  const ps = players('A', 'B', 'C')
  const { s } = playGame(ps, 'full', () => score(70, 70))
  for (const round of s.rounds) {
    assert.ok(round.attempts.every((a) => a.playerId !== round.creatorId))
    assert.equal(round.attempts.length, ps.length - 1)
  }
  // Each player copied in every round but their own: 2 attempts each in a 3-player full game.
  for (const row of rankings(ps, s.rounds.flatMap((r) => r.attempts))) assert.equal(row.attempts.length, 2)
})

test('full game ends in the finale with the right loser', () => {
  const ps = players('A', 'B', 'C')
  const totals = { p1: 80, p2: 35, p3: 60 }
  const { s } = playGame(ps, 'full', (who) => score(totals[who], 50))
  assert.equal(s.phase, 'finale')
  assert.equal(s.roast.status, 'loading')
  assert.equal(pickLoser(ps, s.rounds.flatMap((r) => r.attempts)).player.name, 'B')
})

// ---- failures never crash the game ----

function toScoring() {
  let s = run(initialGameState(players('A', 'B', 'C')), { type: 'startGame' })
  s = run(s, { type: 'submitRecording', recording: rec() }, { type: 'submitRecording', recording: rec() })
  return s
}

test('a /score failure stays on the scoring screen; retry and redo work', () => {
  let s = toScoring()
  const id = currentRound(s).attempts[0].id
  const error = { message: 'Step back so your whole body is in frame', recording: 'attempt', status: 422 }
  s = gameReducer(s, { type: 'scoreFailed', attemptId: id, error })
  assert.equal(s.phase, 'scoring')
  assert.deepEqual(currentRound(s).attempts[0].error, error)

  s = gameReducer(s, { type: 'retryScore' })
  assert.equal(currentRound(s).attempts[0].status, 'scoring')
  s = gameReducer(s, { type: 'scoreFailed', attemptId: id, error })

  s = gameReducer(s, { type: 'redoAttempt' })
  assert.equal(s.phase, 'copying')
  assert.equal(currentPlayerId(s), 'p2')
  assert.equal(currentRound(s).attempts.length, 0)
})

test('a bad reference sends the creator back and clears the round', () => {
  let s = toScoring()
  const id = currentRound(s).attempts[0].id
  s = gameReducer(s, { type: 'scoreFailed', attemptId: id, error: { message: 'x', recording: 'reference', status: 422 } })
  s = gameReducer(s, { type: 'redoReference' })
  assert.equal(s.phase, 'creatorRecording')
  assert.equal(currentPlayerId(s), 'p1')
  assert.equal(currentRound(s).reference, null)
  assert.equal(currentRound(s).attempts.length, 0)
})

test('stale /score results are ignored', () => {
  let s = toScoring()
  const id = currentRound(s).attempts[0].id
  s = gameReducer(s, { type: 'redoAttempt' })
  const after = gameReducer(s, { type: 'scoreSucceeded', attemptId: id, score: score(99, 99) })
  assert.equal(after, s)
})

test('roast failure can be retried; restart keeps players and mode', () => {
  const ps = players('A', 'B')
  let { s } = playGame(ps, 'quick', () => score(50, 50))
  s = gameReducer(s, { type: 'roastFailed', error: { message: 'down', recording: null, status: null } })
  assert.equal(s.roast.status, 'error')
  s = gameReducer(s, { type: 'retryRoast' })
  assert.equal(s.roast.status, 'loading')
  s = gameReducer(s, { type: 'roastSucceeded', result: { headline: 'BREAKING: x', roast_line: 'y', source: 'fallback' } })
  assert.equal(s.roast.status, 'done')
  s = gameReducer(s, { type: 'restart' })
  assert.equal(s.phase, 'setup')
  assert.deepEqual(s.players, ps)
  assert.equal(s.rounds.length, 0)
})

// ---- mock recorder ----

test('mock recordings use the contract frame format and are reproducible', () => {
  const r = mockRecording({ seed: 42, durationMs: 2000, fps: 10, dropRate: 0.3 })
  assert.equal(r.frames.length, 21)
  assert.equal(r.videoBlob, null)
  assert.equal(r.videoUrl, null)
  assert.ok(r.frames.some((f) => f.lm === null))
  for (const f of r.frames.filter((f) => f.lm)) {
    assert.equal(f.lm.length, 33)
    assert.ok(f.lm.every((p) => p.length === 3 && p.every(Number.isFinite)))
  }
  assert.deepEqual(mockRecording({ seed: 42, durationMs: 500 }).frames, mockRecording({ seed: 42, durationMs: 500 }).frames)
})
