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
    RequiredURLRequirement,
    Requirement,
    RequirementType,
    SponsorshipRequirement,
    validate_requirement,
)
from app.domain.transcript import TranscriptSegment, normalize_transcript_text
from app.domain.urls import (
    CampaignURLValidationError,
    extract_normalized_urls,
    normalize_campaign_url,
)

__all__ = [
    "ComplianceReasonCode",
    "ComplianceReport",
    "ComplianceResult",
    "ComplianceStatus",
    "ComplianceSummary",
    "CampaignURLValidationError",
    "ForbiddenPhraseRequirement",
    "RequiredExactTokenRequirement",
    "RequiredMentionBeforeRequirement",
    "RequiredMentionRequirement",
    "RequiredURLRequirement",
    "Requirement",
    "RequirementType",
    "SponsorshipRequirement",
    "TranscriptSegment",
    "extract_normalized_urls",
    "normalize_campaign_url",
    "normalize_transcript_text",
    "validate_requirement",
]
