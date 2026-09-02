from collections import Counter
from collections.abc import Sequence

from app.domain.compliance import (
    ComplianceResult,
    ComplianceStatus,
    ComplianceSummary,
    calculate_compliance_score,
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

    return ComplianceSummary(
        total=total,
        passed=passed,
        warnings=warnings,
        failed=failed,
        compliance_score=calculate_compliance_score(
            total=total,
            passed=passed,
            warnings=warnings,
        ),
    )
