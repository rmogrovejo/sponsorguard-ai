from typing import Annotated

from fastapi import APIRouter, File, Form, Request, UploadFile

from app.core.config import Settings
from app.schemas.errors import ErrorResponse
from app.schemas.shortform import ShortFormAnalyzeResponse
from app.services.media_errors import MediaInspectionError, MediaInspectionErrorCode
from app.services.shortform_preflight import analyze_shortform_video, parse_platform
from app.services.temp_media import temporary_upload


router = APIRouter(prefix="/shortform", tags=["shortform"])


@router.post(
    "/analyze",
    response_model=ShortFormAnalyzeResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid or unreadable media"},
        413: {"model": ErrorResponse, "description": "Video too large"},
        422: {"model": ErrorResponse, "description": "Request validation error"},
        500: {"model": ErrorResponse, "description": "Unexpected internal error"},
    },
)
async def analyze_shortform(
    request: Request,
    platform: Annotated[str, Form()],
    video: Annotated[UploadFile, File()],
) -> ShortFormAnalyzeResponse:
    try:
        resolved_platform = parse_platform(platform)
    except ValueError as error:
        raise MediaInspectionError(
            "Choose a supported short-form platform.",
            code=MediaInspectionErrorCode.UNSUPPORTED_MEDIA,
        ) from error

    settings: Settings = request.app.state.settings
    async with temporary_upload(
        video,
        max_bytes=settings.shortform_max_upload_bytes,
    ) as (path, display_name, size_bytes):
        report = analyze_shortform_video(
            path,
            platform=resolved_platform,
            display_filename=display_name,
            size_bytes=size_bytes,
        )
    return ShortFormAnalyzeResponse.from_domain(report)
