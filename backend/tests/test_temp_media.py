import asyncio
from io import BytesIO
from pathlib import Path

import pytest
from starlette.datastructures import Headers, UploadFile

from app.services.media_errors import MediaInspectionError, MediaInspectionErrorCode
from app.services.temp_media import temporary_upload


def fake_upload(filename: str, payload: bytes) -> UploadFile:
    return UploadFile(
        filename=filename,
        file=BytesIO(payload),
        headers=Headers({"content-type": "video/mp4"}),
    )


def test_temporary_upload_deletes_file_after_success() -> None:
    async def run() -> Path:
        async with temporary_upload(fake_upload("clip.mp4", b"abc123"), max_bytes=100) as (
            path,
            name,
            size,
        ):
            assert path.exists()
            assert name == "clip.mp4"
            assert size == 6
            return path

    retained = asyncio.run(run())
    assert not retained.exists()


def test_temporary_upload_deletes_file_after_failure() -> None:
    retained: Path | None = None

    async def run() -> None:
        nonlocal retained
        async with temporary_upload(fake_upload("clip.mp4", b"x" * 40), max_bytes=10) as (
            path,
            _name,
            _size,
        ):
            retained = path

    with pytest.raises(MediaInspectionError) as captured:
        asyncio.run(run())
    assert captured.value.code is MediaInspectionErrorCode.MEDIA_TOO_LARGE
    assert retained is None or not retained.exists()


def test_temporary_upload_uses_generated_name_not_upload_path() -> None:
    async def run() -> None:
        async with temporary_upload(
            fake_upload("../../etc/passwd.mp4", b"abc123"),
            max_bytes=100,
        ) as (path, name, _size):
            assert name == "passwd.mp4"
            assert "etc" not in str(path)
            assert path.name.startswith("cp_")
            assert path.suffix == ".mp4"

    asyncio.run(run())


def test_temporary_upload_deletes_file_after_unexpected_error() -> None:
    retained: Path | None = None

    async def run() -> None:
        nonlocal retained
        async with temporary_upload(fake_upload("clip.mp4", b"abc123"), max_bytes=100) as (
            path,
            _name,
            _size,
        ):
            retained = path
            raise RuntimeError("inspection crashed")

    with pytest.raises(RuntimeError, match="inspection crashed"):
        asyncio.run(run())
    assert retained is not None
    assert not retained.exists()


def test_temporary_upload_rejects_non_mp4_name() -> None:
    async def run() -> None:
        async with temporary_upload(fake_upload("clip.mov", b"abc"), max_bytes=100):
            pass

    with pytest.raises(MediaInspectionError) as captured:
        asyncio.run(run())
    assert captured.value.code is MediaInspectionErrorCode.UNSUPPORTED_MEDIA
