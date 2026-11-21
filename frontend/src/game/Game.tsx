import { useEffect, useReducer, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ChallengeRecorder } from '../components/Camera/ChallengeRecorder';
import type { LiveFeedback, ReferenceClip } from '../types/challenge';
import { prepareReference } from '../utils/referenceRecorder';
import { checkBackend, importReference, scoreAttempt, scoreRecovery } from './api';
import { ResultsReplay } from './ResultsReplay';
import { turnReducer } from './turn';
import './game.css';

const SAMPLE_URL = 'https://www.youtube.com/watch?v=i-54NhTqlH8';

export default function Game() {
  const [clip, setClip] = useState<ReferenceClip | null>(null);
  const [turn, dispatch] = useReducer(turnReducer, { stage: 'ready' });
  const [feedback, setFeedback] = useState<LiveFeedback | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [start, setStart] = useState('0');
  const [duration, setDuration] = useState('10');
  const prepareOp = useRef<AbortController | null>(null);
  const clipUrl = useRef<string | null>(null);
  const turnId = useRef(0);

  useEffect(() => () => {
    prepareOp.current?.abort();
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
  }, []);

  useEffect(() => {
    if (!clip || turn.stage !== 'scoring') return;
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(15_000);
    const signal = AbortSignal.any([controller.signal, deadline]);
    void scoreAttempt(clip.recording, turn.attempt.recording, signal).then(
      score => {
        if (controller.signal.aborted) return;
        if (deadline.aborted) dispatch({ type: 'failed', key: turn.key, message: 'Scoring took too long. Retry the saved attempt.' });
        else dispatch({ type: 'scored', key: turn.key, score });
      },
      error => {
        if (controller.signal.aborted) return;
        const detail = deadline.aborted ? 'Scoring took too long. Retry the saved attempt.'
          : error instanceof Error ? error.message : 'Could not score the turn.';
        const recovery = scoreRecovery(error);
        if (recovery === 'reference') {
          if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
          clipUrl.current = null;
          setClip(null);
          dispatch({ type: 'reset' });
          setMessage(detail);
        } else if (recovery === 'attempt') {
          setFeedback(null);
          setMessage(detail);
          dispatch({ type: 'start', key: ++turnId.current });
        } else {
          dispatch({ type: 'failed', key: turn.key, message: detail });
        }
      },
    );
    return () => controller.abort();
  }, [clip, turn]);

  async function loadClip(source: (signal: AbortSignal) => Promise<Blob>) {
    prepareOp.current?.abort();
    const controller = new AbortController();
    prepareOp.current = controller;
    setMessage('');
    setPreparing(true);
    let url: string | undefined;
    try {
      const blob = await source(controller.signal);
      controller.signal.throwIfAborted();
      url = URL.createObjectURL(blob);
      const prepared = await prepareReference(url, controller.signal);
      controller.signal.throwIfAborted();
      if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
      clipUrl.current = url;
      url = undefined;
      setClip(prepared);
      dispatch({ type: 'reset' });
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(error instanceof Error ? error.message : 'Could not prepare this clip.');
      }
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (prepareOp.current === controller) {
        setPreparing(false);
        prepareOp.current = null;
      }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void loadClip(signal => importReference(link, Number(start), Number(duration), signal));
  }

  function chooseAnother() {
    prepareOp.current?.abort();
    setChecking(false);
    setClip(null);
    dispatch({ type: 'reset' });
    setFeedback(null);
    setMessage('');
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    clipUrl.current = null;
  }

  async function startTurn() {
    if (prepareOp.current) return;
    const controller = new AbortController();
    prepareOp.current = controller;
    setChecking(true);
    setMessage('');
    const deadline = AbortSignal.timeout(5000);
    try {
      await checkBackend(AbortSignal.any([controller.signal, deadline]));
      if (controller.signal.aborted) return;
      setFeedback(null);
      dispatch({ type: 'start', key: ++turnId.current });
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(deadline.aborted ? 'The backend did not respond. Try again.'
          : error instanceof Error ? error.message : 'Could not check the backend.');
      }
    } finally {
      if (prepareOp.current === controller) {
        prepareOp.current = null;
        setChecking(false);
      }
    }
  }

  return (
    <main className="solo-game">
      <div className="solo-game__stage">
        <header className="solo-game__header">
          <h1>Copycat</h1>
          <span>Solo</span>
        </header>

        {!clip ? (
          <section aria-labelledby="solo-source-title">
            <h2 id="solo-source-title">Choose a dance clip</h2>
            <form onSubmit={submit} className="solo-source">
              <label>
                YouTube link
                <input type="url" required value={link} onChange={event => setLink(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…" disabled={preparing} />
              </label>
              <div className="solo-source__range">
                <label>Start (seconds)<input type="number" min="0" step="any" required value={start}
                  onChange={event => setStart(event.target.value)} disabled={preparing} /></label>
                <label>Length (seconds)<input type="number" min="5" max="60" step="any" required value={duration}
                  onChange={event => setDuration(event.target.value)} disabled={preparing} /></label>
              </div>
              <div className="solo-actions">
                <button type="submit" className="solo-primary" disabled={preparing}>Prepare clip</button>
                <button type="button" disabled={preparing} onClick={() => {
                  setLink(SAMPLE_URL);
                  setStart('5');
                  setDuration('5');
                }}>Use sample link</button>
              </div>
            </form>
            <label className="solo-file">Or choose a local MP4
              <input type="file" accept="video/mp4,.mp4" disabled={preparing} onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void loadClip(async () => file);
              }} />
            </label>
            {preparing && <div className="solo-actions">
              <p role="status">Preparing dance…</p>
              <button type="button" onClick={() => prepareOp.current?.abort()}>Cancel</button>
            </div>}
            {message && <p role="alert">{message}</p>}
          </section>
        ) : turn.stage === 'ready' ? (
          <section aria-labelledby="solo-preview-title">
            <h2 id="solo-preview-title">Preview your dance</h2>
            <video className="solo-preview" src={clip.videoUrl} controls playsInline />
            {checking && <p role="status">Checking backend…</p>}
            {message && <p role="alert">{message}</p>}
            <div className="solo-actions">
              <button type="button" className="solo-primary" disabled={checking} onClick={() => void startTurn()}>Get ready</button>
              <button type="button" onClick={chooseAnother}>Change clip</button>
            </div>
          </section>
        ) : turn.stage === 'capture' ? (
          <section aria-labelledby="solo-turn-title">
            <h2 id="solo-turn-title">Your turn</h2>
            <div className="solo-rating" role="status" aria-atomic="true">{feedback?.label}</div>
            <ChallengeRecorder key={turn.key} reference={clip} playerId="solo"
              onFeedback={value => { setMessage(''); setFeedback(value); }}
              onComplete={attempt => dispatch({ type: 'captured', key: turn.key, attempt })}
              onError={() => setFeedback(null)} />
            {message && <p role="alert">{message}</p>}
            <div className="solo-actions">
              <button type="button" onClick={chooseAnother}>Change clip</button>
            </div>
          </section>
        ) : turn.stage === 'scoring' ? (
          <section>
            <p role="status">Scoring your turn…</p>
            <button type="button" onClick={chooseAnother}>Change clip</button>
          </section>
        ) : turn.stage === 'score-error' ? (
          <section aria-labelledby="solo-score-error">
            <h2 id="solo-score-error">Could not score this turn</h2>
            <p role="alert">{message || turn.message}</p>
            <div className="solo-actions">
              <button type="button" className="solo-primary" disabled={checking} onClick={() => dispatch({ type: 'retry-score' })}>Retry score</button>
              <button type="button" disabled={checking} onClick={() => void startTurn()}>Dance again</button>
              <button type="button" onClick={chooseAnother}>Change clip</button>
            </div>
          </section>
        ) : (
          <section aria-labelledby="solo-score-title">
            <h2 id="solo-score-title">Official score</h2>
            <div className="solo-score"><strong>{turn.score.total}</strong><span> / 100</span></div>
            <dl className="solo-breakdown">
              {([['Arms', turn.score.arms], ['Legs', turn.score.legs], ['Torso', turn.score.torso],
                ['Timing', turn.score.timing]] as const).map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>
              ))}
            </dl>
            {turn.score.worst_part && <p>Weakest part overall: <strong>{turn.score.worst_part}</strong></p>}
            <ResultsReplay key={turn.key} reference={clip} attempt={turn.attempt} score={turn.score} />
            {checking && <p role="status">Checking backend…</p>}
            {message && <p role="alert">{message}</p>}
            <div className="solo-actions">
              <button type="button" className="solo-primary" disabled={checking} onClick={() => void startTurn()}>Dance again</button>
              <button type="button" onClick={chooseAnother}>Change clip</button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
