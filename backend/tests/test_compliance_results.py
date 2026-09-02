import pytest
from pydantic import ValidationError

from app.domain.compliance import (
    ComplianceReasonCode,
    ComplianceResult,
    ComplianceStatus,
)
from app.services.scoring import summarize_results


def result(status: ComplianceStatus, index: int) -> ComplianceResult:
    reason_code = (
        ComplianceReasonCode.MANUAL_REVIEW_REQUIRED
        if status is ComplianceStatus.WARNING
        else ComplianceReasonCode.REQUIRED_MENTION_FOUND
    )
    return ComplianceResult(
        requirement_id=f"req_{index}",
        status=status,
        reason_code=reason_code,
        reason="Deterministic test result.",
    )


def test_summary_applies_warning_weight_and_rounding_policy() -> None:
    summary = summarize_results(
        [
            result(ComplianceStatus.PASS, 1),
            result(ComplianceStatus.WARNING, 2),
            result(ComplianceStatus.FAIL, 3),
        ]
    )

    assert summary.model_dump() == {
        "total": 3,
        "passed": 1,
        "warnings": 1,
        "failed": 1,
        "compliance_score": 50.0,
    }


def test_summary_rounds_half_up_to_two_decimals() -> None:
    summary = summarize_results(
        [
            result(ComplianceStatus.PASS, 1),
            result(ComplianceStatus.PASS, 2),
            result(ComplianceStatus.FAIL, 3),
        ]
    )

    assert summary.compliance_score == 66.67


def test_rejects_partial_evidence_bundle() -> None:
    with pytest.raises(ValidationError, match="must be provided together"):
        ComplianceResult(
            requirement_id="req_brand",
            status=ComplianceStatus.PASS,
            reason_code=ComplianceReasonCode.REQUIRED_MENTION_FOUND,
            reason="Required mention found.",
            timestamp_seconds=38.0,
        )


def test_rejects_inconsistent_summary_counts() -> None:
    from app.domain.compliance import ComplianceSummary

    with pytest.raises(ValidationError, match="status counts must add up"):
        ComplianceSummary(
            total=2,
            passed=2,
            warnings=0,
            failed=1,
            compliance_score=100.0,
        )


def test_rejects_score_that_does_not_match_counts() -> None:
    from app.domain.compliance import ComplianceSummary

    with pytest.raises(ValidationError, match="must match the status counts"):
        ComplianceSummary(
            total=2,
            passed=0,
            warnings=0,
            failed=2,
            compliance_score=100.0,
        )


def test_rejects_empty_summary_input() -> None:
    with pytest.raises(ValueError, match="cannot summarize an empty"):
        summarize_results([])
