from enum import StrEnum


class SRTErrorCode(StrEnum):
    INVALID_INPUT_TYPE = "invalid_input_type"
    EMPTY_INPUT = "empty_input"
    INPUT_TOO_LARGE = "input_too_large"
    MALFORMED_BLOCK = "malformed_block"
    MALFORMED_INDEX = "malformed_index"
    MISSING_TIMESTAMP_SEPARATOR = "missing_timestamp_separator"
    INVALID_TIMESTAMP = "invalid_timestamp"
    END_BEFORE_START = "end_before_start"
    EMPTY_TEXT = "empty_text"
    DOMAIN_VALIDATION = "domain_validation"


class TranscriptParseError(ValueError):
    """Base exception for expected transcript parsing failures."""

    def __init__(
        self,
        message: str,
        *,
        code: SRTErrorCode,
        block_number: int | None = None,
        line_number: int | None = None,
    ) -> None:
        self.code = code
        self.block_number = block_number
        self.line_number = line_number

        location_parts: list[str] = []
        if block_number is not None:
            location_parts.append(f"block {block_number}")
        if line_number is not None:
            location_parts.append(f"line {line_number}")

        location = f" ({', '.join(location_parts)})" if location_parts else ""
        super().__init__(f"{message}{location}")


class EmptyTranscriptError(TranscriptParseError):
    """Raised when the input has no subtitle content."""


class TranscriptTooLargeError(TranscriptParseError):
    """Raised before parsing input that exceeds the configured size limit."""


class MalformedTranscriptError(TranscriptParseError):
    """Raised when any SRT block is malformed or ambiguous."""
