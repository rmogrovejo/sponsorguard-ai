import asyncio

import pytest

from app.domain.shortform import ShortFormPlatform
from app.domain.shortform_suggestions import (
    SuggestionOutcome,
    SuggestionPlacementStrategy,
    SuggestionType,
)
from app.integrations.llm.exceptions import LLMOutputValidationError
from app.services.shortform_suggestions import (
    bound_suggestion_segments,
    generate_shortform_suggestion,
)
from tests.shortform_suggestion_fixtures import (
    CTA_SEGMENTS,
    FakeSuggestionGenerator,
    OPENING_SEGMENTS,
    cta_finding,
    opening_finding,
    provider_output,
    segment,
)


def test_valid_stronger_opening_suggestion() -> None:
    provider = FakeSuggestionGenerator(provider_output())
    suggestion = asyncio.run(
        generate_shortform_suggestion(
            opening_finding(),
            OPENING_SEGMENTS,
            finding_id=SuggestionType.OPENING,
            platform=ShortFormPlatform.TIKTOK,
            video_duration_seconds=30.0,
            provider=provider,
        )
    )

    assert suggestion.outcome is SuggestionOutcome.SUGGESTED
    assert suggestion.suggested_text is not None
    assert "settings" in suggestion.suggested_text.lower()
    assert suggestion.display_label == "SUGGESTED OPENING"
    assert suggestion.placement.strategy is SuggestionPlacementStrategy.REPLACE_OPENING
    assert suggestion.placement.start_seconds == 0.0
    assert suggestion.placement.end_seconds == 3.2
    assert provider.calls == 1


def test_opening_context_is_grounded_and_bounded() -> None:
    provider = FakeSuggestionGenerator(provider_output())
    asyncio.run(
        generate_shortform_suggestion(
            opening_finding(),
            OPENING_SEGMENTS,
            finding_id=SuggestionType.OPENING,
            platform=ShortFormPlatform.TIKTOK,
            video_duration_seconds=30.0,
            provider=provider,
        )
    )

    context = provider.contexts[0]
    assert [item.index for item in context.segments] == [1]
    assert all("third setting" not in item.text for item in context.segments)
    assert "three settings" in context.segments[0].text.lower()


def test_original_opening_transcript_is_preserved() -> None:
    original = OPENING_SEGMENTS[0].text
    provider = FakeSuggestionGenerator(provider_output())
    asyncio.run(
        generate_shortform_suggestion(
            opening_finding(evidence=original),
            OPENING_SEGMENTS,
            finding_id=SuggestionType.OPENING,
            platform=ShortFormPlatform.TIKTOK,
            video_duration_seconds=30.0,
            provider=provider,
        )
    )
    assert provider.contexts[0].segments[0].text == original
    assert provider.contexts[0].evidence_text == original


def test_invalid_referenced_opening_segment_is_rejected() -> None:
    provider = FakeSuggestionGenerator(provider_output(indices=(99,)))
    with pytest.raises(LLMOutputValidationError, match="unsupplied"):
        asyncio.run(
            generate_shortform_suggestion(
                opening_finding(),
                OPENING_SEGMENTS,
                finding_id=SuggestionType.OPENING,
                platform=ShortFormPlatform.TIKTOK,
                video_duration_seconds=30.0,
                provider=provider,
            )
        )


def test_empty_generated_suggestion_is_rejected() -> None:
    with pytest.raises(Exception):
        provider_output(text="   ")


def test_excessive_suggestion_length_is_rejected() -> None:
    with pytest.raises(Exception):
        provider_output(text="A" * 181)


def test_valid_cta_suggestion_uses_ending_context_only() -> None:
    provider = FakeSuggestionGenerator(
        provider_output(
            text="Follow for part two.",
            reason="The ending has no clear next action.",
            indices=(2,),
        )
    )
    suggestion = asyncio.run(
        generate_shortform_suggestion(
            cta_finding(),
            CTA_SEGMENTS,
            finding_id=SuggestionType.CTA,
            platform=ShortFormPlatform.YOUTUBE_SHORTS,
            video_duration_seconds=30.0,
            provider=provider,
        )
    )

    context = provider.contexts[0]
    assert [item.index for item in context.segments] == [2]
    assert context.segments[0].text == "And that's the third setting."
    assert suggestion.suggested_text == "Follow for part two."
    assert suggestion.display_label == "SUGGESTED CTA"
    assert suggestion.placement.strategy is SuggestionPlacementStrategy.APPEND_NEAR_END
    assert suggestion.placement.after_seconds == 26.4


