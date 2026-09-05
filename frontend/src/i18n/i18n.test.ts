import { describe, expect, it } from "vitest";

import { interpolate } from "./interpolate";
import { detectBrowserLanguage } from "./locale";
import { localizeRequestError } from "./requestError";
import { KNOWN_ERROR_CODES, translate } from "./translations";

describe("locale detection", () => {
  it("selects Spanish when the browser language is clearly Spanish", () => {
    expect(detectBrowserLanguage(["es-MX", "en"])).toBe("es");
    expect(detectBrowserLanguage(["es"])).toBe("es");
  });

  it("defaults to English for non-Spanish locales", () => {
    expect(detectBrowserLanguage(["en-US"])).toBe("en");
    expect(detectBrowserLanguage(["fr-FR", "de"])).toBe("en");
  });
});

describe("translations", () => {
  it("interpolates counts in both languages", () => {
    expect(interpolate("{count} evaluated checks", { count: 3 })).toBe("3 evaluated checks");
    expect(translate("en", "sponsored.evaluatedReqs", { count: 2 })).toBe("2 evaluated requirements");
    expect(translate("es", "sponsored.evaluatedReqs", { count: 2 })).toBe("2 requisitos evaluados");
  });

  it("maps known backend codes to localized user-facing copy", () => {
    expect(localizeRequestError("en", "UNSUPPORTED_MEDIA", "shortform")).toBe(
      "The uploaded file is not a readable MP4 video.",
    );
    expect(localizeRequestError("es", "UNSUPPORTED_MEDIA", "shortform")).toContain("MP4");
    expect(localizeRequestError("es", "LLM_PROVIDER_TIMEOUT", "fix")).not.toMatch(/took too long/i);
    expect(localizeRequestError("es", "UNKNOWN_CODE", "generic")).toBe(
      "Algo ha fallado. Inténtalo de nuevo.",
    );
  });

  it("localizes every known shared error code and uses a generic fallback otherwise", () => {
    for (const code of KNOWN_ERROR_CODES) {
      const english = localizeRequestError("en", code);
      const spanish = localizeRequestError("es", code);
      expect(english).not.toBe(code);
      expect(spanish).not.toBe(code);
      expect(english).not.toBe("errors.generic");
      expect(spanish).not.toEqual(english);
    }
    expect(localizeRequestError("en", "SOME_NEW_PROVIDER_EXCEPTION")).toBe(
      "Something went wrong. Try again.",
    );
    expect(localizeRequestError("es", "SOME_NEW_PROVIDER_EXCEPTION", "shortform")).toBe(
      "CreatorPreflight no pudo terminar este preflight. Inténtalo de nuevo.",
    );
    expect(localizeRequestError("en", "SOME_NEW_PROVIDER_EXCEPTION", "fix")).toBe(
      "SponsorGuard could not generate a fix. Try again.",
    );
    expect(localizeRequestError("es", "INTERNAL_TRACEBACK", "suggestion")).not.toMatch(
      /traceback|exception/i,
    );
  });

  it("keeps domain-specific compliance and SRT errors localized", () => {
    expect(localizeRequestError("en", "INVALID_TRANSCRIPT", "compliance")).toMatch(/SRT/i);
    expect(localizeRequestError("es", "INVALID_TRANSCRIPT", "compliance")).toMatch(/SRT/i);
    expect(localizeRequestError("es", "UNSUPPORTED_MEDIA", "shortform")).toBe(
      "El archivo subido no es un MP4 legible.",
    );
    expect(localizeRequestError("en", "LLM_PROVIDER_UNAVAILABLE", "suggestion")).toMatch(
      /temporarily unavailable/i,
    );
    expect(localizeRequestError("es", "RATE_LIMITED", "fix")).toMatch(/Demasiadas/);
    expect(localizeRequestError("en", "RATE_LIMITED", "brief")).toMatch(/Too many/);
  });
});
