"""Core SponsorGuard domain models."""

from app.domain.compliance import (
    ComplianceReasonCode,
    ComplianceReport,
    ComplianceResult,
    ComplianceStatus,
    ComplianceSummary,
)
from app.domain.requirements import (
    ForbiddenClaimRequirement,
    ForbiddenPhraseRequirement,
    RequiredExactTokenRequirement,
    RequiredMentionBeforeRequirement,
    RequiredMentionRequirement,
    RequiredURLRequirement,
    RequiredTalkingPointRequirement,
    Requirement,
    RequirementType,
    SponsorshipRequirement,
    validate_requirement,
)
from app.domain.semantic import (
    SemanticDecision,
    SemanticRequirement,
    SemanticVerificationOutput,
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
    "ForbiddenClaimRequirement",
    "RequiredExactTokenRequirement",
    "RequiredMentionBeforeRequirement",
    "RequiredMentionRequirement",
    "RequiredURLRequirement",
    "RequiredTalkingPointRequirement",
    "Requirement",
    "RequirementType",
    "SponsorshipRequirement",
    "SemanticDecision",
    "SemanticRequirement",
    "SemanticVerificationOutput",
    "TranscriptSegment",
    "extract_normalized_urls",
    "normalize_campaign_url",
    "normalize_transcript_text",
    "validate_requirement",
]
