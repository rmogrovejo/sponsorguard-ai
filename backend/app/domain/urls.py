import ipaddress
import re
from urllib.parse import SplitResult, urlsplit


class CampaignURLValidationError(ValueError):
    """Raised when a campaign URL cannot be normalized safely."""


_HOST_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_URL_TOKEN = re.compile(r'''[^\s\[\](){}<>"'“”‘’]+''')
_LEADING_SENTENCE_PUNCTUATION = ".,;:!?¡¿…"
_TRAILING_SENTENCE_PUNCTUATION = ".,;:!?¡¿…"


def normalize_campaign_url(value: object) -> str:
    """Return the deterministic identity used by REQUIRED_URL.

    HTTP and HTTPS are treated alike, one leading ``www.`` label is ignored,
    hostnames are IDNA-normalized and lowercased, and one trailing path slash
    is removed. Ports, paths, queries, and fragments otherwise remain exact.
    """

    if not isinstance(value, str):
        raise CampaignURLValidationError("campaign URL must be a string")

    candidate = value.strip()
    if not candidate:
        raise CampaignURLValidationError("campaign URL cannot be blank")
    if any(character.isspace() or ord(character) < 32 for character in candidate):
        raise CampaignURLValidationError("campaign URL cannot contain whitespace")

    parsed = _split_candidate(candidate)
    if parsed.username is not None or parsed.password is not None:
        raise CampaignURLValidationError("campaign URL cannot contain user information")

    hostname = parsed.hostname
    if hostname is None:
        raise CampaignURLValidationError("campaign URL must contain a hostname")
    normalized_host = _normalize_hostname(hostname)
    if normalized_host.startswith("www.") and normalized_host.count(".") >= 2:
        normalized_host = normalized_host[4:]

    try:
        port = parsed.port
    except ValueError as error:
        raise CampaignURLValidationError("campaign URL contains an invalid port") from error

    authority = normalized_host if port is None else f"{normalized_host}:{port}"
    path = parsed.path
    if path == "/":
        path = ""
    elif path.endswith("/"):
        path = path[:-1]

    normalized = f"{authority}{path}"
    if parsed.query:
        normalized += f"?{parsed.query}"
    if parsed.fragment:
        normalized += f"#{parsed.fragment}"
    return normalized


def extract_normalized_urls(text: str) -> tuple[str, ...]:
    """Extract valid URL-like tokens from ordinary transcript text.

    Tokens are split only at whitespace and common wrapping punctuation. Each
    candidate must independently pass the same strict URL validation used by
    the requirement domain.
    """

    normalized: list[str] = []
    for match in _URL_TOKEN.finditer(text):
        try:
            candidate = _strip_sentence_punctuation(match.group(0))
            normalized.append(normalize_campaign_url(candidate))
        except CampaignURLValidationError:
            continue
    return tuple(normalized)


def _split_candidate(candidate: str) -> SplitResult:
    lowered = candidate.casefold()
    if lowered.startswith(("http:", "https:")) and not lowered.startswith(
        ("http://", "https://")
    ):
        raise CampaignURLValidationError("campaign URL contains a malformed scheme")

    if "://" in candidate:
        try:
            parsed = urlsplit(candidate)
        except ValueError as error:
            raise CampaignURLValidationError("campaign URL is malformed") from error
        if parsed.scheme.casefold() not in {"http", "https"}:
            raise CampaignURLValidationError("campaign URL scheme must be HTTP or HTTPS")
        return parsed

    try:
        return urlsplit(f"//{candidate}")
    except ValueError as error:
        raise CampaignURLValidationError("campaign URL is malformed") from error


def _normalize_hostname(hostname: str) -> str:
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise CampaignURLValidationError("campaign URL must use a domain hostname")

    try:
        ascii_hostname = hostname.encode("idna").decode("ascii").casefold()
    except UnicodeError as error:
        raise CampaignURLValidationError("campaign URL hostname is malformed") from error

    if len(ascii_hostname) > 253 or "." not in ascii_hostname:
        raise CampaignURLValidationError("campaign URL hostname is malformed")

    labels = ascii_hostname.split(".")
    if any(not _HOST_LABEL.fullmatch(label) for label in labels):
        raise CampaignURLValidationError("campaign URL hostname is malformed")
    if len(labels[-1]) < 2 or labels[-1].isdigit():
        raise CampaignURLValidationError("campaign URL hostname is malformed")
    return ascii_hostname


def _strip_sentence_punctuation(value: str) -> str:
    return value.lstrip(_LEADING_SENTENCE_PUNCTUATION).rstrip(
        _TRAILING_SENTENCE_PUNCTUATION
    )
