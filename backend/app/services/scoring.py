from collections import Counter
from collections.abc import Sequence

from app.domain.compliance import (
    ComplianceResult,
    ComplianceStatus,
    ComplianceSummary,
    calculate_compliance_score,
    calculate_verification_coverage,
)


def summarize_results(results: Sequence[ComplianceResult]) -> ComplianceSummary:
    """Calculate a percentage rounded to two decimals using round-half-up."""

    if not results:
        raise ValueError("cannot summarize an empty result collection")

    counts = Counter(result.status for result in results)
    total = len(results)
    passed = counts[ComplianceStatus.PASS]
    warnings = counts[ComplianceStatus.WARNING]
    failed = counts[ComplianceStatus.FAIL]
    not_evaluated = counts[ComplianceStatus.NOT_EVALUATED]
    evaluated = total - not_evaluated

    return ComplianceSummary(
        total=total,
        evaluated=evaluated,
        not_evaluated=not_evaluated,
        passed=passed,
        warnings=warnings,
        failed=failed,
        compliance_score=calculate_compliance_score(
            evaluated=evaluated,
            passed=passed,
            warnings=warnings,
        ),
        verification_coverage=calculate_verification_coverage(
            total=total,
            evaluated=evaluated,
        ),
    )
