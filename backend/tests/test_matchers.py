import pytest

from app.domain.transcript import TranscriptSegment
from app.services.matchers import contains_bounded_match, find_earliest_match


def segment(index: int, start: float, text: str) -> TranscriptSegment:
    return TranscriptSegment(
        index=index,
        start_seconds=start,
        end_seconds=start + 1,
        text=text,
    )


@pytest.mark.parametrize(
    ("target", "text"),
    [
        ("AcmeVPN", "Today's video is sponsored by ACMEVPN."),
        ("AcmeVPN", "(AcmeVPN), our sponsor."),
        ("guaranteed anonymity", "No GUARANTEED\n\tanonymity claims."),
        ("ABC-123", "Use code [abc-123] today."),
        ("Café", "Try CAFE\u0301 today."),
    ],
)
def test_bounded_matcher_supports_safe_normalization(target: str, text: str) -> None:
    assert contains_bounded_match(text, target) is True


@pytest.mark.parametrize(
    ("target", "text"),
    [
        ("AcmeVPN", "MyAcmeVPNPlus subscription"),
        ("CREATOR25", "Use MYCREATOR25PLUS instead."),
        ("CREATOR25", "The CREATOR25PLUS code"),
        ("ABC-123", "XABC-1234"),
    ],
)
def test_bounded_matcher_rejects_larger_tokens(target: str, text: str) -> None:
    assert find_earliest_match([segment(1, 0, text)], target) is None


def test_returns_first_match_in_supplied_segment_order() -> None:
    transcript = [
        segment(9, 12, "AcmeVPN appears first in the file."),
        segment(2, 4, "AcmeVPN has an earlier timestamp but appears second."),
    ]

    match = find_earliest_match(transcript, "AcmeVPN")

    assert match is transcript[0]


def test_rejects_empty_match_target() -> None:
    with pytest.raises(ValueError, match="match target cannot be empty"):
        contains_bounded_match("Sponsor message", " \n\t ")
