# SponsorGuard backend

## SRT parsing policy

`app.parsers.parse_srt` accepts decoded Python text and returns immutable, validated `TranscriptSegment` models. It deliberately uses an atomic parsing policy: if any subtitle block is malformed, no partial result is returned. Skipping or guessing at corrupted blocks could shift timestamped evidence or conceal missing sponsorship language.

The parser applies these defensive rules:

- input is limited to 2,000,000 characters by default; callers can lower the explicit limit;
- a leading UTF-8 BOM, LF/CRLF line endings, extra blank separators, and trailing whitespace are supported;
- cue indices must be non-negative base-10 integers; their original numeric values are preserved, while transcript order always follows file order, so gaps and out-of-sequence values are accepted;
- timestamps may use canonical `HH:MM:SS,mmm` or the exporter variant `HH:MM:SS.mmm`, with two-digit minutes and seconds in the `00`–`59` range;
- subtitle text is normalized by collapsing Unicode whitespace to one space;
- Unicode content is otherwise preserved;
- malformed input raises a `TranscriptParseError` subtype with a stable `SRTErrorCode` and block/line context when available.

Byte decoding is intentionally outside the parser boundary. A file-upload boundary should decode bytes explicitly and convert decoding failures into an API error before calling the parser.

## Deterministic compliance policy

The compliance engine accepts validated requirement and transcript models and remains independent from FastAPI. Requirement results are returned in requirement order; transcript matching follows the supplied segment order and never sorts by cue index.

Matching uses Unicode NFKC normalization, Unicode whitespace normalization, and case folding. Targets are escaped and matched literally between Unicode word-character boundaries. This allows punctuation around a phrase or token while preventing matches inside larger alphanumeric or underscore-delimited tokens. Hyphens are treated as punctuation unless they are part of the required value itself. There is no fuzzy or semantic equivalence matching.

`required_mention_before` passes when the first matching segment starts at or before the deadline (`timestamp_seconds <= before_seconds`). A later match fails with evidence; a missing match fails without fabricated evidence.

`required_url` uses a separate deterministic URL identity rather than phrase matching. Requirement values may be bare domains/paths or HTTP(S) URLs. HTTP and HTTPS are equivalent, one leading `www.` label is ignored, hostname comparison is case-insensitive, IDN hostnames are converted to IDNA form, and one trailing path slash is ignored. The remaining path is case-sensitive and exact. Ports, query strings, and fragments are preserved and must match exactly; they are never discarded or reordered. Only HTTP(S) schemes and valid multi-label domain hostnames are accepted; user information and IP-address hosts are rejected. Transcript URLs are extracted from ordinary text, while the original segment text is retained unchanged as evidence.

Scores are calculated from evaluated requirements only and rounded to two decimal places using round-half-up. Invalid input collections raise `ComplianceInputError`; valid inputs that do not meet requirements produce normal `FAIL` results.

## Semantic verification policy

`required_talking_point` and `forbidden_claim` are the only semantic requirement types. They are evaluated through the separate `SemanticVerifier` protocol; the provider never receives or evaluates deterministic requirement types. `required_talking_point` maps provider `match` / `no_match` / `uncertain` decisions to PASS / FAIL / WARNING. `forbidden_claim` maps those decisions to FAIL / PASS / WARNING.

Transcript input is split deterministically into non-overlapping chunks of at most 30 excerpts and a 3,500-character serialized-text budget. An unusually long cue is split into non-overlapping excerpts that retain its original source index. A grounded match can stop evaluation early; a global no-match is returned only after every chunk is checked. If any chunk is uncertain and no later chunk matches, the result is WARNING. Duplicate SRT cue indices cannot be grounded unambiguously, so semantic verification returns NOT_EVALUATED without calling the provider.

The provider returns only a strict decision, supplied source segment indices, and a bounded reason. SponsorGuard validates every index against the exact chunk, then resolves the earliest referenced segment in transcript order to its original timestamp and untouched `TranscriptSegment.text`. Model-generated quote text is neither requested nor accepted as evidence.

Controlled provider failures—including timeouts, rate limits, configuration/authentication errors, malformed output, and invalid grounding—produce `NOT_EVALUATED` with `SEMANTIC_VERIFICATION_UNAVAILABLE` for semantic rules only. The overall API request still succeeds, and deterministic PASS/FAIL findings remain unchanged. Content uncertainty remains WARNING with a weight of 0.5. NOT_EVALUATED requirements are visible in the report but excluded from the compliance-score denominator.

