import re
from collections.abc import Sequence

from pydantic import ValidationError

from app.domain.transcript import TranscriptSegment, normalize_transcript_text
from app.parsers.exceptions import (
    EmptyTranscriptError,
    MalformedTranscriptError,
    SRTErrorCode,
    TranscriptParseError,
    TranscriptTooLargeError,
)


MAX_SRT_CHARACTERS = 2_000_000

_INDEX_PATTERN = re.compile(r"[0-9]+")
_TIMESTAMP_PATTERN = re.compile(
    r"(?P<hours>\d{2,}):(?P<minutes>[0-5]\d):(?P<seconds>[0-5]\d)[,.]"
    r"(?P<milliseconds>\d{3})"
)

SRTLine = tuple[int, str]
SRTBlock = list[SRTLine]


def parse_srt(
    content: str,
    *,
    max_input_characters: int = MAX_SRT_CHARACTERS,
) -> list[TranscriptSegment]:
    """Parse a complete SRT document or raise a controlled parsing error.

    Parsing is atomic: a malformed block causes the whole document to fail. Skipping
    a block could shift evidence references or hide missing sponsored content.
    """

    if not isinstance(content, str):
        raise TranscriptParseError(
            "SRT input must be decoded text.",
            code=SRTErrorCode.INVALID_INPUT_TYPE,
        )
    if not isinstance(max_input_characters, int) or max_input_characters < 1:
        raise ValueError("max_input_characters must be a positive integer")
    if len(content) > max_input_characters:
        raise TranscriptTooLargeError(
            f"SRT input exceeds the {max_input_characters}-character limit.",
            code=SRTErrorCode.INPUT_TOO_LARGE,
        )

    normalized_content = content.removeprefix("\ufeff")
    blocks = _split_blocks(normalized_content)
    if not blocks:
        raise EmptyTranscriptError(
            "SRT input is empty.",
            code=SRTErrorCode.EMPTY_INPUT,
        )

    segments: list[TranscriptSegment] = []
    for block_number, block in enumerate(blocks, start=1):
        segments.append(_parse_block(block, block_number=block_number))
    return segments


def _split_blocks(content: str) -> list[SRTBlock]:
    blocks: list[SRTBlock] = []
    current_block: SRTBlock = []

    for line_number, line in enumerate(content.splitlines(), start=1):
        if line.strip():
            current_block.append((line_number, line))
        elif current_block:
            blocks.append(current_block)
            current_block = []

    if current_block:
        blocks.append(current_block)
    return blocks


def _parse_block(
    block: Sequence[SRTLine],
    *,
    block_number: int,
) -> TranscriptSegment:
    index_line_number, index_line = block[0]
    index_text = index_line.strip()
    index = _parse_index(
        index_text,
        block_number=block_number,
        line_number=index_line_number,
    )
    if len(block) < 2:
        raise MalformedTranscriptError(
            "Subtitle block is missing its timestamp line.",
            code=SRTErrorCode.MALFORMED_BLOCK,
            block_number=block_number,
            line_number=index_line_number,
        )

    timestamp_line_number, timestamp_line = block[1]
    start_seconds, end_seconds = _parse_timing_line(
        timestamp_line.strip(),
        block_number=block_number,
        line_number=timestamp_line_number,
    )

    text = "\n".join(line for _, line in block[2:])
    normalized_text = normalize_transcript_text(text)
    if not normalized_text:
        raise MalformedTranscriptError(
            "Subtitle text is empty after whitespace normalization.",
            code=SRTErrorCode.EMPTY_TEXT,
            block_number=block_number,
            line_number=timestamp_line_number + 1,
        )

    if end_seconds < start_seconds:
        raise MalformedTranscriptError(
            "Subtitle end timestamp occurs before its start timestamp.",
            code=SRTErrorCode.END_BEFORE_START,
            block_number=block_number,
            line_number=timestamp_line_number,
        )

    try:
        return TranscriptSegment(
            index=index,
            start_seconds=start_seconds,
            end_seconds=end_seconds,
            text=normalized_text,
        )
    except ValidationError as error:
        raise MalformedTranscriptError(
            "Subtitle block failed transcript domain validation.",
            code=SRTErrorCode.DOMAIN_VALIDATION,
            block_number=block_number,
            line_number=index_line_number,
        ) from error


def _parse_timing_line(
    value: str,
    *,
    block_number: int,
    line_number: int,
) -> tuple[float, float]:
    if "-->" not in value:
        raise MalformedTranscriptError(
            "Timestamp line is missing the '-->' separator.",
            code=SRTErrorCode.MISSING_TIMESTAMP_SEPARATOR,
            block_number=block_number,
            line_number=line_number,
        )

    parts = value.split("-->")
    if len(parts) != 2:
        raise MalformedTranscriptError(
            "Timestamp line contains an ambiguous separator.",
            code=SRTErrorCode.INVALID_TIMESTAMP,
            block_number=block_number,
            line_number=line_number,
        )

    start_value, end_value = (part.strip() for part in parts)
    return (
        _parse_timestamp(
            start_value,
            label="start",
            block_number=block_number,
            line_number=line_number,
        ),
        _parse_timestamp(
            end_value,
            label="end",
            block_number=block_number,
            line_number=line_number,
        ),
    )


def _parse_index(
    value: str,
    *,
    block_number: int,
    line_number: int,
) -> int:
    if _INDEX_PATTERN.fullmatch(value) is None:
        raise MalformedTranscriptError(
            f"Invalid subtitle index {_preview(value)}; expected a non-negative integer.",
            code=SRTErrorCode.MALFORMED_INDEX,
            block_number=block_number,
            line_number=line_number,
        )

    try:
        return int(value)
    except ValueError as error:
        raise MalformedTranscriptError(
            f"Invalid subtitle index {_preview(value)}; numeric value is too large.",
            code=SRTErrorCode.MALFORMED_INDEX,
            block_number=block_number,
            line_number=line_number,
        ) from error


def _parse_timestamp(
    value: str,
    *,
    label: str,
    block_number: int,
    line_number: int,
) -> float:
    match = _TIMESTAMP_PATTERN.fullmatch(value)
    if match is None:
        raise MalformedTranscriptError(
            f"Invalid {label} timestamp {_preview(value)}; expected "
            "HH:MM:SS,mmm or HH:MM:SS.mmm.",
            code=SRTErrorCode.INVALID_TIMESTAMP,
            block_number=block_number,
            line_number=line_number,
        )

    try:
        hours = int(match.group("hours"))
        minutes = int(match.group("minutes"))
        seconds = int(match.group("seconds"))
        milliseconds = int(match.group("milliseconds"))
        total_milliseconds = (
            ((hours * 60 + minutes) * 60 + seconds) * 1_000 + milliseconds
        )
        return total_milliseconds / 1_000
    except (OverflowError, ValueError) as error:
        raise MalformedTranscriptError(
            f"Invalid {label} timestamp {_preview(value)}; numeric value is too large.",
            code=SRTErrorCode.INVALID_TIMESTAMP,
            block_number=block_number,
            line_number=line_number,
        ) from error


def _preview(value: str, *, limit: int = 80) -> str:
    """Return a bounded representation suitable for user-facing parser errors."""

    if len(value) <= limit:
        return repr(value)
    return repr(f"{value[: limit - 3]}...")