def test_cta_does_not_invent_url() -> None:
    provider = FakeSuggestionGenerator(
        provider_output(
            text="Visit https://example.com/offer for the settings.",
            indices=(2,),
        )
    )
    with pytest.raises(LLMOutputValidationError, match="URL"):
        asyncio.run(
            generate_shortform_suggestion(
                cta_finding(),
                CTA_SEGMENTS,
                finding_id=SuggestionType.CTA,
                platform=ShortFormPlatform.TIKTOK,
                video_duration_seconds=30.0,
                provider=provider,
            )
        )


def test_cta_does_not_invent_coupon() -> None:
    provider = FakeSuggestionGenerator(
        provider_output(
            text="Use code SAVE20 and follow for part two.",
            indices=(2,),
        )
    )
    with pytest.raises(LLMOutputValidationError, match="coupon"):
        asyncio.run(
            generate_shortform_suggestion(
                cta_finding(),
                CTA_SEGMENTS,
                finding_id=SuggestionType.CTA,
                platform=ShortFormPlatform.TIKTOK,
                video_duration_seconds=30.0,
                provider=provider,
            )
        )


def test_invalid_cta_segment_is_rejected() -> None:
    provider = FakeSuggestionGenerator(
        provider_output(text="Follow for part two.", indices=(1,))
    )
    with pytest.raises(LLMOutputValidationError, match="unsupplied"):
        asyncio.run(
            generate_shortform_suggestion(
                cta_finding(),
                CTA_SEGMENTS,
                finding_id=SuggestionType.CTA,
                platform=ShortFormPlatform.TIKTOK,
                video_duration_seconds=30.0,
                provider=provider,
            )
        )


def test_opening_without_reliable_range_uses_generic_strategy() -> None:
    finding = opening_finding().model_copy(update={"ranges": ()})
    provider = FakeSuggestionGenerator(provider_output(indices=()))
    suggestion = asyncio.run(
        generate_shortform_suggestion(
            finding,
            (),
            finding_id=SuggestionType.OPENING,
            platform=ShortFormPlatform.TIKTOK,
            video_duration_seconds=30.0,
            provider=provider,
        )
    )
    assert suggestion.outcome is SuggestionOutcome.SUGGESTED
    assert suggestion.placement.strategy is SuggestionPlacementStrategy.OPENING_FIRST_SECONDS
    assert suggestion.placement.start_seconds is None
    assert suggestion.placement.end_seconds is None
    assert provider.calls == 1


def test_insufficient_context_returns_manual_review() -> None:
    provider = FakeSuggestionGenerator(provider_output())
    suggestion = asyncio.run(
        generate_shortform_suggestion(
            cta_finding(evidence=None),
            (segment(2, 24.1, 24.4, "Ok."),),
            finding_id=SuggestionType.CTA,
            platform=ShortFormPlatform.TIKTOK,
            video_duration_seconds=30.0,
            provider=provider,
        )
    )
    assert suggestion.outcome is SuggestionOutcome.REVIEW_MANUALLY
    assert suggestion.suggested_text is None
    assert provider.calls == 0


def test_bound_segments_drop_unrelated_speech() -> None:
    mixed = (
        segment(1, 0.2, 3.0, "Welcome back to another video about PC settings."),
        segment(2, 10.0, 12.0, "Middle of the video."),
        segment(3, 24.0, 26.0, "And that's the third setting."),
    )
    opening = bound_suggestion_segments(
        opening_finding(),
        mixed,
        video_duration_seconds=30.0,
    )
    ending = bound_suggestion_segments(
        cta_finding(),
        mixed,
        video_duration_seconds=30.0,
    )
    assert [item.index for item in opening] == [1]
    assert [item.index for item in ending] == [3]
