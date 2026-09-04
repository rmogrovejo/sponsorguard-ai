from __future__ import annotations

from app.domain.shortform import PreflightFinding, PreflightStatus
from app.domain.shortform_speech import ReviewPriority
from app.services.shortform_time import format_clip_timestamp

_PRIORITY_TITLES = {
    "opening": "Strengthen opening",
    "dead_air": "Review pacing gap",
    "cta": "Consider a closing CTA",
    "orientation": "Review orientation",
    "duration": "Review duration",
    "resolution": "Review resolution",
    "audio_track": "Add an audio track",
    "speech_activity": "Review speech activity",
}

_PRIORITY_ORDER = (
    "opening",
    "dead_air",
    "cta",
    "orientation",
    "duration",
    "resolution",
    "audio_track",
    "speech_activity",
)

_STATUS_RANK = {
    PreflightStatus.FAIL: 0,
    PreflightStatus.WARNING: 1,
}


def build_review_priorities(findings: tuple[PreflightFinding, ...]) -> tuple[ReviewPriority, ...]:
    """Rank review items from finding status. Gemini does not rank quality."""

    candidates = [
        finding
        for finding in findings
        if finding.status in _STATUS_RANK and finding.check_id in _PRIORITY_TITLES
    ]
    candidates.sort(
        key=lambda item: (
            _STATUS_RANK[item.status],
            _PRIORITY_ORDER.index(item.check_id)
            if item.check_id in _PRIORITY_ORDER
            else len(_PRIORITY_ORDER),
        )
    )
    priorities: list[ReviewPriority] = []
    for rank, finding in enumerate(candidates, start=1):
        timestamp = _priority_timestamp(finding)
        title = _PRIORITY_TITLES[finding.check_id]
        if finding.check_id == "dead_air" and timestamp is not None:
            title = f"Review pacing gap at {format_clip_timestamp(timestamp)}"
        priorities.append(
            ReviewPriority(
                rank=rank,
                title=title,
                check_id=finding.check_id,
                timestamp_seconds=timestamp,
            )
        )
    return tuple(priorities)


def _priority_timestamp(finding: PreflightFinding) -> float | None:
    if finding.ranges:
        return finding.ranges[0].start_seconds
    if finding.measurements is None:
        return None
    for key in (
        "hook_start_seconds",
        "cta_start_seconds",
        "activity_start_seconds",
        "duration_seconds",
    ):
        value = finding.measurements.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None
