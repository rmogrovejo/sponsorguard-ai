from typing import cast

from fastapi import APIRouter, Request

from app.integrations.llm.base import FixGenerator
from app.parsers.srt import parse_srt
from app.schemas.errors import ErrorResponse
from app.schemas.fixes import FixGenerateRequest, FixGenerateResponse
from app.services.fix_generation import generate_fix


router = APIRouter(prefix="/fixes", tags=["fixes"])


@router.post(
    "/generate",
    response_model=FixGenerateResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid or ineligible finding"},
        413: {"model": ErrorResponse, "description": "Transcript too large"},
        422: {"model": ErrorResponse, "description": "Request validation error"},
        429: {"model": ErrorResponse, "description": "Provider rate limited"},
        502: {"model": ErrorResponse, "description": "Invalid provider output"},
        503: {"model": ErrorResponse, "description": "Provider unavailable"},
        504: {"model": ErrorResponse, "description": "Provider timed out"},
    },
)
async def create_fix(
    payload: FixGenerateRequest,
    request: Request,
) -> FixGenerateResponse:
    segments = parse_srt(payload.transcript.content)
    provider = cast(FixGenerator, request.app.state.fix_generator)
    fix = await generate_fix(
        payload.requirement,
        payload.finding.to_domain(),
        segments,
        provider,
    )
    return FixGenerateResponse.from_domain(fix)
