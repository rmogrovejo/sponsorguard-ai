import pytest

from app.domain.audience_pulse import MAX_AUDIENCE_COMMENTS
from app.services.audience_pulse_errors import (
    AudiencePulseInputError,
    YouTubeClientError,
    YouTubeErrorCode,
)
from app.services.audience_pulse_normalize import (
    normalize_manual_comments,
    parse_youtube_video_id,
)


def test_parse_shorts_and_watch_urls() -> None:
    assert parse_youtube_video_id("https://www.youtube.com/shorts/abcdefghijk") == "abcdefghijk"
    assert (
        parse_youtube_video_id("https://youtube.com/watch?v=abcdefghijk&t=12")
        == "abcdefghijk"
    )
    assert parse_youtube_video_id("https://youtu.be/abcdefghijk") == "abcdefghijk"


def test_parse_rejects_non_youtube() -> None:
    with pytest.raises(YouTubeClientError) as error:
        parse_youtube_video_id("https://tiktok.com/@x/video/1")
    assert error.value.code is YouTubeErrorCode.INVALID_URL


def test_normalize_manual_comments_dedupes_and_caps() -> None:
    lines = [f"comment {index}" for index in range(MAX_AUDIENCE_COMMENTS + 25)]
    lines.append("comment 0")  # duplicate
    comments = normalize_manual_comments("\n".join(lines))
    assert len(comments) == MAX_AUDIENCE_COMMENTS
    assert comments[0].id == "c1"
    assert comments[0].text == "comment 0"


def test_normalize_rejects_blank() -> None:
    with pytest.raises(AudiencePulseInputError):
        normalize_manual_comments("   \n\n  ")
