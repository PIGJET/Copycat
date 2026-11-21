import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { AttemptResult, ReferenceClip } from '../types/challenge';
import type { PoseRecording } from '../types/pose';
import type { ScoreResult } from './api';
import { findReplayPose } from './replay';
import { readAnalysis, analysisAt, mistakeSections, errorColor, REPLAY_SEGMENTS, worstPart, describeMistake } from './replayAnalysis';
import type { ErrorSample } from './replayAnalysis';

function seekFrame(video: HTMLVideoElement, seconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown) => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      video.removeEventListener('loadedmetadata', seek);
      video.removeEventListener('seeked', decoded);
      video.removeEventListener('loadeddata', decoded);
      video.removeEventListener('error', failed);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(signal.reason);
    const failed = () => finish(new Error('Could not open that replay moment.'));
    const timeout = window.setTimeout(failed, 5000);
    let target: number | undefined;
    function decoded() {
      if (target !== undefined && !video.seeking && video.readyState >= 2
        && Math.abs(video.currentTime - target) <= .1) finish();
    }
    function seek() {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > video.duration + .1) {
        failed();
        return;
      }
      target = Math.min(seconds, video.duration);
      try {
        video.currentTime = target;
        decoded();
      } catch {
        failed();
      }
    }
    signal.addEventListener('abort', abort, { once: true });
    video.addEventListener('seeked', decoded);
    video.addEventListener('loadeddata', decoded);
    video.addEventListener('error', failed);
    if (video.readyState) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
  });
}

function ReplayPane({ label, url, videoRef, recording, offsetMs, mirrored, onStop, onError, samples, showMistakes }: {
  samples: ErrorSample[];
  showMistakes: boolean;
  label: string;
  url?: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  recording: PoseRecording;
  offsetMs: number;
  mirrored?: boolean;
  onStop: () => void;
  onError: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!video || !canvas || !ctx) return;
    const drawing = new DrawingUtils(ctx);
    function clear() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
    }
    function draw(t: number) {
      if (!video!.videoWidth || video!.seeking) {
        clear();
        return;
      }
      if (canvas!.width !== video!.videoWidth) canvas!.width = video!.videoWidth;
      if (canvas!.height !== video!.videoHeight) canvas!.height = video!.videoHeight;
      clear();
      const landmarks = findReplayPose(recording, t * 1000 - offsetMs)?.landmarks;
      if (!showMistakes || !landmarks) return;
      if (!mirrored) {
        drawing.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#00f0ff', lineWidth: 3 });
        return;
      }
      const sample = analysisAt(samples, t * 1000 - offsetMs);
      if (!sample) return;
      const points = [...landmarks];
      for (const [a,b] of [[23,24],[11,12]]) {
        points.push({x:(landmarks[a].x+landmarks[b].x)/2,y:(landmarks[a].y+landmarks[b].y)/2,z:0,visibility:Math.min(landmarks[a].visibility,landmarks[b].visibility)});
      }
      const worst = worstPart(sample)?.[0];
      for (const [name,[a,b]] of Object.entries(REPLAY_SEGMENTS)) {
        const color=errorColor(sample.parts[name]);
        if(!color || ![points[a],points[b]].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.visibility>=.5&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1))continue;
        ctx!.strokeStyle=color;ctx!.lineWidth=name===worst?7:3;ctx!.lineCap='round';
        ctx!.beginPath();ctx!.moveTo(points[a].x*canvas!.width,points[a].y*canvas!.height);ctx!.lineTo(points[b].x*canvas!.width,points[b].y*canvas!.height);ctx!.stroke();
      }
    }
    const drawCurrent = () => draw(video.currentTime);
    let callback = video.requestVideoFrameCallback(frame);
    function frame(_now: number, metadata: VideoFrameCallbackMetadata) {
      draw(metadata.mediaTime);
      callback = video!.requestVideoFrameCallback(frame);
    }
    video.addEventListener('seeked', drawCurrent);
    video.addEventListener('loadeddata', drawCurrent);
    video.addEventListener('seeking', clear);
    drawCurrent();
    return () => {
      video.cancelVideoFrameCallback(callback);
      video.removeEventListener('seeked', drawCurrent);
      video.removeEventListener('loadeddata', drawCurrent);
      video.removeEventListener('seeking', clear);
      drawing.close();
    };
  }, [url, videoRef, recording, offsetMs, samples, showMistakes, mirrored]);

  return (
    <figure className="solo-replay__pane">
      <figcaption>{label}</figcaption>
      <div className={mirrored ? 'solo-replay__media solo-replay__media--mirrored' : 'solo-replay__media'}>
        <video ref={videoRef} src={url} playsInline preload="auto" muted={mirrored}
          onEnded={onStop} onWaiting={onStop} onPause={onStop} onError={onError} />
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
    </figure>
  );
}

