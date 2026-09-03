import re
from collections.abc import Sequence

from app.domain.text import normalize_for_matching
from app.domain.transcript import TranscriptSegment
from app.domain.urls import extract_normalized_urls, normalize_campaign_url


def contains_bounded_match(text: str, target: str) -> bool:
    """Return whether normalized text contains the complete literal target."""

    matcher = _compile_bounded_matcher(target)
    return matcher.search(normalize_for_matching(text)) is not None


def _compile_bounded_matcher(target: str) -> re.Pattern[str]:
    """Compile a literal matcher bounded by Unicode word characters."""

    normalized_target = normalize_for_matching(target)
    if not normalized_target:
        raise ValueError("match target cannot be empty")

    return re.compile(rf"(?<!\w){re.escape(normalized_target)}(?!\w)")


def find_earliest_match(
    transcript_segments: Sequence[TranscriptSegment],
    target: str,
) -> TranscriptSegment | None:
    """Return the first matching segment in the supplied transcript order."""

    matcher = _compile_bounded_matcher(target)
    for segment in transcript_segments:
        if matcher.search(normalize_for_matching(segment.text)) is not None:
            return segment
    return None


def find_earliest_url_match(
    transcript_segments: Sequence[TranscriptSegment],
    target: str,
) -> TranscriptSegment | None:
    """Return the first segment containing the same normalized URL identity."""

    normalized_target = normalize_campaign_url(target)
    for segment in transcript_segments:
        if normalized_target in extract_normalized_urls(segment.text):
            return segment
    return None
