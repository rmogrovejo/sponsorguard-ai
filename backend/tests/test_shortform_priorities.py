from app.domain.shortform import (
    PreflightCategory,
    PreflightFinding,
    PreflightStatus,
    summarize_preflight,
)
from app.domain.media import TimeRange
from app.services.shortform_priorities import build_review_priorities


def _finding(
    check_id: str,
    status: PreflightStatus,
    category: PreflightCategory,
    *,
    ranges: tuple[TimeRange, ...] = (),
) -> PreflightFinding:
    return PreflightFinding(
        check_id=check_id,
        category=category,
        status=status,
        title=check_id,
        reason="reason",
        ranges=ranges,
    )


def test_priority_summary_is_deterministic_from_finding_status() -> None:
    findings = (
        _finding("orientation", PreflightStatus.PASS, PreflightCategory.FORMAT),
        _finding("opening", PreflightStatus.WARNING, PreflightCategory.OPENING),
        _finding(
            "dead_air",
            PreflightStatus.WARNING,
            PreflightCategory.PACING,
            ranges=(TimeRange(start_seconds=14.0, end_seconds=16.2),),
        ),
        _finding("cta", PreflightStatus.WARNING, PreflightCategory.CTA),
        _finding("speech_activity", PreflightStatus.NOT_EVALUATED, PreflightCategory.SPEECH),
    )
    priorities = build_review_priorities(findings)
    assert [item.title for item in priorities] == [
        "Strengthen opening",
        "Review pacing gap at 00:14.00",
        "Consider a closing CTA",
    ]
    assert [item.rank for item in priorities] == [1, 2, 3]


def test_failures_rank_ahead_of_warnings() -> None:
    findings = (
        _finding("cta", PreflightStatus.WARNING, PreflightCategory.CTA),
        _finding("orientation", PreflightStatus.FAIL, PreflightCategory.FORMAT),
    )
    priorities = build_review_priorities(findings)
    assert priorities[0].check_id == "orientation"
    assert priorities[1].check_id == "cta"


def test_mixed_score_and_coverage_exclude_not_evaluated() -> None:
    findings = (
        _finding("orientation", PreflightStatus.PASS, PreflightCategory.FORMAT),
        _finding("opening", PreflightStatus.WARNING, PreflightCategory.OPENING),
        _finding("cta", PreflightStatus.NOT_EVALUATED, PreflightCategory.CTA),
        _finding("dead_air", PreflightStatus.PASS, PreflightCategory.PACING),
    )
    summary = summarize_preflight(findings)
    assert summary.evaluated == 3
    assert summary.not_evaluated == 1
    assert summary.readiness_score == 83.33
    assert summary.verification_coverage == 75.0
