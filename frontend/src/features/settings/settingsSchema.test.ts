import { describe, expect, it, vi } from "vitest";

import {
  MAX_PRODUCT_NAME,
} from "./settingsKeys";
import {
  defaultSettings,
  isSafeLogoDataUrl,
  parseWorkspaceSettings,
  validateWorkspaceSettings,
} from "./settingsSchema";
import { sampleSettings } from "./settingsTestFixtures";

describe("settings schema validation", () => {
  it("accepts default settings", () => {
    const parsed = parseWorkspaceSettings(JSON.stringify(defaultSettings()));
    expect(parsed).toMatchObject({
      version: 1,
      brand: { productName: "CreatorPreflight", markText: "CP", markMode: "text" },
      appearance: { accent: "terracotta", density: "comfortable", colorMode: "system" },
      preferences: { defaultPlatform: "tiktok", motion: "system", language: "en" },
    });
  });

  it("accepts a valid branded document", () => {
    const parsed = parseWorkspaceSettings(JSON.stringify(sampleSettings()));
    expect(typeof parsed === "string").toBe(false);
    if (typeof parsed === "string") return;
    expect(parsed.brand.productName).toBe("StudioPreflight");
    expect(parsed.appearance.accent).toBe("olive");
  });

  it("rejects invalid JSON", () => {
    expect(parseWorkspaceSettings("{not-json")).toBe("invalid_json");
  });

  it("rejects the wrong version", () => {
    expect(parseWorkspaceSettings(JSON.stringify({ ...sampleSettings(), version: 2 }))).toBe(
      "wrong_version",
    );
  });

  it("rejects an unknown accent", () => {
    expect(
      validateWorkspaceSettings({
        ...sampleSettings(),
        appearance: { ...sampleSettings().appearance, accent: "neon" },
      }),
    ).toBe("invalid_schema");
  });

  it("rejects an unknown font enum", () => {
    expect(
      validateWorkspaceSettings({
        ...sampleSettings(),
        appearance: { ...sampleSettings().appearance, headingFont: "comic" },
      }),
    ).toBe("invalid_schema");
  });

  it("rejects invalid density and platform", () => {
    expect(
      validateWorkspaceSettings({
        ...sampleSettings(),
        appearance: { ...sampleSettings().appearance, density: "dense" },
      }),
    ).toBe("invalid_schema");
    expect(
      validateWorkspaceSettings({
        ...sampleSettings(),
        preferences: { ...sampleSettings().preferences, defaultPlatform: "linkedin" },
      }),
    ).toBe("invalid_schema");
  });

  it("rejects malformed and external logo data", () => {
    expect(
      validateWorkspaceSettings({
        ...sampleSettings(),
        brand: {
          ...sampleSettings().brand,
          markMode: "image",
          logoDataUrl: "https://example.com/logo.png",
        },
      }),
    ).toBe("invalid_schema");
    expect(
      validateWorkspaceSettings({
        ...sampleSettings(),
        brand: {
          ...sampleSettings().brand,
          markMode: "image",
          logoDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
        },
      }),
    ).toBe("invalid_schema");
    expect(isSafeLogoDataUrl("data:image/svg+xml;base64,AAAA")).toBe(false);
  });

  it("rejects an overlong product name instead of truncating", () => {
    expect(
      validateWorkspaceSettings({
        ...sampleSettings(),
        brand: {
          ...sampleSettings().brand,
          productName: "N".repeat(MAX_PRODUCT_NAME + 1),
        },
      }),
    ).toBe("invalid_schema");
  });

  it("rejects multiline brand copy", () => {
    expect(
      validateWorkspaceSettings({
        ...sampleSettings(),
        brand: { ...sampleSettings().brand, tagline: "One\nTwo" },
      }),
    ).toBe("invalid_schema");
  });

  it("defaults missing language from the browser and missing colorMode to light", () => {
    vi.stubGlobal("navigator", { language: "es-MX", languages: ["es-MX"] });
    const legacy = sampleSettings();
    const raw = {
      ...legacy,
      appearance: {
        accent: legacy.appearance.accent,
        headingFont: legacy.appearance.headingFont,
        interfaceFont: legacy.appearance.interfaceFont,
        density: legacy.appearance.density,
      },
      preferences: {
        defaultPlatform: legacy.preferences.defaultPlatform,
        motion: legacy.preferences.motion,
      },
    };
    const parsed = validateWorkspaceSettings(raw);
    expect(typeof parsed === "string").toBe(false);
    if (typeof parsed === "string") return;
    expect(parsed.preferences.language).toBe("es");
    expect(parsed.appearance.colorMode).toBe("light");
  });

  it("falls back from invalid language and colorMode without discarding the document", () => {
    const parsed = validateWorkspaceSettings({
      ...sampleSettings(),
      appearance: { ...sampleSettings().appearance, colorMode: "neon" as never },
      preferences: { ...sampleSettings().preferences, language: "fr" as never },
    });
    expect(typeof parsed === "string").toBe(false);
    if (typeof parsed === "string") return;
    expect(parsed.preferences.language).toBe("en");
    expect(parsed.appearance.colorMode).toBe("light");
  });
});
