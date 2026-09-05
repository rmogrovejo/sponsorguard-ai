import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.integrations.llm.exceptions import (
    LLMAuthenticationError,
    LLMConfigurationError,
    LLMMalformedOutputError,
    LLMOutputValidationError,
    LLMProviderError,
    LLMProviderTimeoutError,
    LLMProviderUnavailableError,
    LLMRateLimitError,
)
from app.parsers.exceptions import TranscriptParseError, TranscriptTooLargeError
from app.parsers.srt import MAX_SRT_CHARACTERS
from app.schemas.errors import APIError, APIErrorCode, ErrorResponse
from app.services.audience_pulse_errors import (
    AudiencePulseInputError,
    AudiencePulseInputErrorCode,
    YouTubeClientError,
    YouTubeErrorCode,
)
from app.services.brief_extraction import MAX_BRIEF_CHARACTERS
from app.services.compliance_engine import ComplianceInputError
from app.services.fix_generation import (
    FixGenerationInputError,
    FixGenerationInputErrorCode,
)
from app.services.media_errors import MediaInspectionError, MediaInspectionErrorCode
from app.services.shortform_suggestions import (
    SuggestionInputError,
    SuggestionInputErrorCode,
)


logger = logging.getLogger("sponsorguard.api")


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, request_validation_handler)
    app.add_exception_handler(TranscriptTooLargeError, transcript_too_large_handler)
    app.add_exception_handler(TranscriptParseError, invalid_transcript_handler)
    app.add_exception_handler(ComplianceInputError, compliance_input_handler)
    app.add_exception_handler(FixGenerationInputError, fix_input_handler)
    app.add_exception_handler(SuggestionInputError, suggestion_input_handler)
    app.add_exception_handler(MediaInspectionError, media_inspection_handler)
    app.add_exception_handler(AudiencePulseInputError, audience_pulse_input_handler)
    app.add_exception_handler(YouTubeClientError, youtube_client_error_handler)
    app.add_exception_handler(LLMProviderError, llm_provider_error_handler)
    app.add_exception_handler(Exception, internal_error_handler)


async def request_validation_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, RequestValidationError)
    validation_errors = error.errors()
    if _contains_oversized_brief(validation_errors):
        return build_error_response(
            code=APIErrorCode.BRIEF_TOO_LARGE,
            message="The sponsor brief exceeds the allowed size.",
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            details={"max_characters": MAX_BRIEF_CHARACTERS},
        )
    if _contains_unsupported_transcript_format(validation_errors):
        return build_error_response(
            code=APIErrorCode.UNSUPPORTED_TRANSCRIPT_FORMAT,
            message="Only the 'srt' transcript format is supported.",
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"supported_formats": ["srt"]},
        )

    issues = [
        {
            "location": list(item.get("loc", ())),
            "message": str(item.get("msg", "Invalid value.")),
            "type": str(item.get("type", "validation_error")),
        }
        for item in validation_errors
    ]
    return build_error_response(
        code=APIErrorCode.REQUEST_VALIDATION_ERROR,
        message="The request payload is invalid.",
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        details={"issues": issues},
    )


async def transcript_too_large_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, TranscriptTooLargeError)
    return build_error_response(
        code=APIErrorCode.TRANSCRIPT_TOO_LARGE,
        message="The transcript exceeds the allowed size.",
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        details={"max_characters": MAX_SRT_CHARACTERS},
    )


async def invalid_transcript_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, TranscriptParseError)
    details: dict[str, Any] = {"reason_code": error.code.value}
    if error.block_number is not None:
        details["block_number"] = error.block_number
    if error.line_number is not None:
        details["line_number"] = error.line_number
    return build_error_response(
        code=APIErrorCode.INVALID_TRANSCRIPT,
        message="The transcript could not be parsed.",
        status_code=status.HTTP_400_BAD_REQUEST,
        details=details,
    )


async def compliance_input_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, ComplianceInputError)
    return build_error_response(
        code=APIErrorCode.INVALID_COMPLIANCE_INPUT,
        message="The compliance request is invalid.",
        status_code=status.HTTP_400_BAD_REQUEST,
        details={"reason_code": error.code.value},
    )


async def fix_input_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, FixGenerationInputError)
    code = (
        APIErrorCode.FIX_NOT_ELIGIBLE
        if error.code is FixGenerationInputErrorCode.INELIGIBLE_FINDING
        else APIErrorCode.INVALID_FIX_INPUT
    )
    message = (
        "This finding is not eligible for a generated fix."
        if code is APIErrorCode.FIX_NOT_ELIGIBLE
        else "The fix-generation request is inconsistent with the transcript."
    )
    return build_error_response(
        code=code,
        message=message,
        status_code=status.HTTP_400_BAD_REQUEST,
        details={"reason_code": error.code.value},
    )


