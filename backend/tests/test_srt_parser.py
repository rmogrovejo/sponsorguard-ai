from pathlib import Path

import pytest

from app.parsers.exceptions import (
    EmptyTranscriptError,
    MalformedTranscriptError,
    SRTErrorCode,
    TranscriptParseError,
    TranscriptTooLargeError,
)
from app.parsers.srt import parse_srt


FIXTURES = Path(__file__).parent / "fixtures"


def dump_segments(content: str) -> list[dict[str, int | float | str]]:
    return [segment.model_dump() for segment in parse_srt(content)]


def test_parses_valid_single_segment() -> None:
    content = (
        "1\n"
        "00:00:38,000 --> 00:00:42,000\n"
        "Today's video is sponsored by AcmeVPN.\n"
    )

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 38.0,
            "end_seconds": 42.0,
            "text": "Today's video is sponsored by AcmeVPN.",
        }
    ]


def test_parses_valid_multiple_segments_from_fixture() -> None:
    content = (FIXTURES / "acme_vpn.srt").read_text(encoding="utf-8")

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 38.0,
            "end_seconds": 42.0,
            "text": "Today's video is sponsored by AcmeVPN.",
        },
        {
            "index": 2,
            "start_seconds": 52.0,
            "end_seconds": 57.0,
            "text": "You can save twenty-five percent using my link.",
        },
    ]


def test_normalizes_multiline_subtitle_text() -> None:
    content = "1\n00:00:01,000 --> 00:00:03,000\nUse my link\nfor the offer."

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 1.0,
            "end_seconds": 3.0,
            "text": "Use my link for the offer.",
        }
    ]


def test_supports_crlf_line_endings() -> None:
    content = (
        "1\r\n00:00:01,000 --> 00:00:02,000\r\nAcmeVPN sponsor.\r\n"
        "\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nOffer details.\r\n"
    )

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 1.0,
            "end_seconds": 2.0,
            "text": "AcmeVPN sponsor.",
        },
        {
            "index": 2,
            "start_seconds": 3.0,
            "end_seconds": 4.0,
            "text": "Offer details.",
        },
    ]


def test_supports_utf8_bom() -> None:
    content = "\ufeff1\n00:00:00,000 --> 00:00:01,000\nAcmeVPN."

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 0.0,
            "end_seconds": 1.0,
            "text": "AcmeVPN.",
        }
    ]


def test_preserves_millisecond_precision_and_supports_nonzero_hours() -> None:
    content = "1\n01:02:03,125 --> 01:02:04,987\nPrecise timing."

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 3723.125,
            "end_seconds": 3724.987,
            "text": "Precise timing.",
        }
    ]


@pytest.mark.parametrize("separator", [",", "."])
def test_accepts_comma_and_dot_millisecond_separators(separator: str) -> None:
    content = (
        f"1\n00:00:01{separator}125 --> 00:00:02{separator}875\n"
        "AcmeVPN disclosure."
    )

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 1.125,
            "end_seconds": 2.875,
            "text": "AcmeVPN disclosure.",
        }
    ]


@pytest.mark.parametrize("content", ["", " \n\t\r\n ", "\ufeff"])
def test_rejects_empty_input(content: str) -> None:
    with pytest.raises(EmptyTranscriptError) as error:
        parse_srt(content)

    assert error.value.code is SRTErrorCode.EMPTY_INPUT
    assert str(error.value) == "SRT input is empty."


@pytest.mark.parametrize(
    "timestamp",
    [
        "00:60:00,000 --> 00:00:01,000",
        "00:00:00,00 --> 00:00:01,000",
        "not-a-time --> 00:00:01,000",
    ],
)
def test_rejects_malformed_timestamps(timestamp: str) -> None:
    with pytest.raises(MalformedTranscriptError) as error:
        parse_srt(f"1\n{timestamp}\nAcmeVPN.")

    assert error.value.code is SRTErrorCode.INVALID_TIMESTAMP
    assert error.value.block_number == 1
    assert error.value.line_number == 2
    assert "expected HH:MM:SS,mmm or HH:MM:SS.mmm" in str(error.value)


def test_rejects_missing_timestamp_separator() -> None:
    with pytest.raises(MalformedTranscriptError) as error:
        parse_srt("1\n00:00:00,000 00:00:01,000\nAcmeVPN.")

    assert error.value.code is SRTErrorCode.MISSING_TIMESTAMP_SEPARATOR
    assert str(error.value) == (
        "Timestamp line is missing the '-->' separator. (block 1, line 2)"
    )


def test_rejects_end_before_start() -> None:
    with pytest.raises(MalformedTranscriptError) as error:
        parse_srt("1\n00:00:02,000 --> 00:00:01,999\nAcmeVPN.")

    assert error.value.code is SRTErrorCode.END_BEFORE_START
    assert str(error.value) == (
        "Subtitle end timestamp occurs before its start timestamp. "
        "(block 1, line 2)"
    )


def test_rejects_malformed_subtitle_number() -> None:
    with pytest.raises(MalformedTranscriptError) as error:
        parse_srt("one\n00:00:00,000 --> 00:00:01,000\nAcmeVPN.")

    assert error.value.code is SRTErrorCode.MALFORMED_INDEX
    assert error.value.block_number == 1
    assert error.value.line_number == 1


