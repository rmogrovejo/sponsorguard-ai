import pytest
from pydantic import ValidationError

from app.domain.compliance import (
    ComplianceReasonCode,
    ComplianceResult,
    ComplianceStatus,
)
from app.services.scoring import summarize_results


def result(status: ComplianceStatus, index: int) -> ComplianceResult:
    reason_codes = {
        ComplianceStatus.PASS: ComplianceReasonCode.REQUIRED_MENTION_FOUND,
        ComplianceStatus.WARNING: ComplianceReasonCode.MANUAL_REVIEW_REQUIRED,
        ComplianceStatus.FAIL: ComplianceReasonCode.REQUIRED_MENTION_MISSING,
        ComplianceStatus.NOT_EVALUATED: (
            ComplianceReasonCode.SEMANTIC_VERIFICATION_UNAVAILABLE
        ),
    }
    return ComplianceResult(
        requirement_id=f"req_{index}",
        status=status,
        reason_code=reason_codes[status],
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
        "evaluated": 3,
        "not_evaluated": 0,
        "passed": 1,
        "warnings": 1,
        "failed": 1,
        "compliance_score": 50.0,
        "verification_coverage": 100.0,
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


def test_not_evaluated_is_excluded_from_score_and_reduces_coverage() -> None:
    summary = summarize_results(
        [
            result(ComplianceStatus.PASS, 1),
            result(ComplianceStatus.PASS, 2),
            result(ComplianceStatus.FAIL, 3),
            result(ComplianceStatus.NOT_EVALUATED, 4),
        ]
    )

    assert summary.model_dump() == {
        "total": 4,
        "evaluated": 3,
        "not_evaluated": 1,
        "passed": 2,
        "warnings": 0,
        "failed": 1,
        "compliance_score": 66.67,
        "verification_coverage": 75.0,
    }


def test_warning_keeps_half_weight_while_not_evaluated_is_excluded() -> None:
    summary = summarize_results(
        [
            result(ComplianceStatus.PASS, 1),
            result(ComplianceStatus.WARNING, 2),
            result(ComplianceStatus.NOT_EVALUATED, 3),
        ]
    )

    assert summary.compliance_score == 75.0
    assert summary.verification_coverage == 66.67


def test_all_not_evaluated_has_no_compliance_score() -> None:
    summary = summarize_results(
        [
            result(ComplianceStatus.NOT_EVALUATED, 1),
            result(ComplianceStatus.NOT_EVALUATED, 2),
        ]
    )

    assert summary.model_dump() == {
        "total": 2,
        "evaluated": 0,
        "not_evaluated": 2,
        "passed": 0,
        "warnings": 0,
        "failed": 0,
        "compliance_score": None,
        "verification_coverage": 0.0,
    }


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
            evaluated=2,
            not_evaluated=0,
            passed=2,
            warnings=0,
            failed=1,
            compliance_score=100.0,
            verification_coverage=100.0,
        )


def test_rejects_score_that_does_not_match_counts() -> None:
    from app.domain.compliance import ComplianceSummary

    with pytest.raises(ValidationError, match="must match the status counts"):
        ComplianceSummary(
            total=2,
            evaluated=2,
            not_evaluated=0,
            passed=0,
            warnings=0,
            failed=2,
            compliance_score=100.0,
            verification_coverage=100.0,
        )


def test_not_evaluated_result_rejects_evidence() -> None:
    with pytest.raises(ValidationError, match="cannot contain evidence"):
        ComplianceResult(
            requirement_id="req_unavailable",
            status=ComplianceStatus.NOT_EVALUATED,
            reason_code=ComplianceReasonCode.SEMANTIC_VERIFICATION_UNAVAILABLE,
            reason="Verification unavailable.",
            segment_index=1,
            timestamp_seconds=1.0,
            evidence="Not valid evidence.",
        )


def test_not_evaluated_requires_unavailable_verification_reason() -> None:
    with pytest.raises(ValidationError, match="requires an unavailable"):
        ComplianceResult(
            requirement_id="req_unavailable",
            status=ComplianceStatus.NOT_EVALUATED,
            reason_code=ComplianceReasonCode.MANUAL_REVIEW_REQUIRED,
            reason="Verification unavailable.",
        )


def test_rejects_empty_summary_input() -> None:
    with pytest.raises(ValueError, match="cannot summarize an empty"):
        summarize_results([])
