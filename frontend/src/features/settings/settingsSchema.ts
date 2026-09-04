import type { Locale } from "../../i18n/locale";
import { detectBrowserLanguage, isLocale } from "../../i18n/locale";
import { LOCALIZED_DEFAULT_TAGLINE } from "../../i18n/translations";
import type { ShortFormPlatform } from "../../types/shortform";
import {
  DEFAULT_MARK_TEXT,
  DEFAULT_PRODUCT_NAME,
  DEFAULT_TAGLINE,
  MAX_LOGO_DATA_URL_CHARS,
  MAX_MARK_TEXT,
  MAX_PRODUCT_NAME,
  MAX_SETTINGS_BYTES,
  MAX_TAGLINE,
  SETTINGS_VERSION,
} from "./settingsKeys";

export type SettingsParseFailure =
  | "invalid_json"
  | "wrong_version"
  | "invalid_schema"
  | "oversized";

export type AccentId = "terracotta" | "rust" | "olive" | "ink" | "ochre";
export type HeadingFontId = "editorial" | "classic" | "modern";
export type InterfaceFontId = "neutral" | "humanist" | "system";
export type DensityId = "comfortable" | "compact";
export type MotionId = "system" | "reduced";
export type ColorMode = "light" | "dark" | "system";
export type MarkMode = "text" | "image";

export const ACCENT_OPTIONS: ReadonlyArray<{ id: AccentId; label: string }> = [
  { id: "terracotta", label: "Terracotta" },
  { id: "rust", label: "Rust" },
  { id: "olive", label: "Olive" },
  { id: "ink", label: "Ink" },
  { id: "ochre", label: "Ochre" },
];

export const HEADING_FONT_OPTIONS: ReadonlyArray<{ id: HeadingFontId; label: string }> = [
  { id: "editorial", label: "Editorial" },
  { id: "classic", label: "Classic" },
  { id: "modern", label: "Modern serif" },
];

export const INTERFACE_FONT_OPTIONS: ReadonlyArray<{ id: InterfaceFontId; label: string }> = [
  { id: "neutral", label: "Neutral" },
  { id: "humanist", label: "Humanist" },
  { id: "system", label: "System" },
];

export const DENSITY_OPTIONS: ReadonlyArray<{ id: DensityId; label: string }> = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
];

export const MOTION_OPTIONS: ReadonlyArray<{ id: MotionId; label: string }> = [
  { id: "system", label: "Follow system" },
  { id: "reduced", label: "Reduced" },
];

export const COLOR_MODE_OPTIONS: ReadonlyArray<{ id: ColorMode; labelKey: "light" | "dark" | "system" }> = [
  { id: "light", labelKey: "light" },
  { id: "dark", labelKey: "dark" },
  { id: "system", labelKey: "system" },
];

export const LANGUAGE_OPTIONS: ReadonlyArray<{ id: Locale; labelKey: "english" | "spanish" }> = [
  { id: "en", labelKey: "english" },
  { id: "es", labelKey: "spanish" },
];

const ACCENTS: ReadonlySet<AccentId> = new Set(ACCENT_OPTIONS.map((item) => item.id));
const HEADING_FONTS: ReadonlySet<HeadingFontId> = new Set(HEADING_FONT_OPTIONS.map((item) => item.id));
const INTERFACE_FONTS: ReadonlySet<InterfaceFontId> = new Set(
  INTERFACE_FONT_OPTIONS.map((item) => item.id),
);
const DENSITIES: ReadonlySet<DensityId> = new Set(DENSITY_OPTIONS.map((item) => item.id));
const MOTIONS: ReadonlySet<MotionId> = new Set(["system", "reduced"]);
const COLOR_MODES: ReadonlySet<ColorMode> = new Set(["light", "dark", "system"]);
const PLATFORMS: ReadonlySet<ShortFormPlatform> = new Set([
  "tiktok",
  "youtube_shorts",
  "instagram_reels",
]);
const MARK_MODES: ReadonlySet<MarkMode> = new Set(["text", "image"]);

