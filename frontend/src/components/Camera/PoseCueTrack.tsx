import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { ReferenceClip } from '../../types/challenge';
import { cuePosition } from '../../utils/poseCues';
import type { SourceSize } from '../../utils/poseCues';
import './PoseCueTrack.css';

type Phase = 'ready' | 'countdown' | 'starting' | 'playing' | 'failed' | 'complete';
interface Props { reference: ReferenceClip; source: SourceSize; videoRef: RefObject<HTMLVideoElement | null>; phase: Phase }
const EDGES = [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

export function PoseCueTrack({ reference, source, videoRef, phase }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastTime = useRef(0);
  const cues = useMemo(() => (reference.cueImages ?? []).flatMap(cue => {
    const frame = reference.recording.frames.find(f => f.t === cue.t);
    if (!frame?.landmarks) return [];
    const image = new Image();
    image.src = cue.dataUrl;
    return [{ ...cue, image, landmarks: frame.landmarks }];
  }), [reference]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation = 0;
    const draw = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height || !source.width || !source.height) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) {
        canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#241a35'; ctx.fillRect(0, 0, width, height);
      const due = cues.filter(c => c.t <= lastTime.current).at(-1);
      const next = cues.find(c => c.t > lastTime.current);
      const visible = motion.matches ? (due ? [due, next].filter(c => c !== undefined) : cues.slice(0, 2)) : cues;
      const cardW = Math.min(140, Math.max(76, width * .16));
      const cardH = Math.min(height - 30, 145);
      visible.forEach((cue, index) => {
        const pos = cuePosition(cue.t, lastTime.current, width);
        const x = motion.matches ? (index === 0 ? width * .2 : width * .72) : pos.x;
        if (x < -cardW || x > width + cardW) return;
        const scale = Math.min(cardW / source.width, cardH / source.height);
        const w = source.width * scale, h = source.height * scale;
        const left = x - w / 2, top = 8 + (cardH - h) / 2;
        if (cue.image.complete && cue.image.naturalWidth) ctx.drawImage(cue.image, left, top, w, h);
        ctx.strokeStyle = pos.highlighted ? '#b6ff00' : '#fff'; ctx.lineWidth = 2;
        for (const [a, b] of EDGES) {
          const p = cue.landmarks[a], q = cue.landmarks[b];
          if (!p || !q || p.visibility < .5 || q.visibility < .5 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || q.x < 0 || q.x > 1 || q.y < 0 || q.y > 1) continue;
          ctx.beginPath(); ctx.moveTo(left + p.x*w, top + p.y*h); ctx.lineTo(left + q.x*w, top + q.y*h); ctx.stroke();
        }
        ctx.fillStyle = pos.highlighted ? '#b6ff00' : '#fff';
        for (const p of cue.landmarks) {
          if (!p || p.visibility < .5 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
          ctx.beginPath(); ctx.arc(left + p.x*w, top + p.y*h, 2, 0, Math.PI*2); ctx.fill();
        }
      });
      ctx.fillStyle = '#b6ff00'; ctx.fillRect(width*.2 - 2, 6, 4, cardH + 5);
    };
    const tick = () => { if (phase === 'playing') lastTime.current = (videoRef.current?.currentTime ?? 0) * 1000; draw(); if (phase === 'playing') animation = requestAnimationFrame(tick); };
    if (phase === 'ready' || phase === 'countdown' || phase === 'starting') lastTime.current = 0;
    if (phase === 'complete') lastTime.current = reference.durationMs;
    const resize = new ResizeObserver(draw); resize.observe(canvas);
    motion.addEventListener('change', draw); cues.forEach(c => c.image.addEventListener('load', draw)); tick();
    return () => { cancelAnimationFrame(animation); resize.disconnect(); motion.removeEventListener('change', draw); cues.forEach(c => c.image.removeEventListener('load', draw)); };
  }, [cues, phase, reference.durationMs, source, videoRef]);
  return <div className="pose-cue-track" aria-label="Upcoming reference poses"><span>Upcoming moves</span><canvas ref={canvasRef} aria-hidden="true" />{source.width > 0 && !cues.length && <span>No clear poses available for this clip.</span>}</div>;
}
