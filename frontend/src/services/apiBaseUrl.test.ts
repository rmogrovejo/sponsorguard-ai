import { describe, expect, it } from "vitest";

import { DEV_API_FALLBACK, resolveApiBaseUrl } from "./apiBaseUrl";

describe("resolveApiBaseUrl", () => {
  it("uses an explicit configured HTTPS origin", () => {
    expect(resolveApiBaseUrl("https://api.example.com/")).toBe("https://api.example.com");
  });

  it("keeps the local development fallback when not in production", () => {
    expect(resolveApiBaseUrl(undefined, { production: false })).toBe(DEV_API_FALLBACK);
  });

  it("does not hardcode localhost into a production bundle without a build variable", () => {
    expect(resolveApiBaseUrl(undefined, { production: true })).toBe("");
    expect(resolveApiBaseUrl("  ", { production: true })).toBe("");
  });
});
