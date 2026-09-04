import os
from dataclasses import dataclass, field
from math import isfinite
from urllib.parse import urlsplit


DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
DEFAULT_MAX_REQUEST_BODY_BYTES = 2_100_000
DEFAULT_SHORTFORM_MAX_UPLOAD_BYTES = 25_000_000
DEFAULT_LLM_PROVIDER = "gemini"
DEFAULT_GEMINI_MODEL = "gemini-3.7-flash"
DEFAULT_OPENAI_MODEL = "gpt-5.6-luna"
DEFAULT_LLM_TIMEOUT_SECONDS = 20.0
DEFAULT_SEMANTIC_TIMEOUT_SECONDS = 60.0


@dataclass(frozen=True, slots=True)
class Settings:
    allowed_origins: tuple[str, ...] = DEFAULT_ALLOWED_ORIGINS
    max_request_body_bytes: int = DEFAULT_MAX_REQUEST_BODY_BYTES
    shortform_max_upload_bytes: int = DEFAULT_SHORTFORM_MAX_UPLOAD_BYTES
    llm_provider: str = DEFAULT_LLM_PROVIDER
    llm_model: str | None = None
    gemini_api_key: str | None = field(default=None, repr=False)
    openai_api_key: str | None = field(default=None, repr=False)
    llm_timeout_seconds: float = DEFAULT_LLM_TIMEOUT_SECONDS
    semantic_timeout_seconds: float = DEFAULT_SEMANTIC_TIMEOUT_SECONDS

    def __post_init__(self) -> None:
        if self.max_request_body_bytes < 1:
            raise ValueError("max_request_body_bytes must be positive")
        if self.shortform_max_upload_bytes < 1:
            raise ValueError("shortform_max_upload_bytes must be positive")
        if not self.allowed_origins:
            raise ValueError("at least one allowed origin is required")
        if not self.llm_provider.strip():
            raise ValueError("llm_provider cannot be blank")
        if self.llm_model is not None and not self.llm_model.strip():
            raise ValueError("llm_model cannot be blank")
        if self.gemini_api_key is not None and not self.gemini_api_key.strip():
            raise ValueError("gemini_api_key cannot be blank")
        if self.openai_api_key is not None and not self.openai_api_key.strip():
            raise ValueError("openai_api_key cannot be blank")
        if not isfinite(self.llm_timeout_seconds) or self.llm_timeout_seconds <= 0:
            raise ValueError("llm_timeout_seconds must be a positive finite number")
        if (
            not isfinite(self.semantic_timeout_seconds)
            or self.semantic_timeout_seconds <= 0
        ):
            raise ValueError("semantic_timeout_seconds must be a positive finite number")
        for origin in self.allowed_origins:
            _validate_origin(origin)

    @property
    def resolved_llm_model(self) -> str:
        if self.llm_model is not None:
            return self.llm_model.strip()
        provider_defaults = {
            "gemini": DEFAULT_GEMINI_MODEL,
            "openai": DEFAULT_OPENAI_MODEL,
        }
        return provider_defaults.get(self.llm_provider.strip().lower(), "unconfigured")

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

        raw_shortform_limit = os.getenv("SPONSORGUARD_SHORTFORM_MAX_UPLOAD_BYTES")
        if raw_shortform_limit is None:
            shortform_limit = DEFAULT_SHORTFORM_MAX_UPLOAD_BYTES
        else:
            try:
                shortform_limit = int(raw_shortform_limit)
            except ValueError as error:
                raise ValueError(
                    "SPONSORGUARD_SHORTFORM_MAX_UPLOAD_BYTES must be an integer"
                ) from error

        raw_timeout = os.getenv("SPONSORGUARD_LLM_TIMEOUT_SECONDS")
        if raw_timeout is None:
            llm_timeout_seconds = DEFAULT_LLM_TIMEOUT_SECONDS
        else:
            try:
                llm_timeout_seconds = float(raw_timeout)
            except ValueError as error:
                raise ValueError(
                    "SPONSORGUARD_LLM_TIMEOUT_SECONDS must be a number"
                ) from error

        raw_semantic_timeout = os.getenv("SPONSORGUARD_SEMANTIC_TIMEOUT_SECONDS")
        if raw_semantic_timeout is None:
            semantic_timeout_seconds = DEFAULT_SEMANTIC_TIMEOUT_SECONDS
        else:
            try:
                semantic_timeout_seconds = float(raw_semantic_timeout)
            except ValueError as error:
                raise ValueError(
                    "SPONSORGUARD_SEMANTIC_TIMEOUT_SECONDS must be a number"
                ) from error

        gemini_api_key = _optional_environment_value("GEMINI_API_KEY")
        openai_api_key = _optional_environment_value("OPENAI_API_KEY")
        configured_model = os.getenv("SPONSORGUARD_LLM_MODEL")

        return cls(
            allowed_origins=allowed_origins,
            max_request_body_bytes=body_limit,
            shortform_max_upload_bytes=shortform_limit,
            llm_provider=os.getenv(
                "SPONSORGUARD_LLM_PROVIDER", DEFAULT_LLM_PROVIDER
            ).strip(),
            llm_model=(configured_model.strip() if configured_model is not None else None),
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
            llm_timeout_seconds=llm_timeout_seconds,
            semantic_timeout_seconds=semantic_timeout_seconds,
        )


def _optional_environment_value(name: str) -> str | None:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else None


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
