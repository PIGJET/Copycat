import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { ReferenceClip } from '../../types/challenge';
import { cueGeometry, cuePosition, selectPoseCues } from '../../utils/poseCues';
import type { SourceSize } from '../../utils/poseCues';
import './PoseCueTrack.css';

type Phase = 'ready' | 'countdown' | 'starting' | 'playing' | 'failed' | 'complete';

interface Props {
  reference: ReferenceClip;
  source: SourceSize;
  videoRef: RefObject<HTMLVideoElement | null>;
  phase: Phase;
}

const LIMBS = [[11, 13, 15], [12, 14, 16], [23, 25, 27], [24, 26, 28]];

export function PoseCueTrack({ reference, source, videoRef, phase }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastTime = useRef(0);
  const cues = useMemo(() => selectPoseCues(reference.recording, reference.durationMs, source),
    [reference.recording, reference.durationMs, source]);
  const geometry = useMemo(() => cueGeometry(cues, source), [cues, source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation = 0;

    function draw(timeMs: number) {
      if (!canvas || !context) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#241a35';
      context.fillRect(0, 0, width, height);
      if (!geometry.poses.length) return;

      const marker = width * .2;
      const cardWidth = Math.min(100, Math.max(58, width * .13));
      const cardHeight = Math.min(150, height - 30);
      const extentX = Math.max(1, geometry.maxX - geometry.minX);
      const extentY = Math.max(1, geometry.maxY - geometry.minY);
      const scale = Math.min((cardWidth - 28) / extentX, (cardHeight - 32) / extentY);
      const centerX = (geometry.minX + geometry.maxX) / 2;
      const centerY = (geometry.minY + geometry.maxY) / 2;
      const reduced = motion.matches;
      const due = geometry.poses.filter(pose => pose.t <= timeMs).at(-1);
      const next = geometry.poses.find(pose => pose.t > timeMs);
      const staticPoses = reduced ? (due ? [due, next] : geometry.poses.slice(0, 2)).filter(pose => pose !== undefined) : geometry.poses;

      for (const pose of staticPoses) {
        const position = cuePosition(pose.t, timeMs, width);
        const x = reduced ? (pose === staticPoses[0] ? marker : width * .72) : position.x;
        if (x < -cardWidth || x > width + cardWidth) continue;
        const highlighted = position.highlighted;
        context.fillStyle = highlighted ? '#b6ff00' : '#37294b';
        context.strokeStyle = highlighted ? '#e0ffab' : '#6e577f';
        context.lineWidth = 2;
        context.beginPath();
        context.roundRect(x - cardWidth / 2, 10, cardWidth, cardHeight, 12);
        context.fill();
        context.stroke();
        context.save();
        context.translate(x - centerX * scale, 10 + cardHeight / 2 - centerY * scale);
        context.scale(scale, scale);
        const point = (index: number) => pose.points[index];
        const lines = [...LIMBS, [11, 12], [11, 23], [12, 24], [23, 24]];
        for (const [color, strokeWidth] of [['#11101b', 11], ['#f5efff', 7]] as const) {
          context.strokeStyle = color;
          context.lineWidth = strokeWidth / scale;
          context.lineCap = 'round';
          context.lineJoin = 'round';
          for (const line of lines) {
            const visible = line.map(point).filter(p => p !== null);
            if (visible.length !== line.length) continue;
            context.beginPath();
            context.moveTo(visible[0].x, visible[0].y);
            for (const p of visible.slice(1)) context.lineTo(p.x, p.y);
            context.stroke();
          }
          context.beginPath();
          context.arc(pose.head.x, pose.head.y, pose.head.radius, 0, Math.PI * 2);
          context.stroke();
        }
        context.restore();
        context.fillStyle = highlighted ? '#16112b' : '#d9d0e5';
        context.font = '12px system-ui';
        context.textAlign = 'center';
        context.fillText(`${(pose.t / 1000).toFixed(1)}s`, x, cardHeight + 4);
      }
      context.fillStyle = '#b6ff00';
      context.fillRect(marker - 2, 8, 4, cardHeight + 4);
      context.font = 'bold 12px system-ui';
      context.textAlign = 'center';
      context.fillText('MATCH', marker, height - 5);
    }

    function tick() {
      if (phase === 'playing') lastTime.current = (videoRef.current?.currentTime ?? 0) * 1000;
      draw(lastTime.current);
      if (phase === 'playing') animation = requestAnimationFrame(tick);
    }

    if (phase === 'ready' || phase === 'countdown' || phase === 'starting') lastTime.current = 0;
    if (phase === 'complete') lastTime.current = reference.durationMs;
    const resize = new ResizeObserver(() => draw(lastTime.current));
    resize.observe(canvas);
    const redraw = () => draw(lastTime.current);
    motion.addEventListener('change', redraw);
    tick();
    return () => {
      cancelAnimationFrame(animation);
      resize.disconnect();
      motion.removeEventListener('change', redraw);
    };
  }, [geometry, phase, reference.durationMs, videoRef]);

  return <div className="pose-cue-track" aria-label="Upcoming reference poses">
    <span>Upcoming moves</span>
    <canvas ref={canvasRef} aria-hidden="true" />
    {source.width > 0 && source.height > 0 && cues.length === 0 && <span>No clear poses available for this clip.</span>}
  </div>;
}
