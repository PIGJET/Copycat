// Records the shame video as it plays, for the finale's Download video. The page shows it with DOM
// elements (videos, the cut-out canvas, Liangray's banner), which a recorder can't capture, so the
// same picture is redrawn each frame onto a 1280×720 canvas: the reaction clip, the cut-out loser
// in the same spot, and the banner and ticker in his finale colours. The canvas stream plus the
// clip audio (and the sting) go into a MediaRecorder. Everything stays in memory on this device.
import { pickMimeType, placeCutout } from "./shamePlan";
import type { Box, LoserPlacement } from "./shamePlan";

export const RECORD_WIDTH = 1280;
export const RECORD_HEIGHT = 720;
const FPS = 30;

/** What's on screen right now, read by the recorder every frame. */
export interface RecordFrame {
  phase: "intro" | "cut" | "card";
  reaction: HTMLVideoElement | null;
  /** The cut-out canvas, when the loser is showing. */
  loser: HTMLCanvasElement | null;
  /** clips.json placement, or null for the default lower-right spot. */
  place: LoserPlacement | null;
  /** The dancer's (smoothed) outline in the cut-out canvas. */
  box: Box | null;
  playerName: string;
  headline: string;
  line: string;
}

export function canRecord(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function"
    && typeof AudioContext !== "undefined" && !!pickMimeType((t) => MediaRecorder.isTypeSupported(t));
}

const RED = "#be3043";
const TICKER_RED = "#e62543";
const PAPER = "#f4f2f6";
const INK = "#160f1e";
const font = (weight: string, px: number, italic = false) => `${italic ? "italic " : ""}${weight} ${Math.round(px)}px Barlow, Arial, sans-serif`;

/** Word-wrap `text` to `width`, at most `maxLines` lines (the last one gets an ellipsis if cut). */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= width || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}

/** The CCN | Breaking news bar. Returns its width. */
function newsTop(g: CanvasRenderingContext2D, x: number, y: number, h: number, brandPx: number, labelPx: number, upper = false) {
  const pad = h * 0.4;
  g.font = font("800", brandPx, true);
  const brandW = g.measureText("CCN").width;
  const label = upper ? "BREAKING NEWS" : "Breaking news";
  g.font = font(upper ? "800" : "600", labelPx);
  const labelW = g.measureText(label).width;
  const w = pad + brandW + pad + 1 + pad + labelW + pad;
  g.fillStyle = RED;
  g.fillRect(x, y, w, h);
  g.fillStyle = "#fff";
  g.textBaseline = "middle";
  g.font = font("800", brandPx, true);
  g.fillText("CCN", x + pad, y + h / 2);
  g.fillStyle = "#ffffff66";
  g.fillRect(x + pad + brandW + pad, y + h * 0.25, 1, h * 0.5);
  g.fillStyle = "#fff";
  g.font = font(upper ? "800" : "600", labelPx);
  g.fillText(label, x + pad + brandW + pad + 1 + pad, y + h / 2);
  return w;
}

