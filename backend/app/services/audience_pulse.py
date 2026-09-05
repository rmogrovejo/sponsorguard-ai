from __future__ import annotations

from app.domain.audience_pulse import (
    MAX_AUDIENCE_COMMENTS,
    MAX_COMMENTS_TEXT_CHARACTERS,
    AudienceComment,
    AudiencePulseReport,
    AudiencePulseSource,
    YouTubeVideoSnapshot,
)
from app.integrations.llm.audience_pulse_prompts import normalize_analysis_language
from app.integrations.llm.base import AudiencePulseAnalyzer
from app.integrations.llm.exceptions import LLMErrorCode, LLMProviderError
from app.integrations.youtube.client import YouTubeDataClient
from app.services.audience_pulse_aggregate import (
    aggregate_audience_pulse,
    empty_partial_report,
)
from app.services.audience_pulse_errors import (
    AudiencePulseInputError,
    AudiencePulseInputErrorCode,
)
from app.services.audience_pulse_normalize import (
    normalize_manual_comments,
    normalize_youtube_comments,
)


_LLM_ERROR_CODES = {
    LLMErrorCode.CONFIGURATION: "LLM_PROVIDER_CONFIGURATION_ERROR",
    LLMErrorCode.RATE_LIMIT: "LLM_PROVIDER_RATE_LIMITED",
    LLMErrorCode.TIMEOUT: "LLM_PROVIDER_TIMEOUT",
    LLMErrorCode.PROVIDER_UNAVAILABLE: "LLM_PROVIDER_UNAVAILABLE",
    LLMErrorCode.AUTHENTICATION: "LLM_PROVIDER_AUTHENTICATION_ERROR",
    LLMErrorCode.MALFORMED_OUTPUT: "LLM_PROVIDER_OUTPUT_INVALID",
    LLMErrorCode.OUTPUT_VALIDATION: "LLM_PROVIDER_OUTPUT_INVALID",
}


def map_llm_analysis_error_code(error: LLMProviderError) -> str:
    return _LLM_ERROR_CODES.get(error.code, "AUDIENCE_ANALYSIS_UNAVAILABLE")


class AudiencePulseService:
    def __init__(
        self,
        analyzer: AudiencePulseAnalyzer,
        youtube_client: YouTubeDataClient,
    ) -> None:
        self._analyzer = analyzer
        self._youtube = youtube_client

    async def analyze(
        self,
        *,
        youtube_url: str | None,
        comments_text: str | None,
        loaded_comments: tuple[AudienceComment, ...] | None = None,
        video: YouTubeVideoSnapshot | None = None,
        analysis_language: str = "en",
    ) -> AudiencePulseReport:
        has_url = bool(youtube_url and youtube_url.strip())
        has_text = bool(comments_text and comments_text.strip())
        has_loaded = bool(loaded_comments)

        modes = sum(1 for flag in (has_url, has_text, has_loaded) if flag)
        if modes != 1:
            raise AudiencePulseInputError(
                AudiencePulseInputErrorCode.INPUT_INVALID,
                "Provide exactly one of a YouTube URL, pasted comments, or loaded comments.",
            )

        if has_loaded:
            assert loaded_comments is not None
            if len(loaded_comments) > MAX_AUDIENCE_COMMENTS:
                raise AudiencePulseInputError(
                    AudiencePulseInputErrorCode.INPUT_INVALID,
                    "Loaded comments exceed the allowed sample size.",
                )
            comments = loaded_comments
            source = AudiencePulseSource.SESSION
            snapshot = video
        elif has_url:
            assert youtube_url is not None
            snapshot, raw = await self._youtube.fetch_public_comments(youtube_url)
            comments = normalize_youtube_comments(raw)
            source = AudiencePulseSource.YOUTUBE
        else:
            assert comments_text is not None
            if len(comments_text) > MAX_COMMENTS_TEXT_CHARACTERS:
                raise AudiencePulseInputError(
                    AudiencePulseInputErrorCode.INPUT_INVALID,
                    "The pasted comments exceed the allowed size.",
                )
            comments = normalize_manual_comments(comments_text)
            source = AudiencePulseSource.MANUAL
            snapshot = None

        try:
            provider_output = await self._analyzer.analyze_audience(
                comments,
                analysis_language=normalize_analysis_language(analysis_language),
            )
        except LLMProviderError as error:
            return empty_partial_report(
                source=source,
                comments=comments,
                video=snapshot,
                analysis_error_code=map_llm_analysis_error_code(error),
            )

        return aggregate_audience_pulse(
            source=source,
            comments=comments,
            provider=provider_output,
            video=snapshot,
        )
