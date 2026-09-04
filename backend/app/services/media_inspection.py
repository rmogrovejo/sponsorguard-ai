from __future__ import annotations

import math
import struct
from collections.abc import Iterator
from pathlib import Path

import av
from av.error import FFmpegError

from app.domain.media import MediaInspection, TimeRange
from app.domain.shortform import SilenceAnalysisConfig
from app.services.media_errors import MediaInspectionError, MediaInspectionErrorCode


SUPPORTED_VIDEO_SUFFIXES = {".mp4"}
MAX_DISPLAY_FILENAME_LENGTH = 255


def sanitize_display_filename(filename: str | None) -> str:
    """Keep only a display name. Never treat the value as a filesystem path."""

    raw = Path(filename or "upload.mp4").name.strip()
    if not raw or raw in {".", ".."} or len(raw) > MAX_DISPLAY_FILENAME_LENGTH:
        raise MediaInspectionError(
            "The uploaded filename is not usable.",
            code=MediaInspectionErrorCode.UNSAFE_FILENAME,
        )
    if "/" in raw or "\\" in raw:
        raise MediaInspectionError(
            "The uploaded filename is not usable.",
            code=MediaInspectionErrorCode.UNSAFE_FILENAME,
        )
    return raw


def inspect_video_file(
    path: Path,
    *,
    display_filename: str,
    size_bytes: int,
) -> MediaInspection:
    """Decode enough of the container to prove a video stream exists."""

    if size_bytes < 1:
        raise MediaInspectionError(
            "The uploaded file is empty.",
            code=MediaInspectionErrorCode.EMPTY_UPLOAD,
        )
    try:
        container = av.open(str(path), mode="r")
    except (FFmpegError, OSError, ValueError) as error:
        raise MediaInspectionError(
            "The uploaded file is not a readable video.",
            code=MediaInspectionErrorCode.UNSUPPORTED_MEDIA,
        ) from error

    try:
        video_stream = _first_video_stream(container)
        width, height = _stream_dimensions(video_stream)
        duration = _resolve_duration_seconds(container, video_stream)
        if duration <= 0 or not math.isfinite(duration):
            raise MediaInspectionError(
                "The video duration could not be determined.",
                code=MediaInspectionErrorCode.INVALID_DURATION,
            )
        _confirm_video_decodes(container, video_stream)
        has_audio = any(stream.type == "audio" for stream in container.streams)
        return MediaInspection(
            display_filename=display_filename,
            size_bytes=size_bytes,
            duration_seconds=duration,
            width=width,
            height=height,
            has_audio=has_audio,
        )
    finally:
        container.close()


def detect_low_energy_intervals(
    path: Path,
    *,
    config: SilenceAnalysisConfig,
) -> tuple[TimeRange, ...]:
    """Return grounded low-energy ranges from decoded audio samples."""

    try:
        container = av.open(str(path), mode="r")
    except (FFmpegError, OSError, ValueError) as error:
        raise MediaInspectionError(
            "The audio stream could not be decoded.",
            code=MediaInspectionErrorCode.CORRUPT_MEDIA,
        ) from error

    try:
        audio_stream = next(
            (stream for stream in container.streams if stream.type == "audio"),
            None,
        )
        if audio_stream is None:
            return ()
        samples = _decode_mono_samples(container, audio_stream, config.sample_rate)
        if not samples:
            raise MediaInspectionError(
                "The audio stream could not be decoded.",
                code=MediaInspectionErrorCode.CORRUPT_MEDIA,
            )
        return find_low_energy_ranges(samples, config)
    finally:
        container.close()


def _first_video_stream(container: av.container.InputContainer) -> av.video.stream.VideoStream:
    for stream in container.streams:
        if stream.type == "video":
            return stream
    raise MediaInspectionError(
        "The uploaded file does not contain a video stream.",
        code=MediaInspectionErrorCode.UNSUPPORTED_MEDIA,
    )


