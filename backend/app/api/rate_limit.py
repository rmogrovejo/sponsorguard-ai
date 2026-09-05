from collections import deque
from time import monotonic

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from starlette.types import ASGIApp

from app.api.errors import build_error_response
from app.core.config import Settings
from app.schemas.errors import APIErrorCode


EXPENSIVE_PATHS = (
    "/api/v1/briefs/extract",
    "/api/v1/shortform/analyze",
    "/api/v1/shortform/suggestions/generate",
    "/api/v1/audience-pulse/analyze",
)
EXPENSIVE_PREFIXES = ("/api/v1/fixes/",)
STANDARD_PATHS = ("/api/v1/compliance/analyze",)
SKIP_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json")


class SlidingWindowLimiter:
    """Process-local sliding window. Honest for a single Uvicorn worker only."""

    def __init__(self, *, max_keys: int) -> None:
        self._max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str, *, limit: int, window_seconds: float) -> bool:
        now = monotonic()
        cutoff = now - window_seconds
        bucket = self._hits.setdefault(key, deque())
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        self._evict(cutoff)
        return True

    def _evict(self, cutoff: float) -> None:
        empty = [key for key, bucket in self._hits.items() if not bucket or bucket[-1] <= cutoff]
        for key in empty:
            del self._hits[key]
        overflow = len(self._hits) - self._max_keys
        if overflow <= 0:
            return
        oldest = sorted(self._hits, key=lambda key: self._hits[key][0] if self._hits[key] else 0)
        for key in oldest[:overflow]:
            del self._hits[key]


def classify_path(path: str) -> str | None:
    if path in SKIP_PREFIXES or any(path.startswith(prefix) for prefix in SKIP_PREFIXES):
        return None
    if path in EXPENSIVE_PATHS or any(path.startswith(prefix) for prefix in EXPENSIVE_PREFIXES):
        return "expensive"
    if path in STANDARD_PATHS:
        return "standard"
    return None


def client_identity(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()[:128] or "unknown"
    if request.client and request.client.host:
        return request.client.host[:128]
    return "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        super().__init__(app)
        self._settings = settings
        self._limiter = SlidingWindowLimiter(max_keys=settings.rate_limit_max_keys)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)
        bucket = classify_path(request.url.path)
        if bucket is None:
            return await call_next(request)

        limit = (
            self._settings.rate_limit_expensive_per_minute
            if bucket == "expensive"
            else self._settings.rate_limit_standard_per_minute
        )
        key = f"{bucket}:{client_identity(request)}"
        allowed = self._limiter.allow(
            key,
            limit=limit,
            window_seconds=self._settings.rate_limit_window_seconds,
        )
        if allowed:
            return await call_next(request)

        retry_after = max(1, int(self._settings.rate_limit_window_seconds))
        response = build_error_response(
            code=APIErrorCode.RATE_LIMITED,
            message="Too many requests. Wait a moment and try again.",
            status_code=429,
            details={"retry_after_seconds": retry_after},
        )
        response.headers["Retry-After"] = str(retry_after)
        request_id = getattr(request.state, "request_id", None)
        if request_id is not None:
            response.headers["X-Request-ID"] = request_id
        return response
