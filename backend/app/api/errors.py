import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.parsers.exceptions import TranscriptParseError, TranscriptTooLargeError
from app.parsers.srt import MAX_SRT_CHARACTERS
from app.schemas.errors import APIError, APIErrorCode, ErrorResponse
from app.services.compliance_engine import ComplianceInputError


logger = logging.getLogger("sponsorguard.api")


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, request_validation_handler)
    app.add_exception_handler(TranscriptTooLargeError, transcript_too_large_handler)
    app.add_exception_handler(TranscriptParseError, invalid_transcript_handler)
    app.add_exception_handler(ComplianceInputError, compliance_input_handler)
    app.add_exception_handler(Exception, internal_error_handler)


async def request_validation_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    assert isinstance(error, RequestValidationError)
    validation_errors = error.errors()
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


async def internal_error_handler(
    request: Request,
    error: Exception,
) -> JSONResponse:
    logger.error(
        "Unexpected API failure",
        extra={
            "event": "unexpected_api_error",
            "request_id": getattr(request.state, "request_id", None),
            "method": request.method,
            "path": request.url.path,
            "error_type": type(error).__name__,
        },
    )
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