export function ResultsReplay({ reference, attempt, score }: {
  reference: ReferenceClip;
  attempt: AttemptResult;
  score: ScoreResult;
}) {
  const referenceVideo = useRef<HTMLVideoElement>(null);
  const attemptVideo = useRef<HTMLVideoElement>(null);
  const seeking = useRef<AbortController | null>(null);
  const playbackRequest = useRef({ generation: 0 });
  const [isSeeking, setIsSeeking] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const offset = attempt.video.attemptPoseZeroInVideoMs;
  const samples = useMemo(() => readAnalysis(score.replay_analysis, reference.durationMs) ?? [], [score.replay_analysis, reference.durationMs]);
  const cameraSamples = useMemo(() => samples.map(s => ({...s, reference_ms:s.attempt_ms})), [samples]);
  const sections = useMemo(() => mistakeSections(samples, reference.durationMs), [samples, reference.durationMs]);
  const worst = [...sections].sort((a,b)=>b.peak.severity-a.peak.severity)[0];
  const initialMs = worst ? Math.max(0,worst.peak.reference_ms-1000) : 0;
  const referenceSeconds = initialMs / 1000;
  const attemptSeconds = ((analysisAt(samples,initialMs)?.attempt_ms ?? initialMs) + offset)/1000;
  const [position, setPosition] = useState(initialMs);
  const [rate, setRate] = useState(1);
  const [showMistakes, setShowMistakes] = useState(true);
  const [selected, setSelected] = useState<number | null>(worst?.peak.reference_ms ?? null);
  const currentSample = analysisAt(samples,position);
  const selectedSample = sections.find(s=>s.peak.reference_ms===selected)?.peak;
  const formatTime = (ms:number) => `${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;

  function pauseBoth() {
    playbackRequest.current.generation++;
    referenceVideo.current?.pause();
    attemptVideo.current?.pause();
    setIsPlaying(false);
  }

  function showPlaybackError() {
    pauseBoth();
    setError('Could not load a replay video. You can still keep your score.');
  }

  // A new position cancels the previous seek. The seek promise checks the decoded position.
  async function move(refSeconds: number, cameraSeconds: number, initial = false) {
    const ref = referenceVideo.current;
    const camera = attemptVideo.current;
    if (!ref || !camera) return false;
    setPosition(refSeconds * 1000);
    seeking.current?.abort();
    const controller = new AbortController();
    seeking.current = controller;
    if (!initial) {
      pauseBoth();
      setIsSeeking(true);
      setError('');
    }
    try {
      await Promise.all([seekFrame(ref, refSeconds, controller.signal), seekFrame(camera, cameraSeconds, controller.signal)]);
      return !controller.signal.aborted;
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not seek this replay.');
        controller.abort();
      }
      return false;
    } finally {
      if (seeking.current === controller) {
        seeking.current = null;
        setIsSeeking(false);
      }
    }
  }

  const initializeReplay = useEffectEvent(() => {
    void move(referenceSeconds, attemptSeconds, true);
  });

  const updateClock = useEffectEvent(() => {
    const ref=referenceVideo.current,camera=attemptVideo.current;
    if (!ref || !camera || seeking.current || ref.paused) return;
    const ms=ref.currentTime*1000;
    setPosition(ms);
    const target=((analysisAt(samples,ms)?.attempt_ms ?? ms)+offset)/1000;
    if (!camera.paused && !camera.seeking && Number.isFinite(camera.duration) && Math.abs(camera.currentTime-target)>.1) camera.currentTime=Math.min(camera.duration,target);
  });

  useEffect(() => {
    const camera = attemptVideo.current;
    const ref = referenceVideo.current;
    if (!camera) return;
    const url = URL.createObjectURL(attempt.video.blob);
    const playback = playbackRequest.current;
    camera.src = url;
    initializeReplay();
    const clock = window.setInterval(() => updateClock(),100);
    return () => {
      window.clearInterval(clock);
      playback.generation++;
      ref?.pause();
      camera.pause();
      const pending = seeking.current;
      seeking.current = null;
      pending?.abort();
      URL.revokeObjectURL(url);
    };
  }, [attempt.video.blob]);

  async function playBoth() {
    const ref = referenceVideo.current;
    const camera = attemptVideo.current;
    if (!ref || !camera) return;
    if (isPlaying) {
      pauseBoth();
      return;
    }
    if ((ref.ended || camera.ended) && !(await move(0, offset / 1000))) return;
    const request = ++playbackRequest.current.generation;
    setError('');
    try {
      await Promise.all([ref.play(), camera.play()]);
      if (playbackRequest.current.generation === request) setIsPlaying(!ref.paused && !camera.paused);
    } catch {
      if (playbackRequest.current.generation !== request) return;
      pauseBoth();
      setError('Could not play both replays. Try jumping to another moment.');
    }
  }

  function seekTo(ms:number) {
    void move(ms/1000, ((analysisAt(samples,ms)?.attempt_ms ?? ms)+offset)/1000);
  }

  return (
    <section aria-labelledby="solo-replay-title">
      <h2 id="solo-replay-title">Correction replay</h2>
      <div className="solo-replay__grid">
        <ReplayPane label="Reference" url={reference.videoUrl} videoRef={referenceVideo}
          recording={reference.recording} offsetMs={0} samples={samples} showMistakes={showMistakes && samples.length>0} onStop={pauseBoth} onError={showPlaybackError} />
        <ReplayPane label="Your attempt" videoRef={attemptVideo}
          recording={attempt.recording} offsetMs={offset} samples={cameraSamples} showMistakes={showMistakes && samples.length>0} mirrored onStop={pauseBoth} onError={showPlaybackError} />
      </div>
      <div className="replay-timeline">
        <label htmlFor="replay-seek">Replay position · {formatTime(position)} / {formatTime(reference.durationMs)}</label>
        <div className="replay-markers" aria-label="Mistake sections">
          {sections.map((section,i)=><button key={section.peak.reference_ms} type="button" className={`${selected===section.peak.reference_ms ? 'is-selected ' : ''}${worstPart(section.peak)?.[1].status === 'not_tracked' ? 'is-untracked' : 'is-mismatch'}`}
            style={{left:`${section.start/reference.durationMs*100}%`,width:`${Math.max(2,(section.end-section.start)/reference.durationMs*100)}%`}}
            aria-label={`Mistake ${i+1}, ${formatTime(section.peak.reference_ms)}, ${describeMistake(section.peak)}`} aria-pressed={selected===section.peak.reference_ms}
            onClick={()=>{setSelected(section.peak.reference_ms);seekTo(Math.max(0,section.peak.reference_ms-1000));}}>{i+1}</button>)}
        </div>
        <input id="replay-seek" type="range" min={0} max={reference.durationMs} step={1000/15} value={Math.min(reference.durationMs,position)}
          aria-valuetext={formatTime(position)} onPointerDown={pauseBoth} onChange={e=>seekTo(Number(e.target.value))}/>
      </div>
      {samples.length===0 && <p role="status">Mistake details unavailable</p>}
      {showMistakes && samples.length>0 && <><p role="status">{selectedSample ? describeMistake(selectedSample) : 'Select a mistake marker to inspect it'}</p><p>{describeMistake(currentSample)}</p>
        <p className="replay-legend">Green: close · Amber: moderate mismatch · Red: large mismatch · Not tracked: no reliable limb position</p></>}
      <div className="solo-actions">
        <label>Speed <select value={rate} onChange={e=>{const value=Number(e.target.value);setRate(value);for(const video of [referenceVideo.current,attemptVideo.current])if(video)video.playbackRate=value;}}>
          <option value={.25}>0.25×</option><option value={.5}>0.5×</option><option value={1}>1×</option></select></label>
        <label><input type="checkbox" checked={showMistakes} onChange={e=>setShowMistakes(e.target.checked)}/> Show mistakes</label>
        <button type="button" disabled={isSeeking || Boolean(error)} onClick={() => void playBoth()}>
          {isPlaying ? 'Pause both' : 'Play both'}
        </button>
        <button type="button" disabled={isSeeking} onClick={() => void move(0, offset / 1000)}>Replay from start</button>
        <button type="button" disabled={isSeeking} onClick={() => {setSelected(worst?.peak.reference_ms ?? null);seekTo(initialMs);}}>Worst mistake</button>
      </div>
      {isSeeking && <p role="status">Finding replay frames…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
