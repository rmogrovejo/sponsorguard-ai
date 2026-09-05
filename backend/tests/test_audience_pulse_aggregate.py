from app.domain.audience_pulse import (
    AudienceComment,
    AudiencePulseProviderOpportunity,
    AudiencePulseProviderOutput,
    AudiencePulseProviderReply,
    AudiencePulseProviderTheme,
    AudiencePulseSource,
    CommentClassification,
)
from app.services.audience_pulse_aggregate import (
    aggregate_audience_pulse,
    empty_partial_report,
    is_future_content_opportunity,
)


def _comments() -> tuple[AudienceComment, ...]:
    return (
        AudienceComment(id="c1", text="Does this work on Windows 11?"),
        AudienceComment(id="c2", text="Can you make part 2 for AMD?"),
        AudienceComment(id="c3", text="This setting increased stuttering."),
        AudienceComment(id="c4", text="Loved the third tip!"),
        AudienceComment(id="c5", text="lol"),
        AudienceComment(id="c6", text="I don't understand step 2"),
    )


def test_aggregate_grounding_and_actionable_denominator() -> None:
    provider = AudiencePulseProviderOutput(
        classifications=(
            CommentClassification(comment_id="c1", category="question"),
            CommentClassification(comment_id="c2", category="content_request"),
            CommentClassification(comment_id="c3", category="constructive_criticism"),
            CommentClassification(comment_id="c4", category="positive"),
            CommentClassification(comment_id="c5", category="low_information"),
            CommentClassification(comment_id="c6", category="confusion"),
            CommentClassification(comment_id="ghost", category="negative"),
        ),
        themes=(
            AudiencePulseProviderTheme(
                summary="Viewers want an AMD version",
                evidence_comment_ids=("c2", "ghost"),
            ),
            AudiencePulseProviderTheme(
                summary="Ungrounded theme",
                evidence_comment_ids=("ghost",),
            ),
        ),
        reply_worthy=(
            AudiencePulseProviderReply(kind="question", comment_id="c1"),
            AudiencePulseProviderReply(kind="request", comment_id="ghost"),
        ),
        opportunities=(
            AudiencePulseProviderOpportunity(
                title="AMD optimization follow-up",
                evidence_comment_ids=("c2",),
            ),
        ),
    )
    report = aggregate_audience_pulse(
        source=AudiencePulseSource.MANUAL,
        comments=_comments(),
        provider=provider,
    )
    assert report.analysis_status == "complete"
    assert report.comments_loaded == 6
    assert report.comments_classified == 6
    assert report.comments_actionable == 5  # excludes low_information
    actionable = [item for item in report.signals if item.category != "low_information"]
    assert sum(item.percentage or 0 for item in actionable) == 100
    low = next(item for item in report.signals if item.category == "low_information")
    assert low.count == 1
    assert low.percentage is None
    assert len(report.themes) == 1
    assert report.comments[0].text.startswith("Does this work")


def test_partial_report_has_no_fake_signals() -> None:
    comments = _comments()[:2]
    report = empty_partial_report(
        source=AudiencePulseSource.YOUTUBE,
        comments=comments,
        video=None,
        analysis_error_code="LLM_PROVIDER_RATE_LIMITED",
    )
    assert report.analysis_status == "not_evaluated"
    assert report.comments_loaded == 2
    assert report.signals == ()
    assert report.themes == ()
    assert report.comments == comments


def test_community_actions_are_not_next_content_opportunities() -> None:
    assert is_future_content_opportunity("AMD optimization follow-up")
    assert is_future_content_opportunity("Make a Windows 11 compatibility video")
    assert not is_future_content_opportunity(
        "Add a pinned comment or clarification about Windows 11"
    )
    assert not is_future_content_opportunity("Reply to the top comment")
    assert not is_future_content_opportunity("Moderate comments before the premiere")
    assert not is_future_content_opportunity("Fijar un comentario con la aclaración")


def test_aggregate_drops_community_action_opportunities() -> None:
    comments = _comments()
    provider = AudiencePulseProviderOutput(
        classifications=(
            CommentClassification(comment_id="c1", category="question"),
            CommentClassification(comment_id="c2", category="content_request"),
        ),
        themes=(),
        reply_worthy=(),
        opportunities=(
            AudiencePulseProviderOpportunity(
                title="Add a pinned comment or clarification",
                evidence_comment_ids=("c1",),
            ),
            AudiencePulseProviderOpportunity(
                title="Make an AMD version",
                evidence_comment_ids=("c2",),
            ),
        ),
    )
    report = aggregate_audience_pulse(
        source=AudiencePulseSource.MANUAL,
        comments=comments,
        provider=provider,
    )
    assert [item.title for item in report.opportunities] == ["Make an AMD version"]
    assert report.comments[0].text == "Does this work on Windows 11?"