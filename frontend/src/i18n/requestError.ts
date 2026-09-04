import type { Locale } from "./locale";
import { messages, translate, type MessageKey } from "./translations";

export type ErrorDomain = "generic" | "shortform" | "fix" | "suggestion" | "brief" | "compliance";

export function localizeRequestError(
  locale: Locale,
  code: string,
  domain: ErrorDomain = "generic",
): string {
  if (domain !== "generic") {
    const catalog = messages[locale].errors[domain] as Record<string, string> | undefined;
    if (catalog && typeof catalog[code] === "string") {
      return catalog[code];
    }
  }
  const shared = `errors.${code}`;
  const resolved = translate(locale, shared as MessageKey);
  if (resolved !== shared) return resolved;
  if (domain !== "generic") {
    const catalog = messages[locale].errors[domain] as Record<string, string> | undefined;
    if (typeof catalog?.fallback === "string") return catalog.fallback;
  }
  return translate(locale, "errors.generic");
}
