from typing import Literal

from app.domain.audience_pulse import AudienceComment, MAX_AUDIENCE_COMMENTS

MAX_AUDIENCE_PROVIDER_INPUT_CHARACTERS = 120_000

AnalysisLanguage = Literal["en", "es"]
SUPPORTED_ANALYSIS_LANGUAGES: tuple[AnalysisLanguage, ...] = ("en", "es")

_LANGUAGE_INSTRUCTION: dict[AnalysisLanguage, str] = {
    "en": (
        "Write every generated creator-facing analysis field in English: "
        "theme summaries and next-content opportunity titles."
    ),
    "es": (
        "Escribe todos los campos de análisis generados para el creador en español: "
        "resúmenes de temas y títulos de oportunidades de próximo contenido."
    ),
}


def normalize_analysis_language(value: str | None) -> AnalysisLanguage:
    if value is None or not value.strip():
        return "en"
    lowered = value.strip().lower()
    if lowered in SUPPORTED_ANALYSIS_LANGUAGES:
        return lowered
    raise ValueError("analysis_language must be 'en' or 'es'")


def build_audience_pulse_input(
    comments: tuple[AudienceComment, ...],
    *,
    analysis_language: AnalysisLanguage = "en",
) -> str:
    language = normalize_analysis_language(analysis_language)
    lines = [
        "Classify each audience comment into exactly one primary signal category.",
        "Categories:",
        "- positive: clear praise or appreciation (e.g. \"Great video\")",
        "- question: asks for information (e.g. \"Does this work on Windows 11?\")",
        "- content_request: asks for a follow-up or variant (e.g. AMD version / part 2)",
        "- funny: substantive playful joking, not empty reaction tokens alone",
        "- constructive_criticism: specific negative feedback that could guide a fix",
        "- negative: complaint or rejection without useful fix detail",
        "- confusion: does not understand a step or explanation",
        "- low_information: empty reactions, emoji-only, \"lol\", \"first\", or no useful signal",
        "Return classifications for every supplied comment id.",
        "Themes, reply_worthy, and opportunities must cite only supplied comment ids.",
        "Prefer actionable comments for themes/opportunities; skip low_information as evidence.",
        "reply_worthy kinds: question, request, criticism.",
        "Use the comment text as evidence; do not invent quotes.",
        _LANGUAGE_INSTRUCTION[language],
        "Do not translate original comment text, usernames, video titles, or channel names.",
        "Evidence must stay text-faithful to the supplied comments except existing safe normalization.",
        "Category enum values and comment ids remain unchanged English machine values.",
        "opportunities must be ideas for future videos or content pieces "
        "(for example: a Windows 11 compatibility follow-up, an AMD version, "
        "a laptop optimization video, or a Part 2 answering common questions).",
        "Do not list community-management actions as opportunities: "
        "replying, pinning a comment, adding a pinned clarification, or moderating comments. "
        "Those belong only in reply_worthy.",
        f"Comment count: {len(comments)} (max {MAX_AUDIENCE_COMMENTS}).",
        "",
        "COMMENTS:",
    ]
    for comment in comments:
        author = f" @{comment.author}" if comment.author else ""
        lines.append(f"[{comment.id}]{author}: {comment.text}")
    return "\n".join(lines)