import logging

from fastapi import APIRouter, Request

from app.schemas.errors import ErrorResponse
from app.schemas.shortform_suggestions import (
    ShortFormSuggestionGenerateRequest,
    ShortFormSuggestionResponse,
)
from app.services.shortform_suggestions import generate_shortform_suggestion


logger = logging.getLogger("sponsorguard.api")
router = APIRouter(prefix="/shortform/suggestions", tags=["shortform"])


@router.post(
    "/generate",
    response_model=ShortFormSuggestionResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Ineligible or invalid suggestion request"},
        422: {"model": ErrorResponse, "description": "Request validation error"},
        429: {"model": ErrorResponse, "description": "Suggestion generation rate limited"},
        502: {"model": ErrorResponse, "description": "Invalid suggestion output"},
        503: {"model": ErrorResponse, "description": "Suggestion generation unavailable"},
        504: {"model": ErrorResponse, "description": "Suggestion generation timed out"},
        500: {"model": ErrorResponse, "description": "Unexpected internal error"},
    },
)
async def generate_shortform_suggestion_route(
    request: Request,
    payload: ShortFormSuggestionGenerateRequest,
) -> ShortFormSuggestionResponse:
    suggestion = await generate_shortform_suggestion(
        payload.finding.to_domain(),
        tuple(item.to_domain() for item in payload.speech_segments),
        finding_id=payload.finding_id,
        platform=payload.platform,
        video_duration_seconds=payload.video_duration_seconds,
        provider=request.app.state.shortform_suggestion_generator,
    )
    logger.info(
        "Short-form suggestion generated",
        extra={
            "event": "shortform_suggestion_generated",
            "request_id": getattr(request.state, "request_id", None),
            "finding_id": suggestion.finding_id.value,
            "outcome": suggestion.outcome.value,
            "placement_strategy": suggestion.placement.strategy.value,
        },
    )
    return ShortFormSuggestionResponse.from_domain(suggestion)
