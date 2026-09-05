import { describe, expect, it } from "vitest";

import { sampleCommentsText } from "./sampleComments";

describe("sampleCommentsText", () => {
  it("samples one comment per non-empty line and caps", () => {
    const lines = Array.from({ length: 250 }, (_, index) => `comment ${index}`);
    const result = sampleCommentsText(lines.join("\n"), 200);
    expect(result.kept).toBe(200);
    expect(result.totalLines).toBe(250);
    expect(result.truncated).toBe(true);
    expect(result.text.split("\n")).toHaveLength(200);
  });

  it("ignores blank lines", () => {
    const result = sampleCommentsText("a\n\n  \nb\n");
    expect(result.kept).toBe(2);
    expect(result.truncated).toBe(false);
  });
});
