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
