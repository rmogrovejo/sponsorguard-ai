import { describe, expect, it } from "vitest";

import { translate } from "../../i18n/translations";
import type { PreflightFinding } from "../../types/shortform";
import { localizeFindingCopy, localizePriority } from "./localizeFinding";

const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("en", key, vars);
const tEs = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("es", key, vars);

function finding(
  overrides: Partial<PreflightFinding> & Pick<PreflightFinding, "check_id" | "category" | "status" | "title" | "reason">,
): PreflightFinding {
  return {
    recommendation: null,
    evidence_text: null,
    ranges: [],
    measurements: null,
    ...overrides,
  };
}

describe("localizeFindingCopy", () => {
  it("keeps English deterministic copy aligned with the previous report wording", () => {
    const resolution = localizeFindingCopy(
      finding({
        check_id: "resolution",
        category: "format",
        status: "warning",
        title: "Resolution",
        reason: "Resolution is below the preferred vertical HD target.",
        recommendation: "Prefer at least 1080 × 1920 for TikTok.",
        measurements: { width: 576, height: 1024 },
      }),
      { platform: "tiktok", hasAudio: true },
      t,
    );
    expect(resolution.lead).toBe("Resolution is below the preferred vertical HD target.");
    expect(resolution.recommendation).toBe("Prefer at least 1080 × 1920 for TikTok.");

    const duration = localizeFindingCopy(
      finding({
        check_id: "duration",
        category: "format",
        status: "pass",
        title: "Duration",
        reason: "Duration 26.80s is within the preferred TikTok window.",
        measurements: { duration_seconds: 26.8 },
      }),
      { platform: "tiktok", hasAudio: true },
      t,
    );
    expect(duration.lead).toBe("Duration 26.80s is within the preferred TikTok window.");

    const audio = localizeFindingCopy(
      finding({
        check_id: "audio_track",
        category: "audio",
        status: "pass",
        title: "Audio",
        reason: "Audio track detected.",
      }),
      { platform: "tiktok", hasAudio: true },
      t,
    );
    expect(audio.lead).toBe("Audio track detected.");
  });

  it("uses structured opening copy and keeps provider prose as optional detail", () => {
    const copy = localizeFindingCopy(
      finding({
        check_id: "opening",
        category: "opening",
        status: "warning",
        title: "Opening",
        reason: "The viewer payoff arrives after a generic introduction.",
        evidence_text: "Keep this English hook.",
      }),
      { platform: "tiktok", hasAudio: true },
      tEs,
    );
    expect(copy.lead).toBe(
      "La apertura puede tardar demasiado en presentar el valor para el espectador.",
    );
    expect(copy.providerDetail).toBe("The viewer payoff arrives after a generic introduction.");
  });

  it("localizes Short-Form CTA and opening primary copy in both languages", () => {
    const cta = localizeFindingCopy(
      finding({
        check_id: "cta",
        category: "cta",
        status: "fail",
        title: "Call to action",
        reason: "No clear call to action detected near the ending.",
        measurements: { cta_decision: "not_found" },
      }),
      { platform: "tiktok", hasAudio: true },
      t,
    );
    expect(cta.lead).toBe("No clear call to action was detected near the ending.");
    expect(cta.providerDetail ?? null).toBeNull();

    const ctaEs = localizeFindingCopy(
      finding({
        check_id: "cta",
        category: "cta",
        status: "fail",
        title: "Call to action",
        reason: "No clear call to action detected near the ending.",
        measurements: { cta_decision: "not_found" },
      }),
      { platform: "tiktok", hasAudio: true },
      tEs,
    );
    expect(ctaEs.lead).toBe("No se detectó una llamada a la acción clara cerca del final.");

    const opening = localizeFindingCopy(
      finding({
        check_id: "opening",
        category: "opening",
        status: "warning",
        title: "Opening",
        reason: "Main hook detected at 00:03.80.",
        measurements: { hook_decision: "review" },
      }),
      { platform: "tiktok", hasAudio: true },
      t,
    );
    expect(opening.lead).toBe("The opening may take too long to establish the viewer payoff.");
    expect(opening.providerDetail ?? null).toBeNull();
  });
});

describe("localizePriority", () => {
  it("localizes ranked titles without changing order or timestamps", () => {
    expect(
      localizePriority(
        { rank: 1, title: "Review pacing gap at 00:12.25", check_id: "dead_air", timestamp_seconds: 12.25 },
        t,
      ),
    ).toBe("Review pacing gap at 00:12.25");
    expect(
      localizePriority(
        { rank: 1, title: "Review pacing gap at 00:12.25", check_id: "dead_air", timestamp_seconds: 12.25 },
        tEs,
      ),
    ).toBe("Revisar pausa de ritmo en 00:12.25");
    expect(
      localizePriority(
        { rank: 2, title: "Consider a closing CTA", check_id: "cta", timestamp_seconds: null },
        tEs,
      ),
    ).toBe("Considerar una llamada a la acción al final");
  });
});
