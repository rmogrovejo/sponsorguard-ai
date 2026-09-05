from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

from app.domain.audience_pulse import (
    MAX_AUDIENCE_COMMENTS,
    MAX_COMMENT_CHARACTERS,
    AudienceComment,
    YouTubeVideoSnapshot,
)
from app.domain.text import normalize_unicode_whitespace
from app.services.audience_pulse_errors import (
    AudiencePulseInputError,
    AudiencePulseInputErrorCode,
    YouTubeClientError,
    YouTubeErrorCode,
)


_YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
}
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def parse_youtube_video_id(url: str) -> str:
    raw = normalize_unicode_whitespace(url)
    if not raw:
        raise YouTubeClientError(
            YouTubeErrorCode.INVALID_URL,
            "A YouTube URL is required.",
        )
    parsed = urlsplit(raw)
    host = (parsed.hostname or "").lower()
    if host not in _YOUTUBE_HOSTS:
        raise YouTubeClientError(
            YouTubeErrorCode.INVALID_URL,
            "Only YouTube and YouTube Shorts URLs are supported.",
        )

    video_id: str | None = None
    if host.endswith("youtu.be"):
        video_id = parsed.path.strip("/").split("/", 1)[0] or None
    else:
        path = parsed.path.strip("/")
        if path.startswith("shorts/"):
            video_id = path.split("/", 2)[1] if "/" in path else None
        elif path.startswith("embed/") or path.startswith("live/"):
            video_id = path.split("/", 2)[1] if "/" in path else None
        elif path in {"watch", "watch/"}:
            video_id = parse_qs(parsed.query).get("v", [None])[0]
        else:
            query_v = parse_qs(parsed.query).get("v", [None])[0]
            video_id = query_v

    if video_id is None or not _VIDEO_ID_RE.fullmatch(video_id):
        raise YouTubeClientError(
            YouTubeErrorCode.INVALID_URL,
            "The YouTube URL does not contain a valid video id.",
        )
    return video_id


def normalize_manual_comments(comments_text: str) -> tuple[AudienceComment, ...]:
    raw = comments_text if isinstance(comments_text, str) else ""
    if not raw.strip():
        raise AudiencePulseInputError(
            AudiencePulseInputErrorCode.NO_COMMENTS,
            "Paste at least one comment to analyze.",
        )

    seen: set[str] = set()
    comments: list[AudienceComment] = []
    for line in raw.splitlines():
        text = normalize_unicode_whitespace(line)
        if not text:
            continue
        if len(text) > MAX_COMMENT_CHARACTERS:
            text = text[:MAX_COMMENT_CHARACTERS].rstrip()
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        comments.append(
            AudienceComment(id=f"c{len(comments) + 1}", text=text, author=None)
        )
        if len(comments) >= MAX_AUDIENCE_COMMENTS:
            break

    if not comments:
        raise AudiencePulseInputError(
            AudiencePulseInputErrorCode.NO_COMMENTS,
            "Paste at least one comment to analyze.",
        )
    return tuple(comments)


def normalize_youtube_comments(
    raw_comments: list[tuple[str, str | None]],
) -> tuple[AudienceComment, ...]:
    seen: set[str] = set()
    comments: list[AudienceComment] = []
    for text, author in raw_comments:
        normalized = normalize_unicode_whitespace(text)
        if not normalized:
            continue
        if len(normalized) > MAX_COMMENT_CHARACTERS:
            normalized = normalized[:MAX_COMMENT_CHARACTERS].rstrip()
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        author_norm = None
        if author:
            author_norm = normalize_unicode_whitespace(author)[:200] or None
        comments.append(
            AudienceComment(
                id=f"c{len(comments) + 1}",
                text=normalized,
                author=author_norm,
            )
        )
        if len(comments) >= MAX_AUDIENCE_COMMENTS:
            break
    if not comments:
        raise AudiencePulseInputError(
            AudiencePulseInputErrorCode.NO_COMMENTS,
            "No public comments were available to analyze.",
        )
    return tuple(comments)


def sample_note(total_available: int, kept: int) -> bool:
    return total_available > kept
