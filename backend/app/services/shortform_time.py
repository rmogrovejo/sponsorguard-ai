from __future__ import annotations

import math


def format_clip_timestamp(seconds: float) -> str:
    if not math.isfinite(seconds) or seconds < 0:
        return "--:--"
    total_hundredths = int(round(seconds * 100))
    whole_seconds = total_hundredths // 100
    hundredths = total_hundredths % 100
    minutes, remaining = divmod(whole_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{remaining:02d}.{hundredths:02d}"
    return f"{minutes:02d}:{remaining:02d}.{hundredths:02d}"
