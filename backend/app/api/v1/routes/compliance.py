from fastapi import APIRouter

from app.parsers.srt import parse_srt
from app.schemas.compliance import ComplianceAnalyzeRequest, ComplianceAnalyzeResponse
from app.schemas.errors import ErrorResponse
from app.services.compliance_engine import evaluate_compliance


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
def analyze_compliance(
    request: ComplianceAnalyzeRequest,
) -> ComplianceAnalyzeResponse:
    transcript_segments = parse_srt(request.transcript.content)
    report = evaluate_compliance(request.requirements, transcript_segments)
    return ComplianceAnalyzeResponse.from_domain(report)
