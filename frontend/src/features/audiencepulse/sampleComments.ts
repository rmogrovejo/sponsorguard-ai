import { MAX_AUDIENCE_COMMENTS } from "../../types/audiencePulse";

export interface CommentSampleResult {
  text: string;
  totalLines: number;
  kept: number;
  truncated: boolean;
}

/** Client-side sampling: one comment per non-empty line, capped. */
export function sampleCommentsText(raw: string, max = MAX_AUDIENCE_COMMENTS): CommentSampleResult {
  const lines = raw.split(/\r?\n/);
  const keptLines: string[] = [];
  let totalNonEmpty = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalNonEmpty += 1;
    if (keptLines.length < max) {
      keptLines.push(trimmed);
    }
  }
  return {
    text: keptLines.join("\n"),
    totalLines: totalNonEmpty,
    kept: keptLines.length,
    truncated: totalNonEmpty > keptLines.length,
  };
}
