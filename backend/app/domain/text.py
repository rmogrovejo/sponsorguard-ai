import unicodedata


def normalize_unicode_whitespace(value: str) -> str:
    """Collapse Unicode whitespace without altering non-whitespace content."""

    return " ".join(value.split())


def normalize_for_matching(value: str) -> str:
    """Normalize text for deterministic, case-insensitive matching."""

    compatibility_normalized = unicodedata.normalize("NFKC", value)
    return normalize_unicode_whitespace(compatibility_normalized).casefold()
