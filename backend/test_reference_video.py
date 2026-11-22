"""Import tests never contact YouTube; native process tests use local scripts."""
import asyncio
import json
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

import reference_video as rv
from main import app

URL = 'https://www.youtube.com/watch?v=BaW_jenozKc'
BODY = {'url': URL, 'start_seconds': 0, 'duration_seconds': 10}


@pytest.mark.parametrize('url', [URL, 'https://youtu.be/BaW_jenozKc?t=3',
    'https://m.youtube.com/shorts/BaW_jenozKc'])
def test_canonical_url(url):
    assert rv.canonical_url(url) == URL


@pytest.mark.parametrize('url', ['http://localhost/video', 'file:///tmp/video',
    'https://youtube.com.evil.test/watch?v=BaW_jenozKc',
    'https://user:pass@youtube.com/watch?v=BaW_jenozKc',
    'https://youtube.com/playlist?list=123', URL + '&list=123',
    'https://youtube.com:8443/watch?v=BaW_jenozKc',
    'https://youtu.be/not-valid', 'https://youtube.com/live/BaW_jenozKc'])
def test_rejects_unsupported_urls(url):
    with pytest.raises(rv.ImportFailure) as exc:
        rv.canonical_url(url)
    assert exc.value.status == 400


@pytest.mark.parametrize('changes', [{'duration_seconds': 0}, {'duration_seconds': 61},
    {'duration_seconds': 4}, {'start_seconds': -1}, {'start_seconds': 'NaN'},
    {'duration_seconds': 'Infinity'}, {'url': 'https://localhost/v'}, {'url': None}])
def test_bad_request_is_actionable(changes):
    with TestClient(app) as client:
        response = client.post('/reference-video', json={**BODY, **changes})
    assert response.status_code == 400
    assert isinstance(response.json()['detail'], str)
    assert response.json()['reason']


def test_import_returns_mp4_and_cleans_directory(monkeypatch):
    directories = []
    async def fake(url, start_seconds, duration_seconds, work_dir, disconnected):
        directories.append(work_dir)
        output = work_dir / 'clip.mp4'
        output.write_bytes(b'fake mp4 bytes')
        return output
    monkeypatch.setattr(rv, 'prepare_reference', fake)
    with TestClient(app) as client:
        response = client.post('/reference-video', json=BODY)
    assert response.status_code == 200
    assert response.headers['content-type'] == 'video/mp4'
    assert response.content == b'fake mp4 bytes'
    assert not directories[0].exists()


def test_import_failure_cleanup(monkeypatch):
    directories = []
    async def fake(url, start_seconds, duration_seconds, work_dir, disconnected):
        directories.append(work_dir)
        (work_dir / 'partial').write_bytes(b'partial')
        raise rv.ImportFailure(504, 'Preparation timed out.', 'timeout')
    monkeypatch.setattr(rv, 'prepare_reference', fake)
    with TestClient(app) as client:
        response = client.post('/reference-video', json=BODY)
    assert response.status_code == 504
    assert not directories[0].exists()
    # A failed import does not leave the importer busy.
    with TestClient(app) as client:
        assert client.post('/reference-video', json=BODY).status_code == 504


def test_busy_import_is_rejected():
    assert rv.IMPORT_LOCK.acquire(blocking=False)
    try:
        with TestClient(app) as client:
            assert client.post('/reference-video', json=BODY).status_code == 503
    finally:
        rv.IMPORT_LOCK.release()


def test_missing_tools(monkeypatch, tmp_path):
    monkeypatch.setattr(rv.shutil, 'which', lambda _: None)
    with pytest.raises(rv.ImportFailure) as exc:
        asyncio.run(rv.prepare_reference(URL, 0, 10, tmp_path))
    assert exc.value.status == 503


