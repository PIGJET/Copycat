import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { ReferenceClip } from '../../types/challenge';
import { cueWindow } from '../../utils/poseCues';
import type { SourceSize } from '../../utils/poseCues';
import './PoseCueTrack.css';

type Phase = 'ready' | 'countdown' | 'starting' | 'playing' | 'failed' | 'complete';
interface Props { reference: ReferenceClip; source: SourceSize; videoRef: RefObject<HTMLVideoElement | null>; phase: Phase }
const EDGES = [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

export function PoseCueTrack({ reference, source, videoRef, phase }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastTime = useRef(0);
  const cues = useMemo(() => {
    return (reference.cueImages ?? []).flatMap(cue => {
    const frame = reference.recording.frames.find(f => f.t === cue.t);
    if (!frame?.landmarks) return [];
    const image = new Image();
    image.src = cue.dataUrl;
    return [{ ...cue, image, landmarks: frame.landmarks }];
    });
  }, [reference]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let animation = 0;
    let targetStart: number | undefined;
    let fromStart = 0;
    let shownStart = 0;
    let shiftedAt = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height || !source.width || !source.height) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) {
        canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#241a35'; ctx.fillRect(0, 0, width, height);
      const pageSize = width >= 900 ? 10 : width >= 600 ? 8 : 4;
      const page = cueWindow(cues.map(c => c.t), lastTime.current, pageSize);
      if (targetStart === undefined || phase !== 'playing' || reducedMotion.matches) {
        targetStart = page.start;
        fromStart = page.start;
        shownStart = page.start;
      } else if (page.start !== targetStart) {
        fromStart = shownStart;
        targetStart = page.start;
        shiftedAt = performance.now();
      }
      const progress = Math.min(1, (performance.now() - shiftedAt) / 240);
      shownStart = fromStart + (targetStart - fromStart) * progress;
      const first = Math.floor(shownStart);
      const visible = cues.slice(first, Math.ceil(shownStart) + pageSize);
      const cardH = height - 44;
      const cardW = Math.min(240, width / pageSize - 12, cardH * source.width / source.height);
      const slotWidth = cardW + 12;
      const rowLeft = (width - slotWidth * pageSize) / 2;
      ctx.save();
      ctx.beginPath(); ctx.rect(rowLeft, 0, slotWidth * pageSize, height); ctx.clip();
      visible.forEach((cue, index) => {
        const highlighted = first + index === page.active;
        const x = rowLeft + slotWidth * (first + index - shownStart + .5);
        const scale = Math.min(cardW / source.width, cardH / source.height);
        const w = source.width * scale, h = source.height * scale;
        const left = x - w / 2, top = 8 + (cardH - h) / 2;
        if (cue.image.complete && cue.image.naturalWidth) ctx.drawImage(cue.image, left, top, w, h);
        ctx.strokeStyle = highlighted ? '#b6ff00' : '#fff'; ctx.lineWidth = 2;
        for (const [a, b] of EDGES) {
          const p = cue.landmarks[a], q = cue.landmarks[b];
          if (!p || !q || p.visibility < .5 || q.visibility < .5 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || q.x < 0 || q.x > 1 || q.y < 0 || q.y > 1) continue;
          ctx.beginPath(); ctx.moveTo(left + p.x*w, top + p.y*h); ctx.lineTo(left + q.x*w, top + q.y*h); ctx.stroke();
        }
        ctx.fillStyle = highlighted ? '#b6ff00' : '#fff';
        for (const p of cue.landmarks) {
          if (!p || p.visibility < .5 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
          ctx.beginPath(); ctx.arc(left + p.x*w, top + p.y*h, 2, 0, Math.PI*2); ctx.fill();
        }
        if (highlighted) {
          ctx.fillStyle = 'rgba(182, 255, 0, .12)';
          ctx.fillRect(x - cardW / 2, 4, cardW, cardH + 12);
          ctx.strokeStyle = '#b6ff00'; ctx.lineWidth = 3;
          ctx.strokeRect(x - cardW / 2, 4, cardW, cardH + 12);
        }
        ctx.fillStyle = highlighted ? '#b6ff00' : '#fff';
        ctx.font = '600 13px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(`${highlighted ? 'NEXT · ' : ''}${(cue.t / 1000).toFixed(1)}s`, x, height - 10);
      });
      ctx.restore();
    };
    const tick = () => { if (phase === 'playing') lastTime.current = (videoRef.current?.currentTime ?? 0) * 1000; draw(); if (phase === 'playing') animation = requestAnimationFrame(tick); };
    if (phase === 'ready' || phase === 'countdown' || phase === 'starting') lastTime.current = 0;
    if (phase === 'complete') lastTime.current = reference.durationMs;
    const resize = new ResizeObserver(draw); resize.observe(canvas);
    cues.forEach(c => c.image.addEventListener('load', draw)); tick();
    return () => { cancelAnimationFrame(animation); resize.disconnect(); cues.forEach(c => c.image.removeEventListener('load', draw)); };
  }, [cues, phase, reference.durationMs, source, videoRef]);
  return <div className="pose-cue-track" aria-label="Upcoming reference poses"><span>Upcoming moves</span><canvas ref={canvasRef} aria-hidden="true" />{source.width > 0 && !cues.length && <span>No clear poses available for this clip.</span>}</div>;
}
