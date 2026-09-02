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
