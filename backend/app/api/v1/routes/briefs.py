import logging
from typing import cast

from fastapi import APIRouter, Request

from app.integrations.llm.base import LLMRequirementExtractor
from app.schemas.briefs import BriefExtractRequest, BriefExtractResponse
from app.schemas.errors import ErrorResponse
from app.services.brief_extraction import BriefExtractionService


router = APIRouter(prefix="/briefs", tags=["briefs"])
logger = logging.getLogger("sponsorguard.briefs")


@router.post(
    "/extract",
    response_model=BriefExtractResponse,
    responses={
        413: {"model": ErrorResponse, "description": "Sponsor brief too large"},
        422: {"model": ErrorResponse, "description": "Request validation error"},
        429: {"model": ErrorResponse, "description": "Provider rate limited"},
        502: {"model": ErrorResponse, "description": "Invalid provider output"},
        503: {"model": ErrorResponse, "description": "Provider unavailable"},
        504: {"model": ErrorResponse, "description": "Provider timeout"},
        500: {"model": ErrorResponse, "description": "Unexpected internal error"},
    },
)
async def extract_brief_requirements(
    payload: BriefExtractRequest,
    request: Request,
) -> BriefExtractResponse:
    provider = cast(
        LLMRequirementExtractor,
        request.app.state.requirement_extractor,
    )
    report = await BriefExtractionService(provider).extract(payload.brief)
    logger.info(
        "Sponsor brief requirements extracted",
        extra={
            "event": "brief_requirements_extracted",
            "request_id": getattr(request.state, "request_id", None),
            "provider": report.provider,
            "model": report.model,
            "requirement_count": len(report.requirements),
        },
    )
    return BriefExtractResponse.from_domain(report)
