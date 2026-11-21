// Background music (John Tam's, from PR #9). CC0 chiptune loops from hyperpixel, see
// music/gameplay/LICENSE.txt. One <audio> element; it never touches the camera recording,
// which captures video only.
import { useEffect, useRef } from "react";
import idleTrack from "./music/idle.mp4?url";

const gameplayTracks = import.meta.glob<string>("./music/gameplay/*.mp4", {
  eager: true,
  import: "default",
  query: "?url",
});

/**
 * - "off": silent (home screen, finale scene, which has its own audio)
 * - "idle": the lobby/results loop
 * - "gameplay": the loop nearest the chosen BPM, playing only while `recording`
 *   (silent during the 3-2-1 countdown), sped up/down to match the BPM exactly
 */
export type MusicMode = "off" | "idle" | "gameplay";

/** The gameplay loop for a BPM: tracks exist every 5 BPM from 60 to 180. */
export function gameplayTrackBpm(bpm: number): number {
  return Math.max(60, Math.min(180, Math.round(bpm / 5) * 5));
}

export function useGameMusic({ mode, recording, bpm, soundOn }: {
  mode: MusicMode;
  recording: boolean;
  bpm: number;
  soundOn: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gameplay = mode === "gameplay";
  const trackBpm = gameplayTrackBpm(bpm);
  const source = gameplay ? gameplayTracks[`./music/gameplay/${trackBpm}.mp4`] : idleTrack;
  const playing = soundOn && mode !== "off" && (!gameplay || recording);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source) return;

    if (audio.getAttribute("src") !== source) audio.src = source;
    audio.volume = gameplay ? 0.32 : 0.18;
    audio.playbackRate = gameplay ? bpm / trackBpm : 1;
    if (gameplay && !recording) {
      // Every take starts the loop from its first beat.
      audio.pause();
      audio.currentTime = 0;
    }

    function sync() {
      if (!audio) return;
      if (!playing || document.hidden) {
        audio.pause();
      } else if (audio.paused) {
        // Browsers can require a gesture before allowing playback.
        void audio.play().catch(() => {});
      }
    }

    sync();
    document.addEventListener("visibilitychange", sync);
    document.addEventListener("click", sync);
    document.addEventListener("keydown", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      document.removeEventListener("click", sync);
      document.removeEventListener("keydown", sync);
    };
  }, [bpm, gameplay, playing, recording, source, trackBpm]);
}
