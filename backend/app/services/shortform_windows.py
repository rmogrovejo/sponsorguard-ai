from __future__ import annotations

from app.domain.media import TimeRange

# Opening uses the first 5–8 seconds. Clips shorter than 8s use the full duration.
HOOK_WINDOW_MIN_SECONDS = 5.0
HOOK_WINDOW_MAX_SECONDS = 8.0

# CTA uses the last 20% of the clip, floored at 3s when duration allows, capped at 12s.
CTA_ENDING_FRACTION = 0.20
CTA_MIN_SECONDS = 3.0
CTA_MAX_SECONDS = 12.0

TIMESTAMP_TOLERANCE_SECONDS = 0.15


def opening_window(duration_seconds: float) -> TimeRange:
    """Return the bounded opening region used for hook analysis."""

    if duration_seconds <= 0:
        raise ValueError("duration_seconds must be positive")
    length = min(HOOK_WINDOW_MAX_SECONDS, duration_seconds)
    return TimeRange(start_seconds=0.0, end_seconds=length)


def ending_window(duration_seconds: float) -> TimeRange:
    """Return the bounded ending region used for CTA analysis.

    Rule: last 20% of duration, at least 3 seconds when the clip is long enough,
    and never more than 12 seconds.
    """

    if duration_seconds <= 0:
        raise ValueError("duration_seconds must be positive")
    length = min(
        CTA_MAX_SECONDS,
        max(CTA_MIN_SECONDS, duration_seconds * CTA_ENDING_FRACTION),
        duration_seconds,
    )
    start = max(0.0, duration_seconds - length)
    if start >= duration_seconds:
        start = 0.0
    return TimeRange(start_seconds=start, end_seconds=duration_seconds)


def windows_overlap(left: TimeRange, right: TimeRange) -> bool:
    return left.start_seconds < right.end_seconds and right.start_seconds < left.end_seconds


def ending_contained_in_opening(opening: TimeRange, ending: TimeRange) -> bool:
    return (
        ending.start_seconds >= opening.start_seconds - 1e-9
        and ending.end_seconds <= opening.end_seconds + 1e-9
    )