async def suggestion_input_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, SuggestionInputError)
    code = (
        APIErrorCode.SUGGESTION_NOT_ELIGIBLE
        if error.code is SuggestionInputErrorCode.INELIGIBLE_FINDING
        else APIErrorCode.INVALID_SUGGESTION_INPUT
    )
    message = (
        "This finding is not eligible for a suggestion."
        if code is APIErrorCode.SUGGESTION_NOT_ELIGIBLE
        else "The suggestion request does not match the Short-Form finding."
    )
    return build_error_response(
        code=code,
        message=message,
        status_code=status.HTTP_400_BAD_REQUEST,
        details={"reason_code": error.code.value},
    )


async def media_inspection_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, MediaInspectionError)
    if error.code is MediaInspectionErrorCode.MEDIA_TOO_LARGE:
        return build_error_response(
            code=APIErrorCode.MEDIA_TOO_LARGE,
            message="The video exceeds the allowed size.",
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            details={"reason_code": error.code.value},
        )
    if error.code is MediaInspectionErrorCode.EMPTY_UPLOAD:
        message = "Upload an MP4 video before running preflight."
        code = APIErrorCode.INVALID_MEDIA
    elif error.code in {
        MediaInspectionErrorCode.UNSUPPORTED_MEDIA,
        MediaInspectionErrorCode.CORRUPT_MEDIA,
        MediaInspectionErrorCode.UNSAFE_FILENAME,
    }:
        message = "The uploaded file is not a readable MP4 video."
        code = APIErrorCode.UNSUPPORTED_MEDIA
    else:
        message = "The video could not be inspected."
        code = APIErrorCode.INVALID_MEDIA
    return build_error_response(
        code=code,
        message=message,
        status_code=status.HTTP_400_BAD_REQUEST,
        details={"reason_code": error.code.value},
    )


async def audience_pulse_input_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, AudiencePulseInputError)
    if error.code is AudiencePulseInputErrorCode.NO_COMMENTS:
        return build_error_response(
            code=APIErrorCode.AUDIENCE_PULSE_NO_COMMENTS,
            message="No comments were available to analyze.",
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"reason_code": error.code.value},
        )
    return build_error_response(
        code=APIErrorCode.AUDIENCE_PULSE_INPUT_INVALID,
        message="Provide exactly one of a YouTube URL or pasted comments.",
        status_code=status.HTTP_400_BAD_REQUEST,
        details={"reason_code": error.code.value},
    )