function backdrop(g: CanvasRenderingContext2D, W: number, H: number) {
  const grad = g.createRadialGradient(W * 0.3, H * 0.3, 0, W * 0.3, H * 0.3, Math.hypot(W, H) * 0.75);
  grad.addColorStop(0, "#2a1236");
  grad.addColorStop(0.55, "#100b1d");
  grad.addColorStop(1, "#06040a");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

/** object-fit: cover */
function drawCover(g: CanvasRenderingContext2D, video: HTMLVideoElement, W: number, H: number) {
  const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
  const w = video.videoWidth * scale, h = video.videoHeight * scale;
  g.drawImage(video, (W - w) / 2, (H - h) / 2, w, h);
}

/** Lower third: news bar, headline box, ticker. */
function lowerThird(g: CanvasRenderingContext2D, W: number, H: number, k: number, f: RecordFrame, t: number) {
  const tickerH = 42 * k;
  const headPad = 20 * k;
  const boxW = Math.min(1100 * k, W);
  g.font = font("700", 30 * k);
  const lines = wrap(g, f.headline, boxW - 2 * headPad, 2);
  const boxH = headPad * 2 + 18 * k + lines.length * 34 * k;
  const barH = 44 * k;
  const boxY = H - tickerH - boxH;
  newsTop(g, 0, boxY - barH, barH, 28 * k, 17 * k);
  g.fillStyle = PAPER;
  g.fillRect(0, boxY, boxW, boxH);
  g.fillStyle = "#08050b";
  g.fillRect(boxW, boxY, 6 * k, boxH);
  g.textBaseline = "top";
  g.fillStyle = "#aa1830";
  g.font = font("800", 13 * k);
  g.fillText(f.playerName, headPad, boxY + headPad);
  g.fillStyle = INK;
  g.font = font("700", 30 * k);
  lines.forEach((line, i) => g.fillText(line, headPad, boxY + headPad + 18 * k + i * 34 * k));
  // Ticker: the roast line scrolling right to left.
  g.fillStyle = TICKER_RED;
  g.fillRect(0, H - tickerH, W, tickerH);
  g.fillStyle = "#fff";
  g.font = font("700", 15 * k);
  g.textBaseline = "middle";
  const item = `${f.line || "More on this developing story"}   ◆   `;
  const itemW = Math.max(1, g.measureText(item).width);
  let x = -((t * 90 * k) % itemW);
  for (; x < W; x += itemW) g.fillText(item, x, H - tickerH / 2);
}

export class ShameRecorder {
  readonly canvas = document.createElement("canvas");
  /** Connect audio sources here to record them. */
  readonly audioIn: MediaStreamAudioDestinationNode;
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private raf = 0;
  private started = 0;
  private stopped: Promise<Blob | null> | null = null;

  constructor(audio: AudioContext) {
    this.canvas.width = RECORD_WIDTH;
    this.canvas.height = RECORD_HEIGHT;
    this.audioIn = audio.createMediaStreamDestination();
    const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) throw new Error("no recordable video format");
    const stream = new MediaStream([...this.canvas.captureStream(FPS).getVideoTracks(), ...this.audioIn.stream.getAudioTracks()]);
    this.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
  }

  /** Start recording, redrawing from `frame()` every animation frame. */
  start(frame: () => RecordFrame) {
    const g = this.canvas.getContext("2d");
    if (!g) throw new Error("no 2D canvas");
    this.started = performance.now();
    const W = RECORD_WIDTH, H = RECORD_HEIGHT, k = H / 720;
    const draw = () => {
      try {
        this.drawFrame(g, frame(), W, H, k, (performance.now() - this.started) / 1000);
      } catch { /* one bad frame never stops the video */ }
      this.raf = requestAnimationFrame(draw);
    };
    draw();
    this.recorder.start(1000);
  }

  private drawFrame(g: CanvasRenderingContext2D, f: RecordFrame, W: number, H: number, k: number, t: number) {
    const reaction = f.phase === "cut" && f.reaction && f.reaction.readyState >= 2 && f.reaction.videoWidth ? f.reaction : null;
    if (reaction) drawCover(g, reaction, W, H);
    else backdrop(g, W, H);
    if (f.phase === "intro") {
      const barH = 150 * k;
      g.font = font("800", 90 * k, true);
      const guessW = g.measureText("CCN").width + 64 * k * 8.3;
      const x = Math.max(16 * k, (W - guessW) / 2);
      g.fillStyle = "#08050b";
      g.fillRect(x + 8 * k, (H - barH) / 2 + 8 * k, guessW, barH);
      newsTop(g, x, (H - barH) / 2, barH, 90 * k, 64 * k, true);
      return;
    }
    if (f.phase === "cut" && f.loser && f.loser.width && f.loser.height) {
      const aspect = f.loser.width / f.loser.height;
      let spot: { left: number; top: number; width: number; height: number };
      if (f.place && reaction) {
        spot = placeCutout(f.box ?? { x0: 0, y0: 0, x1: 1, y1: 1 }, aspect, f.place, { w: reaction.videoWidth, h: reaction.videoHeight }, W, H);
      } else {
        // ShameVideo.css's default spot: right 6vw, bottom calc(14vh + 54px), height 34vh, max-width 46vw.
        let height = 0.34 * H, width = height * aspect;
        if (width > 0.46 * W) { width = 0.46 * W; height = width / aspect; }
        spot = { left: W * 0.94 - width, top: H - 0.14 * H - 54 * k - height, width, height };
      }
      g.save();
      g.shadowColor = "#000a";
      g.shadowBlur = 14 * k;
      g.shadowOffsetY = 6 * k;
      g.drawImage(f.loser, spot.left, spot.top, spot.width, spot.height);
      g.restore();
    }
    lowerThird(g, W, H, k, f, t);
  }

  /** Stop and return the finished video (null if nothing was recorded). */
  stop(): Promise<Blob | null> {
    if (this.stopped) return this.stopped;
    cancelAnimationFrame(this.raf);
    this.stopped = new Promise((resolve) => {
      if (this.recorder.state === "inactive") return resolve(null);
      const timer = setTimeout(() => resolve(null), 2000);
      this.recorder.onstop = () => {
        clearTimeout(timer);
        const type = this.recorder.mimeType.split(";")[0] || "video/webm";
        resolve(this.chunks.length ? new Blob(this.chunks, { type }) : null);
      };
      try { this.recorder.stop(); } catch { clearTimeout(timer); resolve(null); }
    });
    return this.stopped;
  }
}
