import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ErrorSample } from './replayAnalysis';
import { formatReplayTime, timelineSections, timelineTicks } from './replayTimelineData';

const FRAME_COUNT = 8;

type Props = {
  videoUrl: string;
  durationMs: number;
  position: number;
  samples: ErrorSample[];
  playing: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSeek: (ms: number) => void;
  onSeekStart: () => void;
};

function useThumbnails(url: string, durationMs: number) {
  const [result, setResult] = useState<{ url: string; durationMs: number; images: string[] }>();
  useEffect(() => {
    let cancelled = false;
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const controller = new AbortController();
    video.muted = true;
    video.preload = 'auto';
    video.src = url;
    canvas.width = 200;
    canvas.height = 112;
    const wait = (event: string) => new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => finish(false), 5000);
      function finish(success: boolean) {
        window.clearTimeout(timer);
        video.removeEventListener(event, done);
        video.removeEventListener('error', fail);
        controller.signal.removeEventListener('abort', fail);
        if (success) resolve(); else reject(new Error('Thumbnail unavailable'));
      }
      function done() { finish(true); }
      function fail() { finish(false); }
      video.addEventListener(event, done, { once: true });
      video.addEventListener('error', fail, { once: true });
      controller.signal.addEventListener('abort', fail, { once: true });
    });
    async function generate() {
      try {
        if (video.readyState < 1) await wait('loadedmetadata');
        const context = canvas.getContext('2d');
        if (!context || !Number.isFinite(video.duration) || video.duration <= 0) return;
        const frames: string[] = [];
        for (let i = 0; i < FRAME_COUNT; i++) {
          if (controller.signal.aborted) return;
          const pending = wait('seeked');
          video.currentTime = Math.min(video.duration - .001, durationMs / 1000 * (i + .5) / FRAME_COUNT);
          await pending;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', .65));
        }
        if (!cancelled) setResult({ url, durationMs, images: frames });
      } catch {
        if (!cancelled) setResult({ url, durationMs, images: [] });
      }
    }
    void generate();
    return () => {
      cancelled = true;
      controller.abort();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [url, durationMs]);
  return result?.url === url && result.durationMs === durationMs ? result.images : [];
}

export function ReplayTimeline({ videoUrl, durationMs, position, samples, playing, disabled, onToggle, onSeek, onSeekStart }: Props) {
  const thumbnails = useThumbnails(videoUrl, durationMs);
  const ticks = useMemo(() => timelineTicks(durationMs), [durationMs]);
  const sections = useMemo(() => timelineSections(samples, durationMs), [samples, durationMs]);
  const progress = durationMs > 0 ? Math.max(0, Math.min(100, position / durationMs * 100)) : 0;
  const style = { '--replay-progress': `${progress}%` } as CSSProperties;
  return (
    <div className="filmstrip-timeline" style={style}>
      <div className="filmstrip-heading"><span>Dance timeline</span><span>Reference video</span></div>
      <div className="filmstrip-ticks" aria-hidden="true">
        {ticks.map((tick, i) => <span key={i}>{formatReplayTime(tick)}</span>)}
      </div>
      <div className="filmstrip-track">
        <div className="filmstrip-frames" aria-hidden="true">
          {Array.from({ length: FRAME_COUNT }, (_, i) => <div key={i}>
            {thumbnails[i] && <img src={thumbnails[i]} alt="" />}
          </div>)}
        </div>
        {!thumbnails.length && <span className="filmstrip-placeholder">Video thumbnails unavailable</span>}
        <div className="filmstrip-dim" aria-hidden="true" />
        <div className="filmstrip-playhead" aria-hidden="true"><span>{formatReplayTime(position)}</span></div>
        <input type="range" min={0} max={Math.max(0, durationMs)} step={100}
          value={Math.max(0, Math.min(durationMs, position))} disabled={durationMs <= 0}
          aria-label="Replay position" aria-valuetext={`${formatReplayTime(position)} of ${formatReplayTime(durationMs)}`}
          onPointerDown={onSeekStart} onChange={event => onSeek(Number(event.target.value))} />
      </div>
      <div className="filmstrip-scores" role="img" aria-label={sections.length ? 'Scoring error over time; low, moderate and high error are shown by color.' : 'Timeline scoring details unavailable.'}>
        {sections.map((section, i) => <span key={i} className={`filmstrip-score filmstrip-score--${section.label.split(' ')[0].toLowerCase()}`}
          style={{ left: `${section.start / durationMs * 100}%`, width: `${(section.end - section.start) / durationMs * 100}%` }} title={`${section.label}, ${formatReplayTime(section.start)}–${formatReplayTime(section.end)}`}>{section.end - section.start >= durationMs * .1 ? section.label : ''}</span>)}
        {!sections.length && <span className="filmstrip-no-score">Timeline scoring details unavailable</span>}
      </div>
      <div className="filmstrip-footer">
        <button className="filmstrip-play" type="button" disabled={disabled} onClick={onToggle} aria-label={playing ? 'Pause both videos' : 'Play both videos'}>{playing ? 'Ⅱ' : '▶'}</button>
        <span className="filmstrip-time">{formatReplayTime(position)} <span>/</span> {formatReplayTime(durationMs)}</span>
        <div className="filmstrip-legend" aria-label="Error intensity legend"><span>Error intensity</span><span><i className="is-low" />Low</span><span><i className="is-moderate" />Moderate</span><span><i className="is-high" />High</span></div>
      </div>
    </div>
  );
}