const ROOT_KEYS = new Set(["version", "savedAt", "brand", "appearance", "preferences"]);
const BRAND_KEYS = new Set(["productName", "tagline", "markMode", "markText", "logoDataUrl"]);
const APPEARANCE_KEYS = new Set(["accent", "headingFont", "interfaceFont", "density", "colorMode"]);
const PREFERENCE_KEYS = new Set(["defaultPlatform", "motion", "language"]);

const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export interface BrandSettings {
  productName: string;
  tagline: string;
  markMode: MarkMode;
  markText: string;
  logoDataUrl: string | null;
}

export interface AppearanceSettings {
  accent: AccentId;
  headingFont: HeadingFontId;
  interfaceFont: InterfaceFontId;
  density: DensityId;
  colorMode: ColorMode;
}

export interface PreferenceSettings {
  defaultPlatform: ShortFormPlatform;
  motion: MotionId;
  language: Locale;
}

export interface WorkspaceSettings {
  version: 1;
  savedAt: string;
  brand: BrandSettings;
  appearance: AppearanceSettings;
  preferences: PreferenceSettings;
}

export interface DefaultSettingsOptions {
  language?: Locale;
  colorMode?: ColorMode;
}

/**
 * New workspaces default to system color mode and a browser-detected language.
 * Migrated v1 documents missing colorMode keep light (the previous locked theme).
 */
export function defaultSettings(options: DefaultSettingsOptions = {}): WorkspaceSettings {
  return {
    version: SETTINGS_VERSION,
    savedAt: new Date().toISOString(),
    brand: {
      productName: DEFAULT_PRODUCT_NAME,
      tagline: DEFAULT_TAGLINE,
      markMode: "text",
      markText: DEFAULT_MARK_TEXT,
      logoDataUrl: null,
    },
    appearance: {
      accent: "terracotta",
      headingFont: "editorial",
      interfaceFont: "neutral",
      density: "comfortable",
      colorMode: options.colorMode ?? "system",
    },
    preferences: {
      defaultPlatform: "tiktok",
      motion: "system",
      language: options.language ?? detectBrowserLanguage(),
    },
  };
}

export function displayProductName(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed : DEFAULT_PRODUCT_NAME;
}

export function isDefaultTagline(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return Object.values(LOCALIZED_DEFAULT_TAGLINE).includes(trimmed);
}

export function displayTagline(value: string, locale: Locale = "en"): string {
  if (isDefaultTagline(value)) return LOCALIZED_DEFAULT_TAGLINE[locale];
  return value.trim();
}

export function displayMarkText(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed : DEFAULT_MARK_TEXT;
}

export function isSafeLogoDataUrl(value: string): boolean {
  if (value.length === 0 || value.length > MAX_LOGO_DATA_URL_CHARS) return false;
  if (value.toLowerCase().includes("svg")) return false;
  if (value.includes("://") && !value.startsWith("data:")) return false;
  return LOGO_DATA_URL.test(value);
}

export function canonicalSettingsPayload(settings: WorkspaceSettings): string {
  return JSON.stringify({
    version: settings.version,
    brand: settings.brand,
    appearance: settings.appearance,
    preferences: settings.preferences,
  });
}

export function measureSettingsBytes(settings: WorkspaceSettings): number {
  return new TextEncoder().encode(JSON.stringify(settings)).length;
}

export function settingsFitsPersistence(settings: WorkspaceSettings): boolean {
  if (settings.brand.productName.length > MAX_PRODUCT_NAME) return false;
  if (settings.brand.tagline.length > MAX_TAGLINE) return false;
  if (settings.brand.markText.length > MAX_MARK_TEXT) return false;
  if (settings.brand.logoDataUrl && settings.brand.logoDataUrl.length > MAX_LOGO_DATA_URL_CHARS) {
    return false;
  }
  return measureSettingsBytes(settings) <= MAX_SETTINGS_BYTES;
}

export function parseWorkspaceSettings(raw: string): WorkspaceSettings | SettingsParseFailure {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return "invalid_json";
  }
  return validateWorkspaceSettings(value);
}

