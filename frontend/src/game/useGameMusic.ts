import { useEffect, useRef } from "react";
import idleTrack from "./music/idle.mp4?url";

const gameplayTracks = import.meta.glob<string>("./music/gameplay/*.mp4", {
  eager: true,
  import: "default",
  query: "?url",
});

export function useGameMusic({ gameplay, recording, bpm, soundOn }: {
  gameplay: boolean;
  recording: boolean;
  bpm: number;
  soundOn: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackBpm = Math.max(60, Math.min(180, Math.round(bpm / 5) * 5));
  const source = gameplay ? gameplayTracks[`./music/gameplay/${trackBpm}.mp4`] : idleTrack;
  const playing = soundOn && (!gameplay || recording);

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
