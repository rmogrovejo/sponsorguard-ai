import logging
import re
from time import perf_counter
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from starlette.types import ASGIApp

from app.api.errors import build_error_response
from app.schemas.errors import APIErrorCode


REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
_logger = logging.getLogger("sponsorguard.http")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        request_id = resolve_request_id(request.headers.get(REQUEST_ID_HEADER))
        request.state.request_id = request_id
        started_at = perf_counter()

        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id

        duration_ms = round((perf_counter() - started_at) * 1_000, 2)
        _logger.info(
            "HTTP request completed",
            extra={
                "event": "http_request_completed",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response


class RequestBodyLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, *, max_body_bytes: int) -> None:
        super().__init__(app)
        self.max_body_bytes = max_body_bytes

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                body_size = int(content_length)
            except ValueError:
                body_size = 0
            if body_size > self.max_body_bytes:
                return build_error_response(
                    code=APIErrorCode.TRANSCRIPT_TOO_LARGE,
                    message="The request body exceeds the allowed size.",
                    status_code=413,
                    details={"max_body_bytes": self.max_body_bytes},
                )
        return await call_next(request)


def resolve_request_id(candidate: str | None) -> str:
    if candidate is not None and _REQUEST_ID_PATTERN.fullmatch(candidate):
        return candidate
    return str(uuid4())
