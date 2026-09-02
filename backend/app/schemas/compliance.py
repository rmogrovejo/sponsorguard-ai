from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.compliance import (
    ComplianceReasonCode,
    ComplianceReport,
    ComplianceStatus,
    ComplianceSummary,
)
from app.domain.requirements import Requirement


class TranscriptFormat(StrEnum):
    SRT = "srt"


class TranscriptInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    format: TranscriptFormat
    content: str = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def reject_blank_content(cls, value: str) -> str:
        if not value.strip().removeprefix("\ufeff").strip():
            raise ValueError("transcript content cannot be blank")
        return value


class ComplianceAnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    requirements: list[Requirement]
    transcript: TranscriptInput


class ComplianceResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    requirement_id: str
    status: ComplianceStatus
    reason_code: ComplianceReasonCode
    reason: str
    source_segment_index: int | None
    timestamp_seconds: float | None
    evidence: str | None


class ComplianceAnalyzeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    summary: ComplianceSummary
    results: tuple[ComplianceResultResponse, ...]

    @classmethod
    def from_domain(cls, report: ComplianceReport) -> "ComplianceAnalyzeResponse":
        return cls(
            summary=report.summary,
            results=tuple(
                ComplianceResultResponse(
                    requirement_id=result.requirement_id,
                    status=result.status,
                    reason_code=result.reason_code,
                    reason=result.reason,
                    source_segment_index=result.segment_index,
                    timestamp_seconds=result.timestamp_seconds,
                    evidence=result.evidence,
                )
                for result in report.results
            ),
        )