def test_pipeline_uses_fixed_commands_and_correct_trim(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(rv.shutil, 'which', lambda name: '/tools/' + name)
    async def fake(args, work_dir, deadline, disconnected=None):
        calls.append(args)
        if '--dump-single-json' in args:
            return json.dumps({'duration': 100, 'is_live': False, 'id': 'BaW_jenozKc'}).encode()
        if args[0].endswith('yt-dlp'):
            (tmp_path / 'source.webm').write_bytes(b'source')
        if args[0].endswith('ffmpeg'):
            (tmp_path / 'clip.mp4').write_bytes(b'clip')
        if args[0].endswith('ffprobe'):
            return json.dumps({'format': {'duration': '30', 'start_time': '0'},
                'streams': [{'codec_type': 'video', 'codec_name': 'h264',
                             'pix_fmt': 'yuv420p', 'width': 640, 'height': 480, 'duration': '30', 'start_time': '0'}]}).encode()
        return b''
    monkeypatch.setattr(rv, 'run_process', fake)
    assert asyncio.run(rv.prepare_reference(URL, 20, 30, tmp_path)) == tmp_path / 'clip.mp4'
    transcode = next(c for c in calls if c[0].endswith('ffmpeg'))
    assert transcode[transcode.index('-ss') + 1] == '20'
    assert transcode[transcode.index('-t') + 1] == '30'
    assert transcode[transcode.index('-c:v') + 1] == 'libx264'
    assert '+faststart' in transcode
    assert URL in calls[0] and '--ignore-config' in calls[0]


@pytest.mark.parametrize('metadata', [{'duration': 8}, {'duration': 100, 'is_live': True},
    {'duration': None}, {'duration': 100, '_type': 'playlist'}])
def test_invalid_source_metadata(monkeypatch, tmp_path, metadata):
    monkeypatch.setattr(rv.shutil, 'which', lambda name: '/tools/' + name)
    async def fake(*args, **kwargs):
        return json.dumps(metadata).encode()
    monkeypatch.setattr(rv, 'run_process', fake)
    with pytest.raises(rv.ImportFailure) as exc:
        asyncio.run(rv.prepare_reference(URL, 0, 10, tmp_path))
    assert exc.value.status == 400


@pytest.mark.parametrize('probe', [
    {'format': {'duration': '2'}, 'streams': []},
    {'format': {'duration': '10', 'start_time': '3'}, 'streams': [
        {'codec_type': 'video', 'codec_name': 'h264', 'pix_fmt': 'yuv420p', 'width': 640, 'height': 480}]},
    {'format': {'duration': '10'}, 'streams': [
        {'codec_type': 'video', 'codec_name': 'vp9', 'width': 640, 'height': 480}]},
])
def test_invalid_output_rejected(probe):
    with pytest.raises(rv.ImportFailure):
        rv.validate_output(probe, 10)


def test_process_success_and_error(tmp_path):
    async def scenario():
        deadline = asyncio.get_running_loop().time() + 5
        assert await rv.run_process([sys.executable, '-c', 'print("ok")'], tmp_path, deadline) == b'ok\n'
        with pytest.raises(rv.ImportFailure) as exc:
            await rv.run_process([sys.executable, '-c', 'raise SystemExit(1)'], tmp_path, deadline)
        assert exc.value.status == 502
    asyncio.run(scenario())


def test_process_timeout_and_disconnect(tmp_path):
    async def scenario():
        with pytest.raises(rv.ImportFailure) as exc:
            await rv.run_process([sys.executable, '-c', 'import time; time.sleep(5)'],
                tmp_path, asyncio.get_running_loop().time() + 0.1)
        assert exc.value.status == 504
        async def disconnected():
            return True
        with pytest.raises(rv.ImportFailure) as exc:
            await rv.run_process([sys.executable, '-c', 'import time; time.sleep(5)'],
                tmp_path, asyncio.get_running_loop().time() + 5, disconnected)
        assert exc.value.reason == 'disconnected'
    asyncio.run(scenario())


def test_process_disk_budget(monkeypatch, tmp_path):
    monkeypatch.setattr(rv, 'MAX_WORK_BYTES', 10)
    async def scenario():
        with pytest.raises(rv.ImportFailure) as exc:
            await rv.run_process([sys.executable, '-c',
                'from pathlib import Path; import time; Path("large").write_bytes(b"x"*100); time.sleep(5)'],
                tmp_path, asyncio.get_running_loop().time() + 5)
        assert exc.value.reason == 'size_limit'
    asyncio.run(scenario())


def test_cancellation_releases_import_lock(monkeypatch):
    directories = []
    async def fake(url, start_seconds, duration_seconds, work_dir, disconnected):
        directories.append(work_dir)
        raise asyncio.CancelledError
    monkeypatch.setattr(rv, 'prepare_reference', fake)
    async def scenario():
        from main import ReferenceVideoRequest, reference_video_import
        class Request:
            async def is_disconnected(self):
                return False
        with pytest.raises(asyncio.CancelledError):
            await reference_video_import(ReferenceVideoRequest(**BODY), Request())
    asyncio.run(scenario())
    assert not rv.IMPORT_LOCK.locked()
    assert not directories[0].exists()


def test_unexpected_filesystem_failure_is_actionable(monkeypatch):
    async def fake(*args, **kwargs):
        raise OSError('disk unavailable')
    monkeypatch.setattr(rv, 'prepare_reference', fake)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post('/reference-video', json=BODY)
    assert response.status_code == 502
    assert response.json()['reason'] == 'storage_error'
    assert not rv.IMPORT_LOCK.locked()


def test_pipeline_disables_disk_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(rv.shutil, 'which', lambda name: '/tools/' + name)
    async def fake(args, *a, **kw):
        assert '--no-cache-dir' in args
        raise rv.ImportFailure(502, 'expected stop', 'test_stop')
    monkeypatch.setattr(rv, 'run_process', fake)
    with pytest.raises(rv.ImportFailure, match='expected stop'):
        asyncio.run(rv.prepare_reference(URL, 0, 10, tmp_path))


@pytest.mark.skipif(not rv.shutil.which('ffmpeg') or not rv.shutil.which('ffprobe'),
                    reason='native FFmpeg tools not installed')
def test_native_mp4_normalization(monkeypatch, tmp_path):
    """Real decode/transcode/probe, with only YouTube retrieval replaced."""
    import subprocess
    real_run = rv.run_process
    real_which = rv.shutil.which
    monkeypatch.setattr(rv.shutil, 'which', lambda name:
        '/fake/yt-dlp' if name == 'yt-dlp' else (real_which(name) or '/fake/node'))
    async def source(args, work_dir, deadline, disconnected=None):
        if args[0] == '/fake/yt-dlp':
            if '--dump-single-json' in args:
                return b'{"duration": 6, "is_live": false}'
            subprocess.run([real_which('ffmpeg'), '-nostdin', '-v', 'error',
                '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15', '-t', '6',
                '-c:v', 'libx264', str(tmp_path / 'source.mp4')], check=True)
            return b''
        return await real_run(args, work_dir, deadline, disconnected)
    monkeypatch.setattr(rv, 'run_process', source)
    output = asyncio.run(rv.prepare_reference(URL, 1, 5, tmp_path))
    assert output.stat().st_size > 0


def test_video_stream_must_cover_entire_section():
    probe = {'format': {'duration': '6', 'start_time': '0'}, 'streams': [
        {'codec_type': 'video', 'codec_name': 'h264', 'pix_fmt': 'yuv420p',
         'width': 640, 'height': 480, 'start_time': '0', 'duration': '3'},
        {'codec_type': 'audio', 'duration': '6'}]}
    with pytest.raises(rv.ImportFailure):
        rv.validate_output(probe, 6)


def test_file_response_io_runs_off_event_loop(monkeypatch):
    import threading
    loop_thread = None
    read_threads = []
    cleanup_threads = []
    real_read = Path.read_bytes
    real_cleanup = __import__('tempfile').TemporaryDirectory.cleanup
    async def fake(url, start_seconds, duration_seconds, work_dir, disconnected):
        nonlocal loop_thread
        loop_thread = threading.get_ident()
        output = work_dir / 'clip.mp4'
        output.write_bytes(b'clip')
        return output
    def read(path):
        read_threads.append(threading.get_ident())
        return real_read(path)
    def cleanup(directory):
        cleanup_threads.append(threading.get_ident())
        return real_cleanup(directory)
    monkeypatch.setattr(rv, 'prepare_reference', fake)
    monkeypatch.setattr(Path, 'read_bytes', read)
    monkeypatch.setattr(__import__('tempfile').TemporaryDirectory, 'cleanup', cleanup)
    with TestClient(app) as client:
        assert client.post('/reference-video', json=BODY).status_code == 200
    assert read_threads and all(t != loop_thread for t in read_threads)
    assert cleanup_threads and all(t != loop_thread for t in cleanup_threads)


@pytest.mark.skipif(not rv.shutil.which('ffmpeg') or not rv.shutil.which('ffprobe'),
                    reason='native FFmpeg tools not installed')
def test_anamorphic_display_aspect_ratio_preserved(monkeypatch, tmp_path):
    import subprocess
    real_run, real_which = rv.run_process, rv.shutil.which
    monkeypatch.setattr(rv.shutil, 'which', lambda name:
        '/fake/yt-dlp' if name == 'yt-dlp' else (real_which(name) or '/fake/node'))
    async def source(args, work_dir, deadline, disconnected=None):
        if args[0] == '/fake/yt-dlp':
            if '--dump-single-json' in args:
                return b'{"duration": 6}'
            subprocess.run([real_which('ffmpeg'), '-nostdin', '-v', 'error', '-f', 'lavfi',
                '-i', 'testsrc2=size=320x240:rate=15', '-vf', 'setsar=2', '-t', '6',
                '-c:v', 'libx264', str(tmp_path/'source.mp4')], check=True)
            return b''
        return await real_run(args, work_dir, deadline, disconnected)
    monkeypatch.setattr(rv, 'run_process', source)
    output = asyncio.run(rv.prepare_reference(URL, 0, 5, tmp_path))
    probe = json.loads(subprocess.check_output([real_which('ffprobe'), '-v', 'error',
        '-show_streams', '-of', 'json', str(output)]))['streams'][0]
    assert probe['width'] / probe['height'] == pytest.approx(8 / 3, abs=.01)
    assert probe['sample_aspect_ratio'] == '1:1'


def test_output_budget_enforced_during_encoding(monkeypatch, tmp_path):
    monkeypatch.setattr(rv, 'MAX_OUTPUT_BYTES', 10)
    async def scenario():
        with pytest.raises(rv.ImportFailure) as exc:
            await rv.run_process([sys.executable, '-c',
                'from pathlib import Path; import time; Path("clip.mp4").write_bytes(b"x"*100); time.sleep(.5)'],
                tmp_path, asyncio.get_running_loop().time() + 5)
        assert exc.value.reason == 'output_size'
    asyncio.run(scenario())


@pytest.mark.skipif(not rv.shutil.which('ffmpeg') or not rv.shutil.which('ffprobe'),
                    reason='native FFmpeg tools not installed')
def test_audio_overhang_cannot_hide_short_video(monkeypatch, tmp_path):
    import subprocess
    real_run, real_which = rv.run_process, rv.shutil.which
    monkeypatch.setattr(rv.shutil, 'which', lambda name:
        '/fake/yt-dlp' if name == 'yt-dlp' else (real_which(name) or '/fake/node'))
    async def source(args, work_dir, deadline, disconnected=None):
        if args[0] == '/fake/yt-dlp':
            if '--dump-single-json' in args:
                return b'{"duration": 8}'
            subprocess.run([real_which('ffmpeg'), '-nostdin', '-v', 'error',
                '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=3',
                '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
                '-c:v', 'libx264', '-c:a', 'aac', str(tmp_path/'source.mp4')], check=True)
            return b''
        return await real_run(args, work_dir, deadline, disconnected)
    monkeypatch.setattr(rv, 'run_process', source)
    with pytest.raises(rv.ImportFailure) as exc:
        asyncio.run(rv.prepare_reference(URL, 0, 6, tmp_path))
    assert exc.value.reason == 'invalid_output'


def test_whole_video_request_passes_unspecified_duration_to_importer(monkeypatch):
    received = []
    async def fake(url, start_seconds, duration_seconds, work_dir, disconnected):
        received.append((start_seconds, duration_seconds))
        output = work_dir / 'clip.mp4'
        output.write_bytes(b'clip')
        return output
    monkeypatch.setattr(rv, 'prepare_reference', fake)
    with TestClient(app) as client:
        response = client.post('/reference-video', json={'url': URL, 'duration_seconds': None})
    assert response.status_code == 200
    assert received == [(0, None)]


@pytest.mark.parametrize('duration', [4.9, 60.1])
def test_whole_video_outside_supported_duration_is_rejected_before_download(monkeypatch, tmp_path, duration):
    monkeypatch.setattr(rv.shutil, 'which', lambda name: '/tools/' + name)
    calls = []
    async def fake(args, *a, **kw):
        calls.append(args)
        return json.dumps({'duration': duration}).encode()
    monkeypatch.setattr(rv, 'run_process', fake)
    with pytest.raises(rv.ImportFailure) as exc:
        asyncio.run(rv.prepare_reference(URL, 0, None, tmp_path))
    assert exc.value.status == 400
    assert len(calls) == 1


def test_whole_video_uses_metadata_duration(monkeypatch, tmp_path):
    monkeypatch.setattr(rv.shutil, 'which', lambda name: '/tools/' + name)
    calls = []
    async def fake(args, *a, **kw):
        calls.append(args)
        if '--dump-single-json' in args:
            return b'{"duration": 12.5}'
        if args[0].endswith('yt-dlp'):
            (tmp_path / 'source.webm').write_bytes(b'source')
        elif args[0].endswith('ffmpeg'):
            (tmp_path / 'clip.mp4').write_bytes(b'clip')
        else:
            return json.dumps({'format': {'duration': '12.5', 'start_time': '0'}, 'streams': [{'codec_type': 'video', 'codec_name': 'h264', 'pix_fmt': 'yuv420p', 'width': 640, 'height': 480, 'duration': '12.5', 'start_time': '0'}]}).encode()
        return b''
    monkeypatch.setattr(rv, 'run_process', fake)
    asyncio.run(rv.prepare_reference(URL, 0, None, tmp_path))
    transcode = next(c for c in calls if c[0].endswith('ffmpeg'))
    assert transcode[transcode.index('-ss') + 1] == '0'
    assert transcode[transcode.index('-t') + 1] == '12.5'
