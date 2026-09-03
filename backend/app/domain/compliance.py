from enum import StrEnum
from decimal import Decimal, ROUND_HALF_UP

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.requirements import RequirementId


class ComplianceStatus(StrEnum):
    PASS = "pass"
    WARNING = "warning"
    FAIL = "fail"
    NOT_EVALUATED = "not_evaluated"


class ComplianceReasonCode(StrEnum):
    REQUIRED_MENTION_FOUND = "REQUIRED_MENTION_FOUND"
    REQUIRED_MENTION_MISSING = "REQUIRED_MENTION_MISSING"
    REQUIRED_TOKEN_FOUND = "REQUIRED_TOKEN_FOUND"
    REQUIRED_TOKEN_MISSING = "REQUIRED_TOKEN_MISSING"
    REQUIRED_MENTION_WITHIN_DEADLINE = "REQUIRED_MENTION_WITHIN_DEADLINE"
    REQUIRED_MENTION_TOO_LATE = "REQUIRED_MENTION_TOO_LATE"
    FORBIDDEN_PHRASE_ABSENT = "FORBIDDEN_PHRASE_ABSENT"
    FORBIDDEN_PHRASE_FOUND = "FORBIDDEN_PHRASE_FOUND"
    REQUIRED_URL_FOUND = "REQUIRED_URL_FOUND"
    REQUIRED_URL_MISSING = "REQUIRED_URL_MISSING"
    SEMANTIC_REQUIREMENT_CONFIRMED = "SEMANTIC_REQUIREMENT_CONFIRMED"
    SEMANTIC_REQUIREMENT_MISSING = "SEMANTIC_REQUIREMENT_MISSING"
    SEMANTIC_REQUIREMENT_UNCERTAIN = "SEMANTIC_REQUIREMENT_UNCERTAIN"
    FORBIDDEN_CLAIM_DETECTED = "FORBIDDEN_CLAIM_DETECTED"
    FORBIDDEN_CLAIM_CLEAR = "FORBIDDEN_CLAIM_CLEAR"
    FORBIDDEN_CLAIM_UNCERTAIN = "FORBIDDEN_CLAIM_UNCERTAIN"
    SEMANTIC_VERIFICATION_UNAVAILABLE = "SEMANTIC_VERIFICATION_UNAVAILABLE"
    MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED"


_WARNING_WEIGHT = Decimal("0.5")
_PERCENT = Decimal("100")
_SCORE_PRECISION = Decimal("0.01")


def calculate_compliance_score(
    *,
    evaluated: int,
    passed: int,
    warnings: int,
) -> float | None:
    """Score evaluated content only; return None when nothing was evaluated."""

    if evaluated < 0:
        raise ValueError("evaluated must not be negative")
    if evaluated == 0:
        return None
    earned_points = Decimal(passed) + Decimal(warnings) * _WARNING_WEIGHT
    score = (earned_points / Decimal(evaluated) * _PERCENT).quantize(
        _SCORE_PRECISION,
        rounding=ROUND_HALF_UP,
    )
    return float(score)


def calculate_verification_coverage(*, total: int, evaluated: int) -> float:
    """Return the evaluated share using the same two-decimal rounding policy."""

    if total < 1:
        raise ValueError("total must be positive")
    if evaluated < 0 or evaluated > total:
        raise ValueError("evaluated must be between zero and total")
    coverage = (Decimal(evaluated) / Decimal(total) * _PERCENT).quantize(
        _SCORE_PRECISION,
        rounding=ROUND_HALF_UP,
    )
    return float(coverage)


class ComplianceResult(BaseModel):
    """One frontend-ready, explainable result for one requirement."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    requirement_id: RequirementId
    status: ComplianceStatus
    reason_code: ComplianceReasonCode
    reason: str = Field(min_length=1, max_length=1_000)
    segment_index: int | None = Field(default=None, ge=0)
    timestamp_seconds: float | None = Field(
        default=None,
        ge=0,
        allow_inf_nan=False,
    )
    evidence: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def validate_evidence_bundle(self) -> "ComplianceResult":
        evidence_values = (
            self.segment_index,
            self.timestamp_seconds,
            self.evidence,
        )
        populated = sum(value is not None for value in evidence_values)
        if populated not in (0, len(evidence_values)):
            raise ValueError(
                "segment_index, timestamp_seconds, and evidence must be provided together"
            )
        if self.status is ComplianceStatus.NOT_EVALUATED and populated:
            raise ValueError("not-evaluated results cannot contain evidence")
        if (
            self.status is ComplianceStatus.NOT_EVALUATED
            and self.reason_code
            is not ComplianceReasonCode.SEMANTIC_VERIFICATION_UNAVAILABLE
        ):
            raise ValueError(
                "not_evaluated status requires an unavailable-verification reason"
            )
        if (
            self.reason_code is ComplianceReasonCode.SEMANTIC_VERIFICATION_UNAVAILABLE
            and self.status is not ComplianceStatus.NOT_EVALUATED
        ):
            raise ValueError(
                "semantic verification unavailable must use not_evaluated status"
            )
        return self


class ComplianceSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    total: int = Field(ge=1)
    evaluated: int = Field(ge=0)
    not_evaluated: int = Field(ge=0)
    passed: int = Field(ge=0)
    warnings: int = Field(ge=0)
    failed: int = Field(ge=0)
    compliance_score: float | None = Field(ge=0, le=100, allow_inf_nan=False)
    verification_coverage: float = Field(ge=0, le=100, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_counts(self) -> "ComplianceSummary":
        if self.evaluated + self.not_evaluated != self.total:
            raise ValueError("evaluated and not_evaluated must add up to total")
        if self.passed + self.warnings + self.failed != self.evaluated:
            raise ValueError("status counts must add up to evaluated")
        expected_score = calculate_compliance_score(
            evaluated=self.evaluated,
            passed=self.passed,
            warnings=self.warnings,
        )
        if self.compliance_score != expected_score:
            raise ValueError("compliance_score must match the status counts")
        expected_coverage = calculate_verification_coverage(
            total=self.total,
            evaluated=self.evaluated,
        )
        if self.verification_coverage != expected_coverage:
            raise ValueError("verification_coverage must match evaluated count")
        return self


class ComplianceReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    results: tuple[ComplianceResult, ...] = Field(min_length=1)
    summary: ComplianceSummary

    @model_validator(mode="after")
    def validate_result_count(self) -> "ComplianceReport":
        if len(self.results) != self.summary.total:
            raise ValueError("summary total must match the result count")

        passed = sum(result.status is ComplianceStatus.PASS for result in self.results)
        warnings = sum(
            result.status is ComplianceStatus.WARNING for result in self.results
        )
        failed = sum(result.status is ComplianceStatus.FAIL for result in self.results)
        not_evaluated = sum(
            result.status is ComplianceStatus.NOT_EVALUATED for result in self.results
        )
        if (passed, warnings, failed, not_evaluated) != (
            self.summary.passed,
            self.summary.warnings,
            self.summary.failed,
            self.summary.not_evaluated,
        ):
            raise ValueError("summary status counts must match the results")
        return self
