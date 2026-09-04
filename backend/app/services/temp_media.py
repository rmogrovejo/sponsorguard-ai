import os
import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.services.media_errors import MediaInspectionError, MediaInspectionErrorCode
from app.services.media_inspection import SUPPORTED_VIDEO_SUFFIXES, sanitize_display_filename


def suffix_from_filename(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_VIDEO_SUFFIXES:
        raise MediaInspectionError(
            "Only MP4 video uploads are supported.",
            code=MediaInspectionErrorCode.UNSUPPORTED_MEDIA,
        )
    return suffix


@asynccontextmanager
async def temporary_upload(
    upload: UploadFile,
    *,
    max_bytes: int,
) -> AsyncIterator[tuple[Path, str, int]]:
    """Write the upload to a generated temp path and always delete it."""

    display_name = sanitize_display_filename(upload.filename)
    suffix = suffix_from_filename(display_name)
    handle = tempfile.NamedTemporaryFile(
        prefix=f"cp_{uuid4().hex}_",
        suffix=suffix,
        delete=False,
    )
    path = Path(handle.name)
    size = 0
    try:
        while True:
            chunk = await upload.read(64 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                raise MediaInspectionError(
                    "The video exceeds the allowed size.",
                    code=MediaInspectionErrorCode.MEDIA_TOO_LARGE,
                )
            handle.write(chunk)
        handle.close()
        if size < 1:
            raise MediaInspectionError(
                "The uploaded file is empty.",
                code=MediaInspectionErrorCode.EMPTY_UPLOAD,
            )
        yield path, display_name, size
    finally:
        handle.close()
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