export function validateWorkspaceSettings(value: unknown): WorkspaceSettings | SettingsParseFailure {
  if (!isPlainObject(value)) return "invalid_schema";
  if (hasUnexpectedKeys(value, ROOT_KEYS)) return "invalid_schema";
  if (value.version !== SETTINGS_VERSION) return "wrong_version";
  if (typeof value.savedAt !== "string" || !value.savedAt || value.savedAt.length > 40) {
    return "invalid_schema";
  }
  const brand = validateBrand(value.brand);
  if (brand === null) return "invalid_schema";
  const appearance = validateAppearance(value.appearance);
  if (appearance === null) return "invalid_schema";
  const preferences = validatePreferences(value.preferences);
  if (preferences === null) return "invalid_schema";
  const settings: WorkspaceSettings = {
    version: 1,
    savedAt: value.savedAt,
    brand,
    appearance,
    preferences,
  };
  if (!settingsFitsPersistence(settings)) return "oversized";
  return settings;
}

function validateBrand(value: unknown): BrandSettings | null {
  if (!isPlainObject(value) || hasUnexpectedKeys(value, BRAND_KEYS)) return null;
  if (!isSingleLine(value.productName, MAX_PRODUCT_NAME)) return null;
  if (!isSingleLine(value.tagline, MAX_TAGLINE)) return null;
  if (typeof value.markMode !== "string" || !MARK_MODES.has(value.markMode as MarkMode)) {
    return null;
  }
  if (!isSingleLine(value.markText, MAX_MARK_TEXT)) return null;
  if (value.logoDataUrl !== null && typeof value.logoDataUrl !== "string") return null;
  if (typeof value.logoDataUrl === "string" && !isSafeLogoDataUrl(value.logoDataUrl)) return null;
  if (value.markMode === "image" && value.logoDataUrl === null) return null;
  if (value.markMode === "text" && value.logoDataUrl !== null) return null;
  return {
    productName: value.productName,
    tagline: value.tagline,
    markMode: value.markMode as MarkMode,
    markText: value.markText,
    logoDataUrl: value.logoDataUrl,
  };
}

function validateAppearance(value: unknown): AppearanceSettings | null {
  if (!isPlainObject(value) || hasUnexpectedKeys(value, APPEARANCE_KEYS)) return null;
  if (typeof value.accent !== "string" || !ACCENTS.has(value.accent as AccentId)) return null;
  if (typeof value.headingFont !== "string" || !HEADING_FONTS.has(value.headingFont as HeadingFontId)) {
    return null;
  }
  if (
    typeof value.interfaceFont !== "string" ||
    !INTERFACE_FONTS.has(value.interfaceFont as InterfaceFontId)
  ) {
    return null;
  }
  if (typeof value.density !== "string" || !DENSITIES.has(value.density as DensityId)) return null;
  const colorMode = parseColorMode(value.colorMode);
  return {
    accent: value.accent as AccentId,
    headingFont: value.headingFont as HeadingFontId,
    interfaceFont: value.interfaceFont as InterfaceFontId,
    density: value.density as DensityId,
    colorMode,
  };
}

function validatePreferences(value: unknown): PreferenceSettings | null {
  if (!isPlainObject(value) || hasUnexpectedKeys(value, PREFERENCE_KEYS)) return null;
  if (
    typeof value.defaultPlatform !== "string" ||
    !PLATFORMS.has(value.defaultPlatform as ShortFormPlatform)
  ) {
    return null;
  }
  if (typeof value.motion !== "string" || !MOTIONS.has(value.motion as MotionId)) return null;
  return {
    defaultPlatform: value.defaultPlatform as ShortFormPlatform,
    motion: value.motion as MotionId,
    language: parseLanguage(value.language),
  };
}

function parseLanguage(value: unknown): Locale {
  if (value === undefined) return detectBrowserLanguage();
  if (isLocale(value)) return value;
  return "en";
}

function parseColorMode(value: unknown): ColorMode {
  if (typeof value === "string" && COLOR_MODES.has(value as ColorMode)) {
    return value as ColorMode;
  }
  return "light";
}

function isSingleLine(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    !value.includes("\n") &&
    !value.includes("\r")
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnexpectedKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}
