from __future__ import annotations

import math
import struct
from pathlib import Path

import av


def write_test_mp4(
    path: Path,
    *,
    width: int,
    height: int,
    duration_seconds: float,
    fps: int = 10,
    with_audio: bool = True,
    silence_ranges: tuple[tuple[float, float], ...] = (),
    sample_rate: int = 16_000,
) -> Path:
    """Write a tiny synthetic MP4 for deterministic preflight tests."""

    path.parent.mkdir(parents=True, exist_ok=True)
    container = av.open(str(path), mode="w")
    video = container.add_stream("mpeg4", rate=fps)
    video.width = width
    video.height = height
    video.pix_fmt = "yuv420p"
    audio = None
    if with_audio:
        audio = container.add_stream("aac", rate=sample_rate)
        audio.layout = "mono"

    frame_count = max(1, int(round(duration_seconds * fps)))
    for index in range(frame_count):
        frame = av.VideoFrame(width, height, "yuv420p")
        frame.planes[0].update(bytes([80 + (index % 40)]) * frame.planes[0].buffer_size)
        frame.planes[1].update(bytes([110]) * frame.planes[1].buffer_size)
        frame.planes[2].update(bytes([130]) * frame.planes[2].buffer_size)
        frame.pts = index
        for packet in video.encode(frame):
            container.mux(packet)

    for packet in video.encode():
        container.mux(packet)

    if audio is not None:
        total_samples = max(sample_rate, int(round(duration_seconds * sample_rate)))
        chunk = 1024
        pts = 0
        for start in range(0, total_samples, chunk):
            count = min(chunk, total_samples - start)
            samples = []
            for offset in range(count):
                seconds = (start + offset) / sample_rate
                if _in_silence(seconds, silence_ranges):
                    samples.append(0.0)
                else:
                    samples.append(0.28 * math.sin(2 * math.pi * 440 * seconds))
            audio_frame = av.AudioFrame(format="flt", layout="mono", samples=count)
            audio_frame.sample_rate = sample_rate
            audio_frame.pts = pts
            audio_frame.planes[0].update(struct.pack(f"<{count}f", *samples))
            pts += count
            for packet in audio.encode(audio_frame):
                container.mux(packet)
        for packet in audio.encode(None):
            container.mux(packet)

    container.close()
    return path


def _in_silence(seconds: float, ranges: tuple[tuple[float, float], ...]) -> bool:
    return any(start <= seconds < end for start, end in ranges)
