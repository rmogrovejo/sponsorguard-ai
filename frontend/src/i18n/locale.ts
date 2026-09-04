export type Locale = "en" | "es";

export function detectBrowserLanguage(
  locales: readonly string[] = typeof navigator === "undefined"
    ? ["en"]
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language],
): Locale {
  for (const item of locales) {
    const tag = item.trim().toLowerCase();
    if (tag === "es" || tag.startsWith("es-")) return "es";
  }
  return "en";
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es";
}
