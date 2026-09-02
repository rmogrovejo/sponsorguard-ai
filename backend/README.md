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

Scores are calculated as `((PASS + WARNING × 0.5) / total) × 100` and rounded to two decimal places using round-half-up. Invalid input collections raise `ComplianceInputError`; valid inputs that do not meet requirements produce normal `FAIL` results.

## HTTP API

Run the API locally from `backend/`:

```bash
python -m uvicorn app.main:app --reload
```

OpenAPI documentation is available at `http://127.0.0.1:8000/docs`. The health endpoint remains available at `GET /health`.

### Analyze compliance

`POST /api/v1/compliance/analyze`

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
    "passed": 1,
    "warnings": 0,
    "failed": 0,
    "compliance_score": 100.0
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
- `422`: JSON or Pydantic request-contract validation failed;
- `500`: unexpected internal failure, returned without exception details.

The API logs method, path, status, duration, and request ID as JSON. Transcript bodies are not logged.

### Configuration

`SPONSORGUARD_ALLOWED_ORIGINS` accepts a comma-separated list of exact HTTP/HTTPS origins. Its development default is:

```text
http://localhost:5173,http://127.0.0.1:5173
```

Wildcard origins are rejected. `SPONSORGUARD_MAX_REQUEST_BODY_BYTES` optionally changes the default 2,100,000-byte declared request-body limit.
