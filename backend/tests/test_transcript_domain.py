import math

import pytest
from pydantic import ValidationError

from app.domain.transcript import TranscriptSegment


def test_normalizes_segment_text() -> None:
    segment = TranscriptSegment(
        index=1,
        start_seconds=0.0,
        end_seconds=1.0,
        text="  Sponsored\n\tby   AcmeVPN.  ",
    )

    assert segment.model_dump() == {
        "index": 1,
        "start_seconds": 0.0,
        "end_seconds": 1.0,
        "text": "Sponsored by AcmeVPN.",
    }


def test_accepts_zero_as_source_index() -> None:
    segment = TranscriptSegment(
        index=0,
        start_seconds=0.0,
        end_seconds=1.0,
        text="AcmeVPN disclosure.",
    )

    assert segment.index == 0


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("index", -1),
        ("start_seconds", -0.001),
        ("start_seconds", math.nan),
        ("end_seconds", math.inf),
    ],
)
def test_rejects_invalid_numeric_fields(field: str, value: int | float) -> None:
    values = {
        "index": 1,
        "start_seconds": 0.0,
        "end_seconds": 1.0,
        "text": "Valid text",
    }
    values[field] = value

    with pytest.raises(ValidationError):
        TranscriptSegment.model_validate(values)


def test_rejects_end_before_start() -> None:
    with pytest.raises(ValidationError, match="end_seconds must be greater"):
        TranscriptSegment(
            index=1,
            start_seconds=2.0,
            end_seconds=1.0,
            text="Valid text",
        )


@pytest.mark.parametrize("text", ["", "  \n\t  "])
def test_rejects_empty_normalized_text(text: str) -> None:
    with pytest.raises(ValidationError, match="text cannot be empty"):
        TranscriptSegment(
            index=1,
            start_seconds=0.0,
            end_seconds=1.0,
            text=text,
        )


def test_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        TranscriptSegment.model_validate(
            {
                "index": 1,
                "start_seconds": 0.0,
                "end_seconds": 1.0,
                "text": "Valid text",
                "unexpected": True,
            }
        )
