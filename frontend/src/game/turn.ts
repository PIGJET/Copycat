import type { AttemptResult } from '../types/challenge';
import type { ScoreResult } from './api';

export type Turn =
  | { stage: 'ready' }
  | { stage: 'capture'; key: number }
  | { stage: 'scoring'; key: number; attempt: AttemptResult }
  | { stage: 'score-error'; key: number; attempt: AttemptResult; message: string }
  | { stage: 'results'; key: number; attempt: AttemptResult; score: ScoreResult };

export type TurnAction =
  | { type: 'reset' }
  | { type: 'start'; key: number }
  | { type: 'captured'; key: number; attempt: AttemptResult }
  | { type: 'scored'; key: number; score: ScoreResult }
  | { type: 'failed'; key: number; message: string }
  | { type: 'retry-score' };

export function turnReducer(turn: Turn, action: TurnAction): Turn {
  switch (action.type) {
    case 'reset':
      return { stage: 'ready' };
    case 'start':
      return { stage: 'capture', key: action.key };
    case 'captured':
      return turn.stage === 'capture' && turn.key === action.key
        ? { ...turn, stage: 'scoring', attempt: action.attempt } : turn;
    case 'scored':
      return turn.stage === 'scoring' && turn.key === action.key
        ? { ...turn, stage: 'results', score: action.score } : turn;
    case 'failed':
      return turn.stage === 'scoring' && turn.key === action.key
        ? { ...turn, stage: 'score-error', message: action.message } : turn;
    case 'retry-score':
      return turn.stage === 'score-error'
        ? { stage: 'scoring', key: turn.key, attempt: turn.attempt } : turn;
  }
}
