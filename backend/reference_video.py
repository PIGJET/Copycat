"""Bounded, local YouTube-to-MP4 preparation. No pose inference or persistent cache."""
from __future__ import annotations

import asyncio
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import threading
from typing import Awaitable, Callable
from urllib.parse import parse_qs, urlsplit

IMPORT_LOCK = threading.Lock()
MAX_WORK_BYTES = 250 * 1024 * 1024
MAX_OUTPUT_BYTES = 100 * 1024 * 1024
MAX_STDOUT_BYTES = 1024 * 1024
IMPORT_TIMEOUT = 180.0
POLL_SECONDS = 0.1
Disconnected = Callable[[], Awaitable[bool]]


class ImportFailure(Exception):
    def __init__(self, status: int, detail: str, reason: str):
        super().__init__(detail)
        self.status, self.detail, self.reason = status, detail, reason


def canonical_url(url: str) -> str:
    """Accept video IDs only; never pass arbitrary hosts/options to yt-dlp."""
    try:
        parsed = urlsplit(url)
        if (parsed.scheme != 'https' or parsed.username or parsed.password
                or parsed.port is not None):
            raise ValueError
        query = parse_qs(parsed.query)
        if 'list' in query:
            raise ValueError
        if parsed.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com'):
            if parsed.path == '/watch':
                ids = query.get('v', [])
                video_id = ids[0] if len(ids) == 1 else ''
            elif parsed.path.startswith('/shorts/'):
                video_id = parsed.path.removeprefix('/shorts/')
            else:
                raise ValueError
        elif parsed.hostname == 'youtu.be':
            video_id = parsed.path.removeprefix('/')
        else:
            raise ValueError
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        raise ImportFailure(400, 'Enter a YouTube video link, without a playlist.', 'invalid_url') from None
    return f'https://www.youtube.com/watch?v={video_id}'


def validate_output(probe: dict, duration: float) -> None:
    try:
        info = probe['format']
        actual = float(info['duration'])
        start = float(info.get('start_time', 0))
        video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
        visual_duration = float(video['duration'])
        visual_start = float(video.get('start_time', 0))
        if (not math.isfinite(visual_duration) or abs(visual_duration - duration) > 0.25
                or not math.isfinite(visual_start) or abs(visual_start) > 0.25
                or not math.isfinite(actual) or abs(actual - duration) > 0.25
                or not math.isfinite(start) or abs(start) > 0.25
                or video['codec_name'] != 'h264' or video['pix_fmt'] != 'yuv420p'
                or not 0 < video['width'] <= 1280 or not 0 < video['height'] <= 720):
            raise ValueError
    except (KeyError, TypeError, ValueError, StopIteration):
        raise ImportFailure(502, 'The prepared video could not be played. Try another clip.', 'invalid_output') from None


def work_size(work_dir: Path) -> int:
    return sum(p.stat().st_size for p in work_dir.iterdir() if p.is_file())


async def run_process(args: list[str], work_dir: Path, deadline: float,
                      disconnected: Disconnected | None = None) -> bytes:
    """Supervise each native process, including its descendants and log output."""
    # File-backed logs avoid pipe deadlocks; they count against the disk budget.
    stdout_path, stderr_path = work_dir / '.stdout', work_dir / '.stderr'
    with stdout_path.open('wb') as stdout, stderr_path.open('wb') as stderr:
        try:
            process = await asyncio.create_subprocess_exec(
                *args, cwd=work_dir, stdout=stdout, stderr=stderr, start_new_session=True)
        except OSError:
            raise ImportFailure(503, 'Video preparation tools are unavailable.', 'missing_tool') from None
        try:
            while True:
                if asyncio.get_running_loop().time() >= deadline:
                    raise ImportFailure(504, 'Preparing the dance took too long. Try a shorter source or a local MP4.', 'timeout')
                if disconnected and await disconnected():
                    raise ImportFailure(499, 'Video preparation canceled.', 'disconnected')
                if work_size(work_dir) > MAX_WORK_BYTES:
                    raise ImportFailure(502, 'This video is too large. Try a shorter source or a local MP4.', 'size_limit')
                clip = work_dir / 'clip.mp4'
                if clip.exists() and clip.stat().st_size > MAX_OUTPUT_BYTES:
                    raise ImportFailure(502, 'The prepared video is too large.', 'output_size')
                if process.returncode is not None:
                    break
                await asyncio.sleep(POLL_SECONDS)
            if process.returncode:
                raise ImportFailure(502, 'Could not prepare this video. Try another link or a local MP4.', 'process_failed')
        finally:
            # Kill the whole session group even if the parent exited first.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            await process.wait()
    if stdout_path.stat().st_size > MAX_STDOUT_BYTES:
        raise ImportFailure(502, 'The video metadata was too large.', 'metadata_limit')
    return stdout_path.read_bytes()