async def youtube_client_error_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, YouTubeClientError)
    mapping = {
        YouTubeErrorCode.NOT_CONFIGURED: (
            APIErrorCode.YOUTUBE_NOT_CONFIGURED,
            "YouTube comment retrieval is not configured on this server.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        ),
        YouTubeErrorCode.INVALID_URL: (
            APIErrorCode.YOUTUBE_INVALID_URL,
            "Enter a valid YouTube or YouTube Shorts URL.",
            status.HTTP_400_BAD_REQUEST,
        ),
        YouTubeErrorCode.VIDEO_NOT_FOUND: (
            APIErrorCode.YOUTUBE_VIDEO_NOT_FOUND,
            "That YouTube video was not found or is not public.",
            status.HTTP_404_NOT_FOUND,
        ),
        YouTubeErrorCode.COMMENTS_DISABLED: (
            APIErrorCode.YOUTUBE_COMMENTS_DISABLED,
            "Comments are disabled or unavailable for this video.",
            status.HTTP_400_BAD_REQUEST,
        ),
        YouTubeErrorCode.QUOTA_EXCEEDED: (
            APIErrorCode.YOUTUBE_QUOTA_EXCEEDED,
            "YouTube API quota was exceeded. Try again later or paste comments.",
            status.HTTP_429_TOO_MANY_REQUESTS,
        ),
        YouTubeErrorCode.AUTHENTICATION: (
            APIErrorCode.YOUTUBE_NOT_CONFIGURED,
            "YouTube comment retrieval is not available because authentication failed.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        ),
        YouTubeErrorCode.UNAVAILABLE: (
            APIErrorCode.YOUTUBE_UNAVAILABLE,
            "YouTube is temporarily unavailable.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        ),
    }
    code, message, status_code = mapping[error.code]
    logger.warning(
        "Controlled YouTube client failure",
        extra={
            "event": "youtube_client_failed",
            "request_id": getattr(request.state, "request_id", None),
            "method": request.method,
            "path": request.url.path,
            "error_code": error.code.value,
        },
    )
    return build_error_response(
        code=code,
        message=message,
        status_code=status_code,
        details={"reason_code": error.code.value},
    )


async def llm_provider_error_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, LLMProviderError)
    is_fix_request = request.url.path.startswith("/api/v1/fixes/")
    is_suggestion_request = "/shortform/suggestions/" in request.url.path
    is_audience_request = "/audience-pulse/" in request.url.path
    if is_audience_request:
        operation = "audience"
        event = "audience_pulse_failed"
        log_message = "Controlled Audience Pulse failure"
    elif is_suggestion_request:
        operation = "suggestion"
        event = "shortform_suggestion_failed"
        log_message = "Controlled short-form suggestion failure"
    elif is_fix_request:
        operation = "fix"
        event = "fix_generation_failed"
        log_message = "Controlled fix generation failure"
    else:
        operation = "extraction"
        event = "brief_extraction_failed"
        log_message = "Controlled requirement extraction failure"
    code, message, status_code = _llm_error_response_policy(
        error,
        operation=operation,
    )
    logger.warning(
        log_message,
        extra={
            "event": event,
            "request_id": getattr(request.state, "request_id", None),
            "method": request.method,
            "path": request.url.path,
            "error_code": error.code.value,
        },
    )
    return build_error_response(
        code=code,
        message=message,
        status_code=status_code,
        details={"reason_code": error.code.value},
    )


async def internal_error_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    settings = getattr(request.app.state, "settings", None)
    log_kwargs: dict[str, object] = {
        "extra": {
            "event": "unexpected_api_error",
            "request_id": getattr(request.state, "request_id", None),
            "method": request.method,
            "path": request.url.path,
            "error_type": type(error).__name__,
        }
    }
    if settings is None or not getattr(settings, "is_production", False):
        log_kwargs["exc_info"] = error
    logger.error("Unexpected API failure", **log_kwargs)
    response = build_error_response(
        code=APIErrorCode.INTERNAL_SERVER_ERROR,
        message="An unexpected internal error occurred.",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
    request_id = getattr(request.state, "request_id", None)
    if request_id is not None:
        response.headers["X-Request-ID"] = request_id
    return response


def build_error_response(
    *,
    code: APIErrorCode,
    message: str,
    status_code: int,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=APIError(code=code, message=message, details=details)
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(mode="json"),
    )


def _contains_unsupported_transcript_format(
    errors: list[dict[str, Any]],
) -> bool:
    for item in errors:
        location = tuple(item.get("loc", ()))
        supplied_value = item.get("input")
        if (
            location == ("body", "transcript", "format")
            and isinstance(supplied_value, str)
            and supplied_value != "srt"
        ):
            return True
    return False


def _contains_oversized_brief(errors: list[dict[str, Any]]) -> bool:
    return any(
        tuple(item.get("loc", ())) == ("body", "brief")
        and item.get("type") == "string_too_long"
        for item in errors
    )


def _llm_error_response_policy(
    error: LLMProviderError,
    *,
    operation: str = "extraction",
) -> tuple[APIErrorCode, str, int]:
    if operation == "fix":
        label = "Fix generation"
    elif operation == "suggestion":
        label = "Suggestion generation"
    elif operation == "audience":
        label = "Audience Pulse analysis"
    else:
        label = "Requirement extraction"
    if isinstance(error, LLMProviderTimeoutError):
        return (
            APIErrorCode.LLM_PROVIDER_TIMEOUT,
            f"{label} timed out.",
            status.HTTP_504_GATEWAY_TIMEOUT,
        )
    if isinstance(error, LLMRateLimitError):
        return (
            APIErrorCode.LLM_PROVIDER_RATE_LIMITED,
            f"{label} is temporarily rate limited.",
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
    if isinstance(error, LLMAuthenticationError):
        return (
            APIErrorCode.LLM_PROVIDER_AUTHENTICATION_ERROR,
            f"{label} is not available because provider authentication failed.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if isinstance(error, LLMConfigurationError):
        return (
            APIErrorCode.LLM_PROVIDER_CONFIGURATION_ERROR,
            f"{label} is not configured on this server.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if isinstance(error, (LLMMalformedOutputError, LLMOutputValidationError)):
        return (
            APIErrorCode.LLM_PROVIDER_OUTPUT_INVALID,
            f"{label} returned an invalid structured result.",
            status.HTTP_502_BAD_GATEWAY,
        )
    if isinstance(error, LLMProviderUnavailableError):
        return (
            APIErrorCode.LLM_PROVIDER_UNAVAILABLE,
            f"{label} is temporarily unavailable.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return (
        APIErrorCode.LLM_PROVIDER_UNAVAILABLE,
        f"{label} is temporarily unavailable.",
        status.HTTP_503_SERVICE_UNAVAILABLE,
    )
