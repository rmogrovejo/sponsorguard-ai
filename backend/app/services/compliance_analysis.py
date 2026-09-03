from collections.abc import Sequence

from app.domain.compliance import ComplianceReport, ComplianceResult
from app.domain.requirements import Requirement
from app.domain.semantic import is_semantic_requirement
from app.domain.transcript import TranscriptSegment
from app.integrations.llm.base import SemanticVerifier
from app.services.compliance_engine import (
    evaluate_deterministic_requirement,
    validate_requirements,
    validate_transcript,
)
from app.services.scoring import summarize_results
from app.services.semantic_verification import SemanticVerificationService


async def analyze_compliance(
    requirements: Sequence[Requirement],
    transcript_segments: Sequence[TranscriptSegment],
    semantic_verifier: SemanticVerifier,
) -> ComplianceReport:
    """Combine authoritative deterministic checks with isolated semantic checks."""

    validated_requirements = validate_requirements(requirements)
    validated_segments = validate_transcript(transcript_segments)

    results_by_id: dict[str, ComplianceResult] = {}
    for requirement in validated_requirements:
        if not is_semantic_requirement(requirement):
            results_by_id[requirement.id] = evaluate_deterministic_requirement(
                requirement,
                validated_segments,
            )

    semantic_service = SemanticVerificationService(semantic_verifier)
    for requirement in validated_requirements:
        if is_semantic_requirement(requirement):
            results_by_id[requirement.id] = await semantic_service.verify(
                requirement,
                validated_segments,
            )

    ordered_results = tuple(
        results_by_id[requirement.id] for requirement in validated_requirements
    )
    return ComplianceReport(
        results=ordered_results,
        summary=summarize_results(ordered_results),
    )
