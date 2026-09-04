import type { Locale } from "../../i18n/locale";
import { isLocale } from "../../i18n/locale";
import type { ColorMode, WorkspaceSettings } from "./settingsSchema";

const DATASET_KEYS = [
  "accent",
  "heading",
  "interface",
  "density",
  "motion",
  "theme",
  "colorMode",
] as const;

const THEME_COLOR: Record<ResolvedColorTheme, string> = {
  light: "#f4f1ea",
  dark: "#1f1c18",
};

export type ResolvedColorTheme = "light" | "dark";

export function prefersDarkColorScheme(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveColorTheme(
  colorMode: ColorMode,
  systemDark: boolean = prefersDarkColorScheme(),
): ResolvedColorTheme {
  if (colorMode === "light") return "light";
  if (colorMode === "dark") return "dark";
  return systemDark ? "dark" : "light";
}

export function subscribePrefersDark(listener: (dark: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (event: MediaQueryListEvent) => listener(event.matches);
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}

export function applyDocumentLang(locale: Locale): void {
  document.documentElement.lang = locale;
}

function applyThemeColor(theme: ResolvedColorTheme): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}

export function applyDocumentAppearance(
  settings: WorkspaceSettings,
  systemDark: boolean = prefersDarkColorScheme(),
): void {
  const root = document.documentElement;
  const theme = resolveColorTheme(settings.appearance.colorMode, systemDark);
  root.dataset.accent = settings.appearance.accent;
  root.dataset.heading = settings.appearance.headingFont;
  root.dataset.interface = settings.appearance.interfaceFont;
  root.dataset.density = settings.appearance.density;
  root.dataset.motion = settings.preferences.motion;
  root.dataset.theme = theme;
  root.dataset.colorMode = settings.appearance.colorMode;
  applyDocumentLang(settings.preferences.language);
  applyThemeColor(theme);
}

export function applyDocumentTitle(productName: string): void {
  document.title = productName;
}

export function readDocumentLocale(): Locale {
  return isLocale(document.documentElement.lang) ? document.documentElement.lang : "en";
}

export function clearAppearanceDataset(): void {
  const root = document.documentElement;
  for (const key of DATASET_KEYS) {
    delete root.dataset[key];
  }
  root.removeAttribute("lang");
}
