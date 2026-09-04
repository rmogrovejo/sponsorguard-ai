import { describe, expect, it } from "vitest";

import { inspectLogoFile, readRasterLogo } from "./logoValidation";
import { pngFile } from "./settingsTestFixtures";

describe("logo validation", () => {
  it("rejects SVG uploads", () => {
    const svg = new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "mark.svg", {
      type: "image/svg+xml",
    });
    expect(inspectLogoFile(svg)).toBe("svg");
  });

  it("rejects unsupported types including SVG-named files", () => {
    expect(inspectLogoFile(new File(["x"], "mark.gif", { type: "image/gif" }))).toBe("type");
    expect(inspectLogoFile(new File(["x"], "mark.svg", { type: "image/png" }))).toBe("svg");
  });

  it("rejects oversized files before reading", () => {
    const huge = pngFile();
    Object.defineProperty(huge, "size", { value: 200_000 });
    expect(inspectLogoFile(huge)).toBe("oversized");
  });

  it("accepts a small PNG", async () => {
    const result = await readRasterLogo(pngFile());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
      expect(result.dataUrl.toLowerCase()).not.toContain("svg");
    }
  });
});
