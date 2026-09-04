import { SETTINGS_STORAGE_KEY, SETTINGS_VERSION } from "./settingsKeys";
import type { WorkspaceSettings } from "./settingsSchema";
import { defaultSettings } from "./settingsSchema";

export function sampleSettings(overrides: Partial<WorkspaceSettings> = {}): WorkspaceSettings {
  const base = defaultSettings();
  return {
    ...base,
    version: SETTINGS_VERSION,
    savedAt: "2026-09-04T03:00:00.000Z",
    brand: {
      ...base.brand,
      productName: "StudioPreflight",
      tagline: "Check the cut before it ships.",
      markText: "SP",
    },
    appearance: {
      ...base.appearance,
      accent: "olive",
      headingFont: "classic",
      interfaceFont: "humanist",
      density: "compact",
      colorMode: "light",
    },
    preferences: {
      ...base.preferences,
      defaultPlatform: "instagram_reels",
      motion: "reduced",
      language: "en",
    },
    ...overrides,
  };
}

export function writeSettings(settings: WorkspaceSettings = sampleSettings()): void {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const TINY_PNG_BYTES = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (character) => character.charCodeAt(0),
);

export function pngFile(name = "mark.png"): File {
  return new File([TINY_PNG_BYTES], name, { type: "image/png" });
}
