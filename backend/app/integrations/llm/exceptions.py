from enum import StrEnum


class LLMErrorCode(StrEnum):
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    AUTHENTICATION = "authentication"
    CONFIGURATION = "configuration"
    MALFORMED_OUTPUT = "malformed_output"
    OUTPUT_VALIDATION = "output_validation"


class LLMProviderError(RuntimeError):
    """Base class for expected failures at the provider boundary."""

    code: LLMErrorCode

    def __init__(self, message: str) -> None:
        super().__init__(message)


class LLMProviderUnavailableError(LLMProviderError):
    code = LLMErrorCode.PROVIDER_UNAVAILABLE


class LLMProviderTimeoutError(LLMProviderError):
    code = LLMErrorCode.TIMEOUT


class LLMRateLimitError(LLMProviderError):
    code = LLMErrorCode.RATE_LIMIT


class LLMAuthenticationError(LLMProviderError):
    code = LLMErrorCode.AUTHENTICATION


class LLMConfigurationError(LLMProviderError):
    code = LLMErrorCode.CONFIGURATION


class LLMMalformedOutputError(LLMProviderError):
    code = LLMErrorCode.MALFORMED_OUTPUT


class LLMOutputValidationError(LLMProviderError):
    code = LLMErrorCode.OUTPUT_VALIDATION