def decode_metadata(raw: bytes) -> dict:
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError
        return data
    except (ValueError, UnicodeDecodeError):
        raise ImportFailure(502, 'Could not read video information.', 'invalid_metadata') from None


async def prepare_reference(url: str, start_seconds: float, duration_seconds: float | None,
                            work_dir: Path, disconnected: Disconnected | None = None) -> Path:
    url = canonical_url(url)
    if (not math.isfinite(start_seconds) or start_seconds < 0
            or (duration_seconds is None and start_seconds != 0)
            or (duration_seconds is not None and (not math.isfinite(duration_seconds) or not 5 <= duration_seconds <= 60))):
        raise ImportFailure(400, 'Choose a section between 5 and 60 seconds with a nonnegative start.', 'invalid_range')
    tools = {name: shutil.which(name) for name in ('yt-dlp', 'ffmpeg', 'ffprobe', 'node')}
    if not all(tools.values()):
        raise ImportFailure(503, 'Install yt-dlp, FFmpeg and Node, then restart the backend.', 'missing_tool')
    deadline = asyncio.get_running_loop().time() + IMPORT_TIMEOUT
    base = [tools['yt-dlp'], '--ignore-config', '--no-cache-dir', '--no-playlist', '--quiet', '--no-warnings',
            '--js-runtimes', f"node:{tools['node']}", '--socket-timeout', '15',
            '--retries', '1', '--fragment-retries', '1']
    metadata = decode_metadata(await run_process(
        [*base, '--dump-single-json', '--skip-download', '--', url], work_dir, deadline, disconnected))
    try:
        source_duration = float(metadata['duration'])
        if (metadata.get('is_live') or metadata.get('was_live') or metadata.get('_type') == 'playlist'
                or not math.isfinite(source_duration) or source_duration <= 0):
            raise ValueError
    except (KeyError, ValueError, TypeError):
        raise ImportFailure(400, 'Choose a section within a prerecorded video, between 5 and 60 seconds.', 'invalid_source') from None
    if duration_seconds is None:
        if not 5 <= source_duration <= 60:
            raise ImportFailure(400, 'Choose a video between 5 and 60 seconds long.', 'invalid_range')
        duration_seconds = source_duration
    elif source_duration < start_seconds + duration_seconds:
        raise ImportFailure(400, 'Choose a section within a prerecorded video, between 5 and 60 seconds.', 'invalid_source')
    await run_process([*base, '--max-filesize', str(MAX_WORK_BYTES),
        '--ffmpeg-location', str(Path(tools['ffmpeg']).parent),
        '-f', 'bv*[height<=720]+ba/b[height<=720]',
        '-o', str(work_dir / 'source.%(ext)s'), '--', url], work_dir, deadline, disconnected)
    sources = [p for p in work_dir.glob('source.*') if p.suffix not in ('.part', '.ytdl')]
    if len(sources) != 1:
        raise ImportFailure(502, 'Could not retrieve the video. Try another link or a local MP4.', 'download_failed')
    output = work_dir / 'clip.mp4'
    await run_process([tools['ffmpeg'], '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', str(start_seconds), '-i', str(sources[0]), '-t', str(duration_seconds),
        '-map', '0:v:0', '-map', '0:a:0?', '-vf',
        'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2:reset_sar=1',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-map_metadata', '-1',
        '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', str(output)],
        work_dir, deadline, disconnected)
    if not output.exists() or not 0 < output.stat().st_size <= MAX_OUTPUT_BYTES:
        raise ImportFailure(502, 'The prepared video is too large or empty.', 'output_size')
    probe = decode_metadata(await run_process([tools['ffprobe'], '-v', 'error', '-show_format',
        '-show_streams', '-of', 'json', str(output)], work_dir, deadline, disconnected))
    validate_output(probe, duration_seconds)
    return output
