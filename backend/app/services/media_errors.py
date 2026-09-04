from enum import StrEnum


class MediaInspectionErrorCode(StrEnum):
    EMPTY_UPLOAD = "empty_upload"
    UNSUPPORTED_MEDIA = "unsupported_media"
    CORRUPT_MEDIA = "corrupt_media"
    INVALID_DURATION = "invalid_duration"
    MEDIA_TOO_LARGE = "media_too_large"
    UNSAFE_FILENAME = "unsafe_filename"


class MediaInspectionError(ValueError):
    def __init__(self, message: str, *, code: MediaInspectionErrorCode) -> None:
        self.code = code
        super().__init__(message)
