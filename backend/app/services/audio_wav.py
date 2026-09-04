from __future__ import annotations

import struct
import wave
from io import BytesIO


def encode_pcm16_wav(samples: list[float], sample_rate: int) -> bytes:
    """Encode mono float samples as a bounded 16-bit PCM WAV."""

    if sample_rate < 1:
        raise ValueError("sample_rate must be positive")
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = bytearray()
        for sample in samples:
            clamped = max(-1.0, min(1.0, sample))
            frames.extend(struct.pack("<h", int(round(clamped * 32767))))
        wav.writeframes(bytes(frames))
    return buffer.getvalue()


def slice_samples(
    samples: list[float],
    sample_rate: int,
    start_seconds: float,
    end_seconds: float,
) -> list[float]:
    if sample_rate < 1:
        raise ValueError("sample_rate must be positive")
    start_index = max(0, int(start_seconds * sample_rate))
    end_index = min(len(samples), int(end_seconds * sample_rate))
    if end_index <= start_index:
        return []
    return samples[start_index:end_index]
