from __future__ import annotations

import re
from collections import Counter

from app.domain.audience_pulse import (
    ACTIONABLE_SIGNAL_CATEGORIES,
    SIGNAL_CATEGORIES,
    AudienceComment,
    AudiencePulseProviderOutput,
    AudiencePulseReport,
    AudiencePulseSource,
    AudienceSignalCount,
    AudienceTheme,
    ContentOpportunity,
    ReplyWorthyComment,
    SignalCategory,
    YouTubeVideoSnapshot,
)


_COMMUNITY_ACTION_PATTERNS = (
    re.compile(r"\bpin(ned)?\b.{0,40}\bcomments?\b", re.IGNORECASE),
    re.compile(r"\bcomments?\b.{0,40}\bpin(ned)?\b", re.IGNORECASE),
    re.compile(r"\breply to\b", re.IGNORECASE),
    re.compile(r"\brespond to\b.{0,40}\bcomments?\b", re.IGNORECASE),
    re.compile(r"\bmoderat(e|es|ed|ing|ion)\b", re.IGNORECASE),
    re.compile(r"comentario(s)?\s+fijad", re.IGNORECASE),
    re.compile(r"fijar\s+(un\s+)?comentario", re.IGNORECASE),
    re.compile(r"responder\s+a\b", re.IGNORECASE),
    re.compile(r"\bmoderar\b", re.IGNORECASE),
    re.compile(r"moderaci[oó]n", re.IGNORECASE),
)


def is_future_content_opportunity(title: str) -> bool:
    """Reject community-management actions that are not new-content ideas."""
    text = title.strip()
    if not text:
        return False
    return not any(pattern.search(text) for pattern in _COMMUNITY_ACTION_PATTERNS)


def empty_partial_report(
    *,
    source: AudiencePulseSource,
    comments: tuple[AudienceComment, ...],
    video: YouTubeVideoSnapshot | None,
    analysis_error_code: str,
) -> AudiencePulseReport:
    return AudiencePulseReport(
        source=source,
        analysis_status="not_evaluated",
        analysis_error_code=analysis_error_code,
        comments_loaded=len(comments),
        comments_classified=0,
        comments_actionable=0,
        comments=comments,
        video=video,
        signals=(),
        themes=(),
        reply_worthy=(),
        opportunities=(),
    )


def aggregate_audience_pulse(
    *,
    source: AudiencePulseSource,
    comments: tuple[AudienceComment, ...],
    provider: AudiencePulseProviderOutput,
    video: YouTubeVideoSnapshot | None = None,
) -> AudiencePulseReport:
    by_id = {comment.id: comment for comment in comments}
    allowed = set(by_id)

    labels: dict[str, SignalCategory] = {}
    for item in provider.classifications:
        if item.comment_id not in allowed:
            continue
        labels[item.comment_id] = item.category

    classified_ids = list(labels)
    counts = Counter(labels[cid] for cid in classified_ids)
    actionable_total = sum(counts[cat] for cat in ACTIONABLE_SIGNAL_CATEGORIES)
    signals = _percentages(counts, actionable_total)

    themes: list[AudienceTheme] = []
    for theme in provider.themes:
        evidence = tuple(cid for cid in theme.evidence_comment_ids if cid in allowed)
        if not evidence:
            continue
        unique = tuple(dict.fromkeys(evidence))
        themes.append(
            AudienceTheme(
                rank=len(themes) + 1,
                summary=theme.summary,
                comment_count=len(unique),
                evidence_comment_ids=unique,
            )
        )
        if len(themes) >= 5:
            break

    replies: list[ReplyWorthyComment] = []
    seen_reply_ids: set[str] = set()
    for reply in provider.reply_worthy:
        if reply.comment_id not in allowed or reply.comment_id in seen_reply_ids:
            continue
        comment = by_id[reply.comment_id]
        replies.append(
            ReplyWorthyComment(
                kind=reply.kind,
                text=comment.text,
                comment_id=comment.id,
            )
        )
        seen_reply_ids.add(reply.comment_id)
        if len(replies) >= 5:
            break

    opportunities: list[ContentOpportunity] = []
    for opportunity in provider.opportunities:
        if not is_future_content_opportunity(opportunity.title):
            continue
        evidence = tuple(
            cid for cid in opportunity.evidence_comment_ids if cid in allowed
        )
        if not evidence:
            continue
        unique = tuple(dict.fromkeys(evidence))
        opportunities.append(
            ContentOpportunity(
                rank=len(opportunities) + 1,
                title=opportunity.title,
                grounded_in_count=len(unique),
                evidence_comment_ids=unique,
            )
        )
        if len(opportunities) >= 5:
            break

    return AudiencePulseReport(
        source=source,
        analysis_status="complete",
        analysis_error_code=None,
        comments_loaded=len(comments),
        comments_classified=len(classified_ids),
        comments_actionable=actionable_total,
        comments=comments,
        video=video,
        signals=signals,
        themes=tuple(themes),
        reply_worthy=tuple(replies),
        opportunities=tuple(opportunities),
    )


def _percentages(
    counts: Counter[SignalCategory],
    actionable_total: int,
) -> tuple[AudienceSignalCount, ...]:
    """Actionable categories get percentages that sum to 100.

    low_information is reported with count only (percentage null) so it does
    not distort the actionable denominator.
    """
    if actionable_total <= 0:
        return tuple(
            AudienceSignalCount(
                category=category,
                count=int(counts.get(category, 0)),
                percentage=None if category == "low_information" else 0,
            )
            for category in SIGNAL_CATEGORIES
        )

    raw = []
    for category in ACTIONABLE_SIGNAL_CATEGORIES:
        count = int(counts.get(category, 0))
        raw.append((category, count, (count * 100) / actionable_total))

    floors = [(category, count, int(pct)) for category, count, pct in raw]
    remainders = sorted(
        (
            (pct - floor, index)
            for index, (_, _, pct), (_, _, floor) in zip(range(len(raw)), raw, floors)
        ),
        reverse=True,
    )
    assigned = sum(floor for _, _, floor in floors)
    need = 100 - assigned
    bump = {index for _, index in remainders[:need]}
    actionable_signals = [
        AudienceSignalCount(
            category=category,
            count=count,
            percentage=floor + (1 if index in bump else 0),
        )
        for index, (category, count, floor) in enumerate(floors)
    ]
    low_info = AudienceSignalCount(
        category="low_information",
        count=int(counts.get("low_information", 0)),
        percentage=None,
    )
    return tuple([*actionable_signals, low_info])
