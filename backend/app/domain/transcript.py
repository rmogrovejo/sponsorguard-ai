from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def normalize_transcript_text(value: str) -> str:
    """Collapse Unicode whitespace without altering non-whitespace content."""

    return " ".join(value.split())


class TranscriptSegment(BaseModel):
    """A normalized, immutable span of transcript text."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    index: int = Field(ge=0)
    start_seconds: float = Field(ge=0, allow_inf_nan=False)
    end_seconds: float = Field(ge=0, allow_inf_nan=False)
    text: str = Field(min_length=1)

    @field_validator("text", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("text must be a string")

        normalized = normalize_transcript_text(value)
        if not normalized:
            raise ValueError("text cannot be empty after normalization")
        return normalized

    @model_validator(mode="after")
    def validate_time_range(self) -> "TranscriptSegment":
        if self.end_seconds < self.start_seconds:
            raise ValueError("end_seconds must be greater than or equal to start_seconds")
        return self
