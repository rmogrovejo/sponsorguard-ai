import logging
from typing import cast

from fastapi import APIRouter, Request

from app.core.config import Settings
from app.domain.audience_pulse import AudienceComment, YouTubeVideoSnapshot
from app.integrations.llm.base import AudiencePulseAnalyzer
from app.integrations.youtube.client import YouTubeDataClient
from app.schemas.audience_pulse import (
    AudiencePulseAnalyzeRequest,
    AudiencePulseAnalyzeResponse,
)
from app.schemas.errors import ErrorResponse
from app.services.audience_pulse import AudiencePulseService


router = APIRouter(prefix="/audience-pulse", tags=["audience-pulse"])
logger = logging.getLogger("sponsorguard.audience_pulse")


@router.post(
    "/analyze",
    response_model=AudiencePulseAnalyzeResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid audience input"},
        422: {"model": ErrorResponse, "description": "Request validation error"},
        429: {"model": ErrorResponse, "description": "Rate limited / YouTube quota"},
        503: {"model": ErrorResponse, "description": "YouTube unavailable or not configured"},
        404: {"model": ErrorResponse, "description": "YouTube video not found"},
        500: {"model": ErrorResponse, "description": "Unexpected internal error"},
    },
)
async def analyze_audience_pulse(
    payload: AudiencePulseAnalyzeRequest,
    request: Request,
) -> AudiencePulseAnalyzeResponse:
    settings = cast(Settings, request.app.state.settings)
    analyzer = cast(AudiencePulseAnalyzer, request.app.state.audience_pulse_analyzer)
    youtube = YouTubeDataClient(
        api_key=settings.youtube_api_key,
        timeout_seconds=settings.youtube_timeout_seconds,
    )
    loaded = None
    if payload.loaded_comments is not None:
        loaded = tuple(
            AudienceComment(id=item.id, text=item.text, author=item.author)
            for item in payload.loaded_comments
        )
    video = None
    if payload.video is not None:
        video = YouTubeVideoSnapshot(
            id=payload.video.id,
            title=payload.video.title,
            channel_title=payload.video.channel_title,
            comment_count_public=payload.video.comment_count_public,
        )
    report = await AudiencePulseService(analyzer, youtube).analyze(
        youtube_url=payload.youtube_url,
        comments_text=payload.comments_text,
        loaded_comments=loaded,
        video=video,
        analysis_language=payload.analysis_language,
    )
    logger.info(
        "Audience Pulse analyzed",
        extra={
            "event": "audience_pulse_analyzed",
            "request_id": getattr(request.state, "request_id", None),
            "source": report.source.value,
            "analysis_status": report.analysis_status,
            "analysis_error_code": report.analysis_error_code,
            "comments_loaded": report.comments_loaded,
            "comments_classified": report.comments_classified,
            "comments_actionable": report.comments_actionable,
            "theme_count": len(report.themes),
            "has_video": report.video is not None,
        },
    )
    return AudiencePulseAnalyzeResponse.from_domain(report)
