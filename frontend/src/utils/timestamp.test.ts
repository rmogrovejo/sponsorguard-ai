import { describe, expect, it } from "vitest";

import { formatTimestamp, formatTimestampPrecise } from "./timestamp";

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

  it("formats hundredths for pacing ranges", () => {
    expect(formatTimestampPrecise(14.2)).toBe("00:14.20");
    expect(formatTimestampPrecise(16.62)).toBe("00:16.62");
    expect(formatTimestampPrecise(59.996)).toBe("01:00.00");
  });
});
