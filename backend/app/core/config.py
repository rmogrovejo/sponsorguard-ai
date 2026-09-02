import os
from dataclasses import dataclass
from urllib.parse import urlsplit


DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
DEFAULT_MAX_REQUEST_BODY_BYTES = 2_100_000


@dataclass(frozen=True, slots=True)
class Settings:
    allowed_origins: tuple[str, ...] = DEFAULT_ALLOWED_ORIGINS
    max_request_body_bytes: int = DEFAULT_MAX_REQUEST_BODY_BYTES

    def __post_init__(self) -> None:
        if self.max_request_body_bytes < 1:
            raise ValueError("max_request_body_bytes must be positive")
        if not self.allowed_origins:
            raise ValueError("at least one allowed origin is required")
        for origin in self.allowed_origins:
            _validate_origin(origin)

    @classmethod
    def from_environment(cls) -> "Settings":
        raw_origins = os.getenv("SPONSORGUARD_ALLOWED_ORIGINS")
        allowed_origins = (
            tuple(item.strip() for item in raw_origins.split(",") if item.strip())
            if raw_origins is not None
            else DEFAULT_ALLOWED_ORIGINS
        )

        raw_body_limit = os.getenv("SPONSORGUARD_MAX_REQUEST_BODY_BYTES")
        if raw_body_limit is None:
            body_limit = DEFAULT_MAX_REQUEST_BODY_BYTES
        else:
            try:
                body_limit = int(raw_body_limit)
            except ValueError as error:
                raise ValueError(
                    "SPONSORGUARD_MAX_REQUEST_BODY_BYTES must be an integer"
                ) from error

        return cls(
            allowed_origins=allowed_origins,
            max_request_body_bytes=body_limit,
        )


def _validate_origin(origin: str) -> None:
    if origin == "*":
        raise ValueError("wildcard CORS origins are not allowed")

    parsed = urlsplit(origin)
    try:
        parsed_port = parsed.port
    except ValueError as error:
        raise ValueError(f"invalid CORS origin: {origin!r}") from error
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed_port is not None and not 1 <= parsed_port <= 65_535
        or parsed.path
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(f"invalid CORS origin: {origin!r}")
