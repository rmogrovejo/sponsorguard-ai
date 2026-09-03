from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_exception_handlers
from app.api.health import router as health_router
from app.api.middleware import RequestBodyLimitMiddleware, RequestContextMiddleware
from app.api.v1.router import router as v1_router
from app.core.config import Settings
from app.core.logging import configure_logging
from app.integrations.llm.base import LLMRequirementExtractor
from app.integrations.llm.factory import create_requirement_extractor


def create_app(
    settings: Settings | None = None,
    requirement_extractor: LLMRequirementExtractor | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.from_environment()
    configure_logging()

    application = FastAPI(
        title="SponsorGuard API",
        description="API for automated creator sponsorship QA.",
        version="0.1.0",
    )
    application.state.requirement_extractor = (
        requirement_extractor or create_requirement_extractor(resolved_settings)
    )
    register_exception_handlers(application)
    application.include_router(health_router)
    application.include_router(v1_router)

    application.add_middleware(
        RequestBodyLimitMiddleware,
        max_body_bytes=resolved_settings.max_request_body_bytes,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    application.add_middleware(RequestContextMiddleware)
    return application


app = create_app()
