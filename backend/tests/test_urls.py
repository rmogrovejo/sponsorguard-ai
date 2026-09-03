import pytest
from pydantic import ValidationError

from app.domain.requirements import RequiredURLRequirement
from app.domain.transcript import TranscriptSegment
from app.domain.urls import (
    CampaignURLValidationError,
    normalize_campaign_url,
)
from app.services.matchers import find_earliest_url_match


def requirement(value: object) -> RequiredURLRequirement:
    return RequiredURLRequirement.model_validate(
        {
            "id": "req_campaign_url",
            "description": "Mention campaign URL",
            "value": value,
        }
    )


def segment(text: str) -> TranscriptSegment:
    return TranscriptSegment(
        index=7,
        start_seconds=38,
        end_seconds=42,
        text=text,
    )


@pytest.mark.parametrize(
    "value",
    [
        "acmevpn.com/creator",
        "https://acmevpn.com/creator",
    ],
)
def test_required_url_accepts_supported_forms(value: str) -> None:
    parsed = requirement(value)

    assert parsed.value == "acmevpn.com/creator"


@pytest.mark.parametrize(
    "value",
    [
        "",
        "   ",
        "not-a-host",
        "https://bad_host/creator",
        "ftp://acmevpn.com/creator",
        "javascript:alert(1)",
        42,
    ],
)
def test_required_url_rejects_invalid_or_unsafe_values(value: object) -> None:
    with pytest.raises(ValidationError):
        requirement(value)


@pytest.mark.parametrize(
    "text",
    [
        "Visit acmevpn.com/creator today.",
        "Visit https://acmevpn.com/creator today.",
        "Visit http://acmevpn.com/creator today.",
        "Visit www.acmevpn.com/creator today.",
        "Visit https://www.acmevpn.com/creator/ today.",
        "Visit acmevpn.com/creator/ today.",
        "Visit acmevpn.com/creator.",
        "Visit acmevpn.com/creator, then enter the code.",
        "Visit HTTPS://WWW.ACMEVPN.COM/creator/ today.",
        "Go to [https://www.acmevpn.com/creator/](https://www.acmevpn.com/creator/).",
    ],
)
def test_url_matcher_accepts_documented_equivalent_forms(text: str) -> None:
    match = find_earliest_url_match([segment(text)], "acmevpn.com/creator")

    assert match is not None
    assert match.text == text


@pytest.mark.parametrize(
    "text",
    [
        "Visit evil-acmevpn.com/creator.",
        "Visit notacmevpn.com/creator.",
        "Visit acmevpn.net/creator.",
        "Visit acmevpn.com/other.",
        "Visit acmevpn.com/creator-plus.",
        "Visit acmevpn.com/creator/extra.",
        "Visit example.com/creator.",
    ],
)
def test_url_matcher_rejects_false_positives(text: str) -> None:
    assert find_earliest_url_match([segment(text)], "acmevpn.com/creator") is None


@pytest.mark.parametrize(
    ("required", "transcript"),
    [
        ("acmevpn.com/creator?ref=alex", "acmevpn.com/creator?ref=sam"),
        ("acmevpn.com/creator#offer", "acmevpn.com/creator#details"),
        ("acmevpn.com:8443/creator", "acmevpn.com/creator"),
    ],
)
def test_query_fragment_and_port_remain_meaningful(
    required: str,
    transcript: str,
) -> None:
    assert find_earliest_url_match([segment(transcript)], required) is None


def test_only_one_trailing_slash_is_ignored() -> None:
    assert normalize_campaign_url("acmevpn.com/creator/") == "acmevpn.com/creator"
    assert normalize_campaign_url("acmevpn.com/creator//") == "acmevpn.com/creator/"


def test_normalizer_rejects_direct_non_string_input() -> None:
    with pytest.raises(CampaignURLValidationError, match="must be a string"):
        normalize_campaign_url(False)