def test_rejects_malformed_block() -> None:
    with pytest.raises(MalformedTranscriptError) as error:
        parse_srt("1")

    assert error.value.code is SRTErrorCode.MALFORMED_BLOCK
    assert str(error.value) == (
        "Subtitle block is missing its timestamp line. (block 1, line 1)"
    )


def test_rejects_empty_subtitle_content() -> None:
    with pytest.raises(MalformedTranscriptError) as error:
        parse_srt("1\n00:00:00,000 --> 00:00:01,000\n   \n")

    assert error.value.code is SRTErrorCode.EMPTY_TEXT
    assert str(error.value) == (
        "Subtitle text is empty after whitespace normalization. "
        "(block 1, line 3)"
    )


def test_partially_corrupted_input_fails_atomically() -> None:
    content = (
        "1\n00:00:00,000 --> 00:00:01,000\nValid segment.\n\n"
        "2\ncorrupted timestamp\nInvalid segment."
    )

    with pytest.raises(MalformedTranscriptError) as error:
        parse_srt(content)

    assert error.value.code is SRTErrorCode.MISSING_TIMESTAMP_SEPARATOR
    assert error.value.block_number == 2
    assert error.value.line_number == 6


def test_normalizes_whitespace_and_trailing_space() -> None:
    content = (
        "\n\n1   \n"
        "00:00:00,500 --> 00:00:02,000    \n"
        "  Save\t twenty-five   percent.   \n\n\n"
    )

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 0.5,
            "end_seconds": 2.0,
            "text": "Save twenty-five percent.",
        }
    ]


def test_parses_final_segment_without_trailing_newline() -> None:
    content = "1\n00:00:05,000 --> 00:00:06,000\nFinal disclosure."

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 5.0,
            "end_seconds": 6.0,
            "text": "Final disclosure.",
        }
    ]


def test_preserves_unicode_content() -> None:
    content = "1\n00:00:00,000 --> 00:00:01,000\nCafé — 価格 ✅"

    assert dump_segments(content)[0]["text"] == "Café — 価格 ✅"


def test_accepts_index_starting_at_zero() -> None:
    content = "0\n00:00:00,000 --> 00:00:01,000\nAcmeVPN."

    assert dump_segments(content) == [
        {
            "index": 0,
            "start_seconds": 0.0,
            "end_seconds": 1.0,
            "text": "AcmeVPN.",
        }
    ]


def test_accepts_numbering_gaps() -> None:
    content = (
        "1\n00:00:00,000 --> 00:00:01,000\nFirst cue.\n\n"
        "4\n00:00:01,000 --> 00:00:02,000\nFourth cue."
    )

    assert dump_segments(content) == [
        {
            "index": 1,
            "start_seconds": 0.0,
            "end_seconds": 1.0,
            "text": "First cue.",
        },
        {
            "index": 4,
            "start_seconds": 1.0,
            "end_seconds": 2.0,
            "text": "Fourth cue.",
        },
    ]


def test_preserves_file_order_for_out_of_sequence_source_indices() -> None:
    content = (
        "9\n00:00:00,000 --> 00:00:01,000\nFirst in file.\n\n"
        "3\n00:00:01,000 --> 00:00:02,000\nSecond in file."
    )

    assert dump_segments(content) == [
        {
            "index": 9,
            "start_seconds": 0.0,
            "end_seconds": 1.0,
            "text": "First in file.",
        },
        {
            "index": 3,
            "start_seconds": 1.0,
            "end_seconds": 2.0,
            "text": "Second in file.",
        },
    ]


def test_extreme_numeric_fields_still_raise_bounded_controlled_errors() -> None:
    extreme_value = "9" * 5_000

    with pytest.raises(MalformedTranscriptError) as index_error:
        parse_srt(
            f"{extreme_value}\n00:00:00,000 --> 00:00:01,000\nAcmeVPN."
        )
    assert index_error.value.code is SRTErrorCode.MALFORMED_INDEX
    assert len(str(index_error.value)) < 160

    with pytest.raises(MalformedTranscriptError) as timestamp_error:
        parse_srt(
            f"1\n{extreme_value}:00:00,000 --> 00:00:01,000\nAcmeVPN."
        )
    assert timestamp_error.value.code is SRTErrorCode.INVALID_TIMESTAMP
    assert len(str(timestamp_error.value)) < 180


def test_rejects_non_text_input_with_controlled_error() -> None:
    with pytest.raises(TranscriptParseError) as error:
        parse_srt(b"not decoded")  # type: ignore[arg-type]

    assert error.value.code is SRTErrorCode.INVALID_INPUT_TYPE
    assert str(error.value) == "SRT input must be decoded text."


def test_rejects_input_over_configured_size_limit() -> None:
    with pytest.raises(TranscriptTooLargeError) as error:
        parse_srt("123456", max_input_characters=5)

    assert error.value.code is SRTErrorCode.INPUT_TOO_LARGE
    assert str(error.value) == "SRT input exceeds the 5-character limit."
