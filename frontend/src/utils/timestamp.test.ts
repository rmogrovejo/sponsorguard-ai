import { describe, expect, it } from "vitest";

import { formatTimestamp } from "./timestamp";

describe("formatTimestamp", () => {
  it("formats seconds, minutes, hours, and fractional seconds", () => {
    expect(formatTimestamp(38)).toBe("00:38");
    expect(formatTimestamp(68)).toBe("01:08");
    expect(formatTimestamp(3661.25)).toBe("01:01:01");
  });

  it("returns a safe placeholder for invalid values", () => {
    expect(formatTimestamp(-1)).toBe("--:--");
    expect(formatTimestamp(Number.NaN)).toBe("--:--");
  });
});
