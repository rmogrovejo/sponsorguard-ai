import pytest

from app.domain.audience_pulse import AudienceComment
from app.integrations.llm.audience_pulse_prompts import (
    build_audience_pulse_input,
    normalize_analysis_language,
)


def test_normalize_analysis_language() -> None:
    assert normalize_analysis_language(None) == "en"
    assert normalize_analysis_language("EN") == "en"
    assert normalize_analysis_language("es") == "es"
    with pytest.raises(ValueError):
        normalize_analysis_language("fr")


def test_spanish_instruction_does_not_translate_comments() -> None:
    comments = (
        AudienceComment(id="c1", text="Does this work on Windows 11?"),
        AudienceComment(id="c2", text="Make an AMD version"),
    )
    prompt = build_audience_pulse_input(comments, analysis_language="es")
    assert "en español" in prompt
    assert "Do not translate original comment text" in prompt
    assert "pinning a comment" in prompt
    assert "[c1]: Does this work on Windows 11?" in prompt
    assert "[c2]: Make an AMD version" in prompt
    assert "¿Funciona" not in prompt


def test_english_instruction_keeps_generated_language_english() -> None:
    comments = (AudienceComment(id="c1", text="Make an AMD version"),)
    prompt = build_audience_pulse_input(comments, analysis_language="en")
    assert "Write every generated creator-facing analysis field in English" in prompt
    assert "[c1]: Make an AMD version" in prompt
