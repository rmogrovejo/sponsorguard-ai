from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator


class MediaOrientation(StrEnum):
    PORTRAIT = "portrait"
    SQUARE = "square"
    LANDSCAPE = "landscape"


PositiveInt = Annotated[int, Field(strict=True, ge=1)]
NonNegativeInt = Annotated[int, Field(strict=True, ge=0)]
FiniteSeconds = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class MediaInspection(BaseModel):
    """Deterministic facts resolved from an uploaded video container."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    display_filename: Annotated[str, Field(min_length=1, max_length=255)]
    size_bytes: NonNegativeInt
    duration_seconds: FiniteSeconds
    width: PositiveInt
    height: PositiveInt
    has_audio: bool

    @property
    def aspect_ratio(self) -> float:
        return self.width / self.height

    @property
    def orientation(self) -> MediaOrientation:
        return classify_orientation(self.aspect_ratio)


class TimeRange(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    start_seconds: FiniteSeconds
    end_seconds: FiniteSeconds

    @model_validator(mode="after")
    def validate_order(self) -> "TimeRange":
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be greater than start_seconds")
        return self

    @property
    def duration_seconds(self) -> float:
        return self.end_seconds - self.start_seconds


def classify_orientation(aspect_ratio: float) -> MediaOrientation:
    if aspect_ratio < 0.85:
        return MediaOrientation.PORTRAIT
    if aspect_ratio <= 1.15:
        return MediaOrientation.SQUARE
    return MediaOrientation.LANDSCAPE


def aspect_ratio_matches(actual: float, target: float, *, tolerance: float) -> bool:
    if target <= 0 or tolerance < 0:
        raise ValueError("aspect-ratio comparison requires a positive target")
    return abs(actual - target) <= tolerance
