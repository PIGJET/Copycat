"""Serve the song picker locally. Requires numpy, scipy and FFmpeg on PATH or in COPYCAT_FFMPEG."""
import numpy as np
from scipy.signal import correlate, find_peaks
import json
import os
import shutil
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import urlopen

DIST = Path(__file__).resolve().parent / "dist"
BUILD = DIST.parents[3] / "dist"
STATIC = BUILD if (BUILD / "index.html").is_file() else DIST
catalog = (DIST / "song-catalog.js").read_text().split(" = ", 1)[1].rstrip(";\n")
TRACKS = {row["id"]: row for row in json.loads(catalog)}
CACHE = Path(tempfile.gettempdir()) / "copycat-originals-mp4-v1"
CACHE.mkdir(exist_ok=True)
LOCK = threading.Lock()


def estimate_tempo(path):
    """Estimate pulse from spectral onsets across the actual preview."""
    raw = subprocess.check_output([os.environ.get("COPYCAT_FFMPEG", "ffmpeg"), "-v", "error", "-i",
        str(path), "-ac", "1", "-ar", "11025", "-f", "f32le", "pipe:1"], timeout=30)
    samples = np.frombuffer(raw, dtype="<f4")
    frames = np.lib.stride_tricks.sliding_window_view(samples, 512)[::110]
    power = np.log1p(np.abs(np.fft.rfft(frames * np.hanning(512))) * 10)
    onset = np.maximum(np.diff(power, axis=0), 0).mean(axis=1)
    onset -= onset.mean()
    corr = correlate(onset, onset, mode="full", method="fft")[len(onset)-1:]
    peaks, _ = find_peaks(corr[:100])
    peaks = [i for i in peaks if 32 <= i <= 91]
    if not peaks:
        raise ValueError("No stable beat")
    lag = max(peaks, key=lambda i: corr[i] + .3*corr[2*i])
    left, mid, right = corr[lag-1:lag+2]
    offset = .5*(left-right)/(left-2*mid+right) if left+right != 2*mid else 0
    return round(60*11025/(110*(lag+offset)), 1)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def send_head(self):
        path = urlsplit(self.path).path
        if not path.startswith("/songs/"):
            return super().send_head()
        song = TRACKS.get(path.removeprefix("/songs/").removesuffix(".mp4"))
        if not song:
            self.send_error(404)
            return None
        target = CACHE / (song["id"] + ".mp4")
        try:
            with LOCK:
                tempo_file = target.with_suffix(".bpm")
                if not target.exists() or not tempo_file.exists():
                    with tempfile.TemporaryDirectory(dir=CACHE) as folder:
                        src = Path(folder) / "source.mp3"
                        output = Path(folder) / "song.mp4"
                        with urlopen("https://api.deezer.com/track/" + song["id"], timeout=15) as metadata:
                            recording = json.load(metadata)
                        url = recording.get("preview")
                        if not url or urlsplit(url).scheme != "https":
                            raise ValueError("Preview unavailable")
                        with urlopen(url, timeout=30) as response, src.open("wb") as stream:
                            shutil.copyfileobj(response, stream)
                        subprocess.run([os.environ.get("COPYCAT_FFMPEG", "ffmpeg"), "-nostdin", "-v", "error",
                            "-i", str(src), "-map", "0:a:0", "-c:a", "aac", "-b:a", "128k",
                            "-movflags", "+faststart", str(output)], check=True, timeout=120)
                        bpm = float(recording.get("bpm") or 0)
                        if not 30 <= bpm <= 300:
                            bpm = estimate_tempo(output)
                        tempo_file.write_text(str(bpm))
                        output.replace(target)
            stream = target.open("rb")
        except (OSError, ValueError, subprocess.SubprocessError):
            self.send_error(502, "Could not prepare this song")
            return None
        self.send_response(200)
        self.send_header("X-Song-BPM", tempo_file.read_text())
        self.send_header("Content-Type", "audio/mp4")
        self.send_header("Content-Length", str(target.stat().st_size))
        self.end_headers()
        return stream


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("COPYCAT_PORT", "5173"))), Handler).serve_forever()
