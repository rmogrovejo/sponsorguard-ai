import asyncio
import json
from types import SimpleNamespace

import pytest

from app.integrations.llm.exceptions import (
    LLMMalformedOutputError,
    LLMOutputValidationError,
)
from app.integrations.llm.openai_provider import OpenAIRequirementExtractor
from app.integrations.llm.prompts import BRIEF_EXTRACTION_INSTRUCTIONS


class FakeResponses:
    def __init__(self, output_text: str) -> None:
        self.output_text = output_text
        self.arguments: dict[str, object] = {}

    async def create(self, **kwargs: object) -> object:
        self.arguments = kwargs
        return SimpleNamespace(output_text=self.output_text)


class FakeClient:
    def __init__(self, output_text: str) -> None:
        self.responses = FakeResponses(output_text)


def provider_with_output(output_text: str) -> tuple[OpenAIRequirementExtractor, FakeClient]:
    client = FakeClient(output_text)
    provider = OpenAIRequirementExtractor(
        api_key="test-key-not-a-secret",
        model="test-model",
        timeout_seconds=1,
        client=client,
    )
    return provider, client


def test_provider_uses_versioned_instructions_and_strict_json_schema() -> None:
    payload = {
        "requirements": [
            {
                "type": "required_exact_token",
                "description": "Use the exact code",
                "value": "CREATOR25",
                "before_seconds": None,
                "source_text": "Use code CREATOR25.",
            }
        ]
    }
    provider, client = provider_with_output(json.dumps(payload))

    result = asyncio.run(provider.extract_structured_requirements("Use code CREATOR25."))

    assert result.requirements[0].value == "CREATOR25"
    assert client.responses.arguments["instructions"] == BRIEF_EXTRACTION_INSTRUCTIONS
    assert client.responses.arguments["input"] == "Use code CREATOR25."
    assert client.responses.arguments["store"] is False
    text_format = client.responses.arguments["text"]
    assert isinstance(text_format, dict)
    assert text_format["format"]["type"] == "json_schema"
    assert text_format["format"]["strict"] is True
    assert "required_url" in text_format["format"]["schema"]["$defs"][
        "RequirementType"
    ]["enum"]


def test_provider_rejects_arbitrary_prose_instead_of_regex_parsing() -> None:
    provider, _ = provider_with_output("Mention AcmeVPN before one minute.")

    with pytest.raises(LLMMalformedOutputError):
        asyncio.run(provider.extract_structured_requirements("A brief"))


def test_provider_rejects_structured_output_with_unknown_rule_type() -> None:
    provider, _ = provider_with_output(
        json.dumps(
            {
                "requirements": [
                    {
                        "type": "semantic_claim",
                        "description": "Infer a claim",
                        "value": "private",
                        "before_seconds": None,
                        "source_text": "Be private.",
                    }
                ]
            }
        )
    )

    with pytest.raises(LLMOutputValidationError):
        asyncio.run(provider.extract_structured_requirements("A brief"))
