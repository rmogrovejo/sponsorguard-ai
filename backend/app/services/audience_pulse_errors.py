from enum import StrEnum


class YouTubeErrorCode(StrEnum):
    NOT_CONFIGURED = "not_configured"
    INVALID_URL = "invalid_url"
    VIDEO_NOT_FOUND = "video_not_found"
    COMMENTS_DISABLED = "comments_disabled"
    QUOTA_EXCEEDED = "quota_exceeded"
    AUTHENTICATION = "authentication"
    UNAVAILABLE = "unavailable"


class YouTubeClientError(Exception):
    def __init__(self, code: YouTubeErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class AudiencePulseInputErrorCode(StrEnum):
    INPUT_INVALID = "input_invalid"
    NO_COMMENTS = "no_comments"


class AudiencePulseInputError(Exception):
    def __init__(self, code: AudiencePulseInputErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
