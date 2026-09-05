from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.audience_pulse import (
    MAX_AUDIENCE_COMMENTS,
    MAX_COMMENT_CHARACTERS,
    MAX_COMMENTS_TEXT_CHARACTERS,
    AudienceComment,
    AudiencePulseReport,
    AudiencePulseSource,
    AudienceSignalCount,
    AudienceTheme,
    ContentOpportunity,
    ReplyWorthyComment,
    YouTubeVideoSnapshot,
)


class LoadedCommentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=MAX_COMMENT_CHARACTERS)
    author: str | None = Field(default=None, max_length=200)


class VideoSnapshotInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=300)
    channel_title: str = Field(min_length=1, max_length=200)
    comment_count_public: int | None = Field(default=None, ge=0)


class AudiencePulseAnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    youtube_url: str | None = Field(default=None, max_length=2_048)
    comments_text: str | None = Field(default=None, max_length=MAX_COMMENTS_TEXT_CHARACTERS)
    loaded_comments: list[LoadedCommentInput] | None = Field(
        default=None, max_length=MAX_AUDIENCE_COMMENTS
    )
    video: VideoSnapshotInput | None = None
    analysis_language: Literal["en", "es"] = "en"

    @model_validator(mode="after")
    def exactly_one_input(self) -> Self:
        has_url = bool(self.youtube_url and self.youtube_url.strip())
        has_text = bool(self.comments_text and self.comments_text.strip())
        has_loaded = bool(self.loaded_comments)
        if sum(1 for flag in (has_url, has_text, has_loaded) if flag) != 1:
            raise ValueError(
                "Provide exactly one of youtube_url, comments_text, or loaded_comments"
            )
        if self.video is not None and not has_loaded:
            raise ValueError("video snapshot is only valid with loaded_comments retry")
        return self


class AudienceCommentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    text: str
    author: str | None = None

    @classmethod
    def from_domain(cls, comment: AudienceComment) -> "AudienceCommentResponse":
        return cls(id=comment.id, text=comment.text, author=comment.author)


class YouTubeVideoSnapshotResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    title: str
    channel_title: str
    comment_count_public: int | None = None

    @classmethod
    def from_domain(cls, video: YouTubeVideoSnapshot) -> "YouTubeVideoSnapshotResponse":
        return cls(
            id=video.id,
            title=video.title,
            channel_title=video.channel_title,
            comment_count_public=video.comment_count_public,
        )


class AudienceSignalResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    category: str
    count: int
    percentage: int | None = None

    @classmethod
    def from_domain(cls, item: AudienceSignalCount) -> "AudienceSignalResponse":
        return cls(
            category=item.category,
            count=item.count,
            percentage=item.percentage,
        )


class AudienceThemeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    rank: int
    summary: str
    comment_count: int
    evidence_comment_ids: tuple[str, ...]

    @classmethod
    def from_domain(cls, item: AudienceTheme) -> "AudienceThemeResponse":
        return cls(
            rank=item.rank,
            summary=item.summary,
            comment_count=item.comment_count,
            evidence_comment_ids=item.evidence_comment_ids,
        )


class ReplyWorthyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["question", "request", "criticism"]
    text: str
    comment_id: str

    @classmethod
    def from_domain(cls, item: ReplyWorthyComment) -> "ReplyWorthyResponse":
        return cls(kind=item.kind, text=item.text, comment_id=item.comment_id)


class ContentOpportunityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    rank: int
    title: str
    grounded_in_count: int
    evidence_comment_ids: tuple[str, ...]

    @classmethod
    def from_domain(cls, item: ContentOpportunity) -> "ContentOpportunityResponse":
        return cls(
            rank=item.rank,
            title=item.title,
            grounded_in_count=item.grounded_in_count,
            evidence_comment_ids=item.evidence_comment_ids,
        )


class AudiencePulseAnalyzeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    source: AudiencePulseSource
    analysis_status: Literal["complete", "not_evaluated"]
    analysis_error_code: str | None = None
    comments_loaded: int
    comments_classified: int
    comments_actionable: int
    comments: tuple[AudienceCommentResponse, ...]
    video: YouTubeVideoSnapshotResponse | None = None
    signals: tuple[AudienceSignalResponse, ...]
    themes: tuple[AudienceThemeResponse, ...]
    reply_worthy: tuple[ReplyWorthyResponse, ...]
    opportunities: tuple[ContentOpportunityResponse, ...]

    @classmethod
    def from_domain(cls, report: AudiencePulseReport) -> "AudiencePulseAnalyzeResponse":
        return cls(
            source=report.source,
            analysis_status=report.analysis_status,
            analysis_error_code=report.analysis_error_code,
            comments_loaded=report.comments_loaded,
            comments_classified=report.comments_classified,
            comments_actionable=report.comments_actionable,
            comments=tuple(
                AudienceCommentResponse.from_domain(item) for item in report.comments
            ),
            video=(
                YouTubeVideoSnapshotResponse.from_domain(report.video)
                if report.video is not None
                else None
            ),
            signals=tuple(AudienceSignalResponse.from_domain(item) for item in report.signals),
            themes=tuple(AudienceThemeResponse.from_domain(item) for item in report.themes),
            reply_worthy=tuple(
                ReplyWorthyResponse.from_domain(item) for item in report.reply_worthy
            ),
            opportunities=tuple(
                ContentOpportunityResponse.from_domain(item)
                for item in report.opportunities
            ),
        )
