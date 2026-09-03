from typing import cast

from fastapi import APIRouter, Request

from app.integrations.llm.base import SemanticVerifier
from app.parsers.srt import parse_srt
from app.schemas.compliance import ComplianceAnalyzeRequest, ComplianceAnalyzeResponse
from app.schemas.errors import ErrorResponse
from app.services.compliance_analysis import analyze_compliance as evaluate_compliance


router = APIRouter(prefix="/compliance", tags=["compliance"])


@router.post(
    "/analyze",
    response_model=ComplianceAnalyzeResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid compliance input"},
        413: {"model": ErrorResponse, "description": "Transcript too large"},
        422: {"model": ErrorResponse, "description": "Request validation error"},
        500: {"model": ErrorResponse, "description": "Unexpected internal error"},
    },
)
async def analyze_compliance(
    payload: ComplianceAnalyzeRequest,
    request: Request,
) -> ComplianceAnalyzeResponse:
    transcript_segments = parse_srt(payload.transcript.content)
    semantic_verifier = cast(
        SemanticVerifier,
        request.app.state.semantic_verifier,
    )
    report = await evaluate_compliance(
        payload.requirements,
        transcript_segments,
        semantic_verifier,
    )
    return ComplianceAnalyzeResponse.from_domain(report)
