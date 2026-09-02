"""Core SponsorGuard domain models."""

from app.domain.compliance import (
    ComplianceReasonCode,
    ComplianceReport,
    ComplianceResult,
    ComplianceStatus,
    ComplianceSummary,
)
from app.domain.requirements import (
    ForbiddenPhraseRequirement,
    RequiredExactTokenRequirement,
    RequiredMentionBeforeRequirement,
    RequiredMentionRequirement,
    Requirement,
    RequirementType,
    SponsorshipRequirement,
    validate_requirement,
)
from app.domain.transcript import TranscriptSegment, normalize_transcript_text

__all__ = [
    "ComplianceReasonCode",
    "ComplianceReport",
    "ComplianceResult",
    "ComplianceStatus",
    "ComplianceSummary",
    "ForbiddenPhraseRequirement",
    "RequiredExactTokenRequirement",
    "RequiredMentionBeforeRequirement",
    "RequiredMentionRequirement",
    "Requirement",
    "RequirementType",
    "SponsorshipRequirement",
    "TranscriptSegment",
    "normalize_transcript_text",
    "validate_requirement",
]