Compliance score measures only evaluated content: `((PASS + WARNING × 0.5) / evaluated) × 100`. Verification coverage is `(evaluated / total) × 100`. Both use two-decimal round-half-up rounding. If no requirements were evaluated, `compliance_score` is `null` and coverage is `0.0`; this is deliberately neither a zero nor perfect content score.

The semantic prompt treats transcript text as untrusted data and explicitly rejects instructions embedded in it. This reduces prompt-injection risk but is not a claim of perfect protection; strict structured validation and source-index grounding remain the enforcement boundaries.

## HTTP API

Run the API locally from `backend/`:

```bash
python -m uvicorn app.main:app --reload
```

OpenAPI documentation is available at `http://127.0.0.1:8000/docs`. The health endpoint remains available at `GET /health`.

### Extract sponsor-brief requirements

`POST /api/v1/briefs/extract` sends only the sponsor brief to the configured backend provider. The provider returns strict structured data, which SponsorGuard validates and maps to the existing deterministic requirement domain. SponsorGuard—not the model—generates requirement IDs. The endpoint never receives a transcript and never makes a compliance decision.

Request:

```json
{
  "brief": "Mention AcmeVPN in the first 60 seconds, use code CREATOR25, and do not claim guaranteed anonymity."
}
```

Successful response:

```json
{
  "requirements": [
    {
      "id": "req_ai_0123456789abcdef0123456789abcdef",
      "type": "required_mention_before",
      "description": "Mention AcmeVPN in the first minute",
      "value": "AcmeVPN",
      "before_seconds": 60.0,
      "source_text": "Mention AcmeVPN in the first 60 seconds"
    }
  ],
  "meta": {
    "provider": "gemini",
    "model": "gemini-3.7-flash",
    "prompt_version": "2.0",
    "requirement_count": 1
  }
}
```

The shared extraction schema also supports `required_talking_point` for required meaning that permits paraphrase and `forbidden_claim` for prohibited meaning. Explicit coupon codes, URLs, timing, exact requested wording, and quoted forbidden phrases remain deterministic types. Provider output is untrusted and must pass Pydantic validation. Provenance is retained in `source_text`; self-reported confidence is intentionally omitted because it is not a validation signal.

Gemini is the default provider for the hackathon. Its adapter uses the official `google-genai` Python SDK, the Interactions API, and the JSON Schema derived from `BriefExtractionOutput`. The existing OpenAI adapter remains available. Both implement the same `LLMRequirementExtractor` protocol and reuse the same versioned extraction prompt; route handlers and business services contain no provider-specific branching.

The React workflow stages extracted rules for explicit human review. Reviewers can exclude proposed rules, append the rest to the existing checklist, and then edit or remove them through the same editor used for manual rules. Existing rules are never replaced by extraction.

If provider configuration or the provider itself is unavailable, the endpoint returns the normal safe error envelope. It never manufactures fallback rules. The brief and manual checklist remain available in React, so deterministic manual review remains usable.

### Analyze compliance

`POST /api/v1/compliance/analyze`

The same endpoint accepts deterministic and semantic requirements. It runs all deterministic rules first, evaluates only the semantic types through the semantic provider, and restores the original requirement order in one report. A controlled semantic-provider failure returns HTTP 200 with a visible NOT_EVALUATED finding rather than discarding otherwise valid deterministic findings.

```json
{
  "requirements": [
    {
      "id": "req_brand_timing",
      "type": "required_mention_before",
      "description": "Mention AcmeVPN before 01:00",
      "value": "AcmeVPN",
      "before_seconds": 60
    }
  ],
  "transcript": {
    "format": "srt",
    "content": "1\n00:00:38,000 --> 00:00:42,000\nToday's video is sponsored by AcmeVPN."
  }
}
```

Successful response:

