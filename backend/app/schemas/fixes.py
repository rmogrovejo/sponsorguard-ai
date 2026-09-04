from pydantic import BaseModel, ConfigDict

from app.domain.compliance import ComplianceReasonCode, ComplianceResult, ComplianceStatus
from app.domain.fixes import FixAction, FixPlacementStrategy, GeneratedFix
from app.domain.requirements import Requirement
from app.schemas.compliance import TranscriptInput


class FixFindingInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    requirement_id: str
    status: ComplianceStatus
    reason_code: ComplianceReasonCode
    reason: str
    source_segment_index: int | None
    timestamp_seconds: float | None
    evidence: str | None

    def to_domain(self) -> ComplianceResult:
        return ComplianceResult(
            requirement_id=self.requirement_id,
            status=self.status,
            reason_code=self.reason_code,
            reason=self.reason,
            segment_index=self.source_segment_index,
            timestamp_seconds=self.timestamp_seconds,
            evidence=self.evidence,
        )


class FixGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    requirement: Requirement
    finding: FixFindingInput
    transcript: TranscriptInput


class FixPlacementResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    strategy: FixPlacementStrategy
    source_segment_index: int | None
    timestamp_seconds: float | None
    before_seconds: float | None


class FixGenerateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    requirement_id: str
    action: FixAction
    suggested_text: str | None
    placement: FixPlacementResponse | None
    reason: str

    @classmethod
    def from_domain(cls, fix: GeneratedFix) -> "FixGenerateResponse":
        placement = None
        if fix.placement is not None:
            placement = FixPlacementResponse(
                strategy=fix.placement.strategy,
                source_segment_index=fix.placement.segment_index,
                timestamp_seconds=fix.placement.timestamp_seconds,
                before_seconds=fix.placement.before_seconds,
            )
        return cls(
            requirement_id=fix.requirement_id,
            action=fix.action,
            suggested_text=fix.suggested_text,
            placement=placement,
            reason=fix.reason,
        )
