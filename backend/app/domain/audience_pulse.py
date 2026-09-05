from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.domain.text import normalize_unicode_whitespace


MAX_AUDIENCE_COMMENTS = 200
MAX_COMMENT_CHARACTERS = 2_000
MAX_COMMENTS_TEXT_CHARACTERS = 400_000

# Taxonomy (8): six original audience signals + confusion + low_information.
SignalCategory = Literal[
    "positive",
    "question",
    "content_request",
    "funny",
    "constructive_criticism",
    "negative",
    "confusion",
    "low_information",
]

SIGNAL_CATEGORIES: tuple[SignalCategory, ...] = (
    "positive",
    "question",
    "content_request",
    "funny",
    "constructive_criticism",
    "negative",
    "confusion",
    "low_information",
)

# Percentages use actionable classifications only (exclude low_information).
ACTIONABLE_SIGNAL_CATEGORIES: tuple[SignalCategory, ...] = (
    "positive",
    "question",
    "content_request",
    "funny",
    "constructive_criticism",
    "negative",
    "confusion",
)

ReplyKind = Literal["question", "request", "criticism"]

AnalysisStatus = Literal["complete", "not_evaluated"]

CommentId = Annotated[str, StringConstraints(min_length=1, max_length=64)]
CommentText = Annotated[str, StringConstraints(min_length=1, max_length=MAX_COMMENT_CHARACTERS)]


class AudienceComment(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    id: CommentId
    text: CommentText
    author: Annotated[str, StringConstraints(max_length=200)] | None = None

    @field_validator("text", "author", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("comment text fields must be strings")
        normalized = normalize_unicode_whitespace(value)
        return normalized or None


class YouTubeVideoSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    title: Annotated[str, StringConstraints(min_length=1, max_length=300)]
    channel_title: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    comment_count_public: int | None = Field(default=None, ge=0)


class AudienceSignalCount(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    category: SignalCategory
    count: int = Field(ge=0)
    percentage: int | None = Field(default=None, ge=0, le=100)


class AudienceTheme(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    rank: int = Field(ge=1, le=10)
    summary: Annotated[str, StringConstraints(min_length=1, max_length=300)]
    comment_count: int = Field(ge=1)
    evidence_comment_ids: tuple[CommentId, ...] = Field(min_length=1, max_length=20)

    @field_validator("summary", mode="before")
    @classmethod
    def normalize_summary(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("theme summary must be a string")
        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError("theme summary cannot be blank")
        return normalized


class ReplyWorthyComment(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    kind: ReplyKind
    text: CommentText
    comment_id: CommentId

    @field_validator("text", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("reply text must be a string")
        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError("reply text cannot be blank")
        return normalized


class ContentOpportunity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    rank: int = Field(ge=1, le=10)
    title: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    grounded_in_count: int = Field(ge=1)
    evidence_comment_ids: tuple[CommentId, ...] = Field(min_length=1, max_length=20)

    @field_validator("title", mode="before")
    @classmethod
    def normalize_title(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("opportunity title must be a string")
        normalized = normalize_unicode_whitespace(value)
        if not normalized:
            raise ValueError("opportunity title cannot be blank")
        return normalized


class AudiencePulseSource(StrEnum):
    YOUTUBE = "youtube"
    MANUAL = "manual"
    SESSION = "session"


class CommentClassification(BaseModel):
    """Strict Gemini per-comment label."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    comment_id: CommentId
    category: SignalCategory


class AudiencePulseProviderTheme(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    summary: Annotated[str, StringConstraints(min_length=1, max_length=300)]
    evidence_comment_ids: tuple[CommentId, ...] = Field(min_length=1, max_length=20)


class AudiencePulseProviderReply(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    kind: ReplyKind
    comment_id: CommentId


class AudiencePulseProviderOpportunity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    title: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    evidence_comment_ids: tuple[CommentId, ...] = Field(min_length=1, max_length=20)


class AudiencePulseProviderOutput(BaseModel):
    """Strict Gemini document for Audience Pulse."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    classifications: tuple[CommentClassification, ...] = Field(max_length=MAX_AUDIENCE_COMMENTS)
    themes: tuple[AudiencePulseProviderTheme, ...] = Field(max_length=5)
    reply_worthy: tuple[AudiencePulseProviderReply, ...] = Field(max_length=5)
    opportunities: tuple[AudiencePulseProviderOpportunity, ...] = Field(max_length=5)


class AudiencePulseReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    source: AudiencePulseSource
    analysis_status: AnalysisStatus
    analysis_error_code: str | None = None
    comments_loaded: int = Field(ge=0)
    comments_classified: int = Field(ge=0)
    comments_actionable: int = Field(ge=0)
    comments: tuple[AudienceComment, ...]
    video: YouTubeVideoSnapshot | None = None
    signals: tuple[AudienceSignalCount, ...]
    themes: tuple[AudienceTheme, ...]
    reply_worthy: tuple[ReplyWorthyComment, ...]
    opportunities: tuple[ContentOpportunity, ...]