```json
{
  "summary": {
    "total": 1,
    "evaluated": 1,
    "not_evaluated": 0,
    "passed": 1,
    "warnings": 0,
    "failed": 0,
    "compliance_score": 100.0,
    "verification_coverage": 100.0
  },
  "results": [
    {
      "requirement_id": "req_brand_timing",
      "status": "pass",
      "reason_code": "REQUIRED_MENTION_WITHIN_DEADLINE",
      "reason": "Required mention \"AcmeVPN\" was found at 00:38, within the 01:00 deadline.",
      "source_segment_index": 1,
      "timestamp_seconds": 38.0,
      "evidence": "Today's video is sponsored by AcmeVPN."
    }
  ]
}
```

Error response:

```json
{
  "error": {
    "code": "INVALID_TRANSCRIPT",
    "message": "The transcript could not be parsed.",
    "details": {
      "reason_code": "invalid_timestamp",
      "block_number": 1,
      "line_number": 2
    }
  }
}
```

Every handled response includes `X-Request-ID`. Caller values containing 1–128 safe ASCII letters, numbers, `.`, `_`, `:`, or `-` are preserved; other values are replaced with a generated UUID.

### HTTP status policy

- `200`: analysis completed, including legitimate compliance failures;
- `400`: structurally valid but semantically invalid input, unsupported transcript format, or malformed SRT;
- `413`: transcript or declared request body exceeds the configured limit;
- `429`: the extraction provider is temporarily rate limited;
- `422`: JSON or Pydantic request-contract validation failed;
- `502`: the extraction provider returned malformed or schema-invalid structured output;
- `503`: provider configuration, authentication, or availability prevents extraction;
- `504`: the extraction provider timed out;
- `500`: unexpected internal failure, returned without exception details.

The API logs method, path, status, duration, and request ID as JSON. Transcript bodies are not logged.

### Configuration

`SPONSORGUARD_ALLOWED_ORIGINS` accepts a comma-separated list of exact HTTP/HTTPS origins. Its development default is:

```text
http://localhost:5173,http://127.0.0.1:5173
```

Wildcard origins are rejected. `SPONSORGUARD_MAX_REQUEST_BODY_BYTES` optionally changes the default 2,100,000-byte declared request-body limit.

Copy `backend/.env.example` to the ignored local file `backend/.env`, set its backend-only values, and load it explicitly when starting Uvicorn:

```bash
python -m uvicorn app.main:app --reload --env-file .env
```

The application reads process environment variables and never sends provider credentials to React. `SPONSORGUARD_LLM_PROVIDER` selects the isolated adapter, and `SPONSORGUARD_LLM_MODEL` controls its exact model. When Gemini is selected and the model variable is omitted, the development fallback is `gemini-3.7-flash`. When OpenAI is explicitly selected without a model override, its fallback remains `gpt-5.6-luna`.

For Gemini development:

```dotenv
SPONSORGUARD_LLM_PROVIDER=gemini
SPONSORGUARD_LLM_MODEL=gemini-3.7-flash
SPONSORGUARD_LLM_TIMEOUT_SECONDS=20
SPONSORGUARD_SEMANTIC_TIMEOUT_SECONDS=60
GEMINI_API_KEY=your-gemini-api-key-here
```

For the retained OpenAI adapter, set `SPONSORGUARD_LLM_PROVIDER=openai`, an appropriate `SPONSORGUARD_LLM_MODEL`, and `OPENAI_API_KEY` instead. Never place either key in frontend configuration, logs, API responses, or source control. The local `.env` file is ignored and must not be committed.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | For Gemini extraction | Backend-only Gemini Developer API credential. |
| `OPENAI_API_KEY` | For OpenAI extraction | Backend-only OpenAI credential. |
| `SPONSORGUARD_LLM_PROVIDER` | No | `gemini` (default) or `openai`; unsupported names produce a controlled configuration error. |
| `SPONSORGUARD_LLM_MODEL` | No | Model for the selected provider; Gemini defaults to `gemini-3.7-flash`. |
| `SPONSORGUARD_LLM_TIMEOUT_SECONDS` | No | Brief-extraction timeout; defaults to `20` seconds. |
| `SPONSORGUARD_SEMANTIC_TIMEOUT_SECONDS` | No | Semantic-verification timeout; defaults to `60` seconds. |

The versioned extraction prompt lives in `app/integrations/llm/prompts.py`; the separate injection-resistant verification prompt lives in `app/integrations/llm/semantic_prompts.py`. Provider SDK usage is isolated under `app/integrations/llm/`, including `gemini_provider.py` for extraction and `gemini_semantic_provider.py` for semantic verification.