def _stream_dimensions(stream: av.video.stream.VideoStream) -> tuple[int, int]:
    width = int(stream.codec_context.width or 0)
    height = int(stream.codec_context.height or 0)
    if width < 1 or height < 1:
        raise MediaInspectionError(
            "The video dimensions could not be determined.",
            code=MediaInspectionErrorCode.UNSUPPORTED_MEDIA,
        )
    return width, height


def _resolve_duration_seconds(
    container: av.container.InputContainer,
    video_stream: av.video.stream.VideoStream,
) -> float:
    if container.duration is not None:
        return float(container.duration) / float(av.time_base)
    if video_stream.duration is not None and video_stream.time_base is not None:
        return float(video_stream.duration * video_stream.time_base)
    return 0.0


def _confirm_video_decodes(
    container: av.container.InputContainer,
    video_stream: av.video.stream.VideoStream,
) -> None:
    try:
        frame = next(container.decode(video_stream), None)
    except (FFmpegError, StopIteration, ValueError) as error:
        raise MediaInspectionError(
            "The video stream could not be decoded.",
            code=MediaInspectionErrorCode.CORRUPT_MEDIA,
        ) from error
    if frame is None:
        raise MediaInspectionError(
            "The video stream could not be decoded.",
            code=MediaInspectionErrorCode.CORRUPT_MEDIA,
        )


def _decode_mono_samples(
    container: av.container.InputContainer,
    audio_stream: av.audio.stream.AudioStream,
    sample_rate: int,
) -> list[float]:
    resampler = av.audio.resampler.AudioResampler(
        format="flt",
        layout="mono",
        rate=sample_rate,
    )
    samples: list[float] = []
    try:
        for frame in container.decode(audio_stream):
            resampled = resampler.resample(frame)
            for item in _as_frames(resampled):
                samples.extend(_float_plane(item))
        flushed = resampler.resample(None)
        for item in _as_frames(flushed):
            samples.extend(_float_plane(item))
    except (FFmpegError, ValueError) as error:
        raise MediaInspectionError(
            "The audio stream could not be decoded.",
            code=MediaInspectionErrorCode.CORRUPT_MEDIA,
        ) from error
    return samples


def _as_frames(value: object) -> Iterator[av.audio.frame.AudioFrame]:
    if value is None:
        return
    items = value if isinstance(value, list) else [value]
    for item in items:
        if item is not None:
            yield item  # type: ignore[misc]


def _float_plane(frame: av.audio.frame.AudioFrame) -> list[float]:
    plane = bytes(frame.planes[0])
    count = len(plane) // 4
    if count < 1:
        return []
    return list(struct.unpack(f"<{count}f", plane[: count * 4]))


def find_low_energy_ranges(
    samples: list[float],
    config: SilenceAnalysisConfig,
) -> tuple[TimeRange, ...]:
    window_size = max(1, int(config.sample_rate * config.window_seconds))
    hop = window_size
    low_windows: list[tuple[float, float]] = []
    for start in range(0, len(samples), hop):
        chunk = samples[start : start + window_size]
        if len(chunk) < max(1, window_size // 2):
            break
        rms = math.sqrt(sum(sample * sample for sample in chunk) / len(chunk))
        if rms < config.rms_threshold:
            start_seconds = start / config.sample_rate
            end_seconds = (start + len(chunk)) / config.sample_rate
            low_windows.append((start_seconds, end_seconds))

    merged: list[list[float]] = []
    for start_seconds, end_seconds in low_windows:
        if merged and start_seconds <= merged[-1][1] + 1e-6:
            merged[-1][1] = end_seconds
        else:
            merged.append([start_seconds, end_seconds])

    ranges = [
        TimeRange(start_seconds=start, end_seconds=end)
        for start, end in merged
        if (end - start) + 1e-9 >= config.min_silence_seconds
    ]
    return tuple(ranges)
