import { act, render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "../../App";
import { LocaleProvider } from "../../i18n/useTranslation";
import { stubMatchMedia } from "../../test/matchMedia";
import { sampleDraft, writeDraft } from "../persistence/draftTestFixtures";
import { DRAFT_STORAGE_KEY } from "../persistence/draftKeys";
import { ProductNav } from "../shell/ProductNav";
import { ShortFormReportView } from "../shortform/ShortFormReport";
import { applyDocumentAppearance, resolveColorTheme } from "./applyWorkspaceAppearance";
import { BrandMark } from "./BrandMark";
import { displayTagline, isDefaultTagline } from "./settingsSchema";
import { SETTINGS_STORAGE_KEY } from "./settingsKeys";
import { sampleSettings, TINY_PNG_DATA_URL, writeSettings } from "./settingsTestFixtures";
import { useWorkspaceSettings } from "./useWorkspaceSettings";

function spanishSettings() {
  return sampleSettings({
    appearance: {
      ...sampleSettings().appearance,
      accent: "olive",
      density: "compact",
      colorMode: "dark",
    },
    preferences: {
      ...sampleSettings().preferences,
      language: "es",
    },
  });
}

describe("language and color mode", () => {
  it("persists an explicit English choice over a Spanish browser locale", () => {
    vi.stubGlobal("navigator", { language: "es-ES", languages: ["es-ES"] });
    writeSettings(
      sampleSettings({
        preferences: { ...sampleSettings().preferences, language: "en" },
      }),
    );
    const { result } = renderHook(() => useWorkspaceSettings());
    expect(result.current.settings.preferences.language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("persists explicit Spanish and restores it after a remount", () => {
    writeSettings(spanishSettings());
    const first = renderHook(() => useWorkspaceSettings());
    expect(first.result.current.settings.preferences.language).toBe("es");
    expect(document.documentElement.lang).toBe("es");
    first.unmount();
    const second = renderHook(() => useWorkspaceSettings());
    expect(second.result.current.settings.preferences.language).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });

  it("translates the shell, Settings, Short-Form, Sponsored Content, and persistence copy", async () => {
    const user = userEvent.setup();
    writeSettings(spanishSettings());
    writeDraft(
      sampleDraft({
        activeModule: "shortform",
        sponsoredContent: {
          ...sampleDraft().sponsoredContent,
          campaignName: "AcmeVPN September Campaign",
          transcriptContent: "1\n00:00:00,000 --> 00:00:02,000\nKeep this English cue.",
        },
      }),
    );
    render(<App />);

    expect(screen.getByRole("button", { name: /contenido patrocinado/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /ajustes/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Qué corregir antes de publicar." })).toBeVisible();
    expect(screen.getByText("Preajuste de plataforma")).toBeVisible();
    expect(screen.getByText("Vídeo local")).toBeVisible();
    expect(screen.getByText("Elegir MP4")).toBeVisible();
    expect(screen.getByRole("button", { name: "Iniciar preflight" })).toBeDisabled();
    expect(screen.getByText("Guardado en este dispositivo")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /contenido patrocinado/i }));
    expect(screen.getByLabelText("Nombre de campaña o revisión")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    expect(screen.getByLabelText("Transcripción SRT")).toHaveValue(
      "1\n00:00:00,000 --> 00:00:02,000\nKeep this English cue.",
    );
    expect(screen.getByRole("button", { name: "Analizar revisión" })).toBeVisible();
    expect(screen.getByText("Identidad de la campaña")).toBeVisible();
    expect(screen.getByText("Brief del patrocinador")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /ajustes/i }));
    expect(screen.getByText("Idioma de la interfaz")).toBeVisible();
    expect(screen.getByText("Modo de color")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Español" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Oscuro" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Restaurar valores predeterminados" })).toBeVisible();
    expect(screen.getByText("Guardado en este dispositivo")).toBeVisible();
  });

  it("does not rewrite user-authored branding or campaign copy when the locale changes", async () => {
    const user = userEvent.setup();
    writeSettings(
      sampleSettings({
        brand: {
          ...sampleSettings().brand,
          productName: "Northwind Preflight",
          tagline: "Proof the cut first.",
        },
        preferences: { ...sampleSettings().preferences, language: "en" },
      }),
    );
    writeDraft(
      sampleDraft({
        sponsoredContent: {
          ...sampleDraft().sponsoredContent,
          requirements: [
            ...sampleDraft().sponsoredContent.requirements,
            {
              id: "req_url",
              type: "required_url",
              description: "Link the landing page",
              value: "https://acmevpn.com/creator",
              beforeSeconds: "",
            },
          ],
        },
      }),
    );
    render(<App />);
    expect(screen.getByLabelText("Campaign or review name")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByLabelText("Product name")).toHaveValue("Northwind Preflight");
    expect(screen.getByLabelText("Tagline")).toHaveValue("Proof the cut first.");
    await user.click(screen.getByRole("radio", { name: "Español" }));
    expect(screen.getByLabelText("Nombre del producto")).toHaveValue("Northwind Preflight");
    expect(screen.getByLabelText("Eslogan")).toHaveValue("Proof the cut first.");
    expect(screen.getAllByText("Northwind Preflight", { selector: ".wordmark__name" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Proof the cut first.").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /contenido patrocinado/i }));
    expect(screen.getByLabelText("Nombre de campaña o revisión")).toHaveValue(
      "AcmeVPN September Campaign",
    );
    expect(screen.getByLabelText("Documento de campaña")).toHaveValue(
      "Mention AcmeVPN and the code SAVE20 before the first minute.",
    );
    expect(screen.getByDisplayValue("SAVE20")).toBeVisible();
    expect(screen.getByDisplayValue("https://acmevpn.com/creator")).toBeVisible();
    expect(screen.getByText("campaign.srt")).toBeVisible();
  });

  it("localizes the default tagline only while it remains a default", () => {
    expect(isDefaultTagline("Know what to fix before you publish.")).toBe(true);
    expect(isDefaultTagline("Qué corregir antes de publicar.")).toBe(true);
    expect(displayTagline("", "es")).toBe("Qué corregir antes de publicar.");
    expect(displayTagline("Proof the cut first.", "es")).toBe("Proof the cut first.");
  });

  it("applies light, dark, and system themes without inline CSS", () => {
    const light = sampleSettings({
      appearance: { ...sampleSettings().appearance, colorMode: "light" },
    });
    applyDocumentAppearance(light, true);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(resolveColorTheme("light", true)).toBe("light");

    const dark = sampleSettings({
      appearance: { ...sampleSettings().appearance, colorMode: "dark" },
    });
    applyDocumentAppearance(dark, false);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(resolveColorTheme("dark", false)).toBe("dark");

    expect(resolveColorTheme("system", true)).toBe("dark");
    expect(resolveColorTheme("system", false)).toBe("light");
    expect(document.documentElement.getAttribute("style") ?? "").toBe("");
    expect(document.documentElement.dataset.accent).toBe("olive");
  });

  it("updates live when system color scheme changes and ignores the OS when explicit", async () => {
    const media = stubMatchMedia(false);
    writeSettings(
      sampleSettings({
        appearance: { ...sampleSettings().appearance, colorMode: "system" },
      }),
    );
    const { result, unmount } = renderHook(() => useWorkspaceSettings());
    expect(document.documentElement.dataset.theme).toBe("light");
    act(() => {
      media.setDark(true);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => {
      result.current.updateAppearance({
        ...result.current.settings.appearance,
        colorMode: "dark",
      });
    });
    act(() => {
      media.setDark(false);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => {
      result.current.updateAppearance({
        ...result.current.settings.appearance,
        colorMode: "light",
      });
    });
    act(() => {
      media.setDark(true);
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    unmount();
  });

  it("keeps language and theme in settings storage, independent of the draft", () => {
    writeDraft();
    writeSettings(spanishSettings());
    render(<App />);
    expect(document.documentElement.lang).toBe("es");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toContain("AcmeVPN September Campaign");
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"language":"es"');
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"colorMode":"dark"');
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).not.toContain("AcmeVPN September Campaign");
  });

  it("restores language and system color mode without clearing the working draft", () => {
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
    writeDraft();
    writeSettings(spanishSettings());
    const { result } = renderHook(() => useWorkspaceSettings());
    act(() => {
      result.current.restoreDefaults();
    });
    expect(result.current.settings.preferences.language).toBe("en");
    expect(result.current.settings.appearance.colorMode).toBe("system");
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toContain("AcmeVPN September Campaign");
  });

  it("lets long Spanish navigation wrap instead of overflowing", () => {
    render(
      <LocaleProvider locale="es">
        <ProductNav module="sponsored" onChange={() => undefined} />
      </LocaleProvider>,
    );
    const label = screen.getByText("Contenido patrocinado");
    expect(label).toBeVisible();
    expect(label.tagName).toBe("STRONG");
  });

  it("localizes Short-Form system copy while leaving creator evidence intact", () => {
    render(
      <LocaleProvider locale="es">
        <ShortFormReportView
          report={{
            platform: "tiktok",
            media: {
              filename: "clip.mp4",
              size_bytes: 2048,
              duration_seconds: 12,
              width: 1080,
              height: 1920,
              aspect_ratio: 0.5625,
              orientation: "portrait",
              has_audio: true,
            },
            summary: {
              total: 2,
              evaluated: 2,
              not_evaluated: 0,
              passed: 1,
              warnings: 1,
              failed: 0,
              readiness_score: 80,
              verification_coverage: 100,
            },
            findings: [
              {
                check_id: "opening",
                category: "opening",
                status: "warning",
                title: "Opening",
                reason: "The viewer payoff arrives after a generic introduction.",
                recommendation: null,
                evidence_text: "Keep this English hook.",
                ranges: [],
                measurements: null,
              },
              {
                check_id: "cta",
                category: "cta",
                status: "fail",
                title: "Call to action",
                reason: "No clear call to action detected near the ending.",
                recommendation: null,
                evidence_text: null,
                ranges: [],
                measurements: null,
              },
            ],
            speech: null,
            speech_segments: [],
            priorities: [
              { rank: 1, title: "Strengthen opening", check_id: "opening", timestamp_seconds: 1 },
            ],
          }}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("PREPARACIÓN")).toBeVisible();
    expect(screen.getByText("Llamada a la acción".toUpperCase())).toBeVisible();
    expect(screen.getByText("PRIORIDADES DE REVISIÓN")).toBeVisible();
    expect(
      screen.getByText("La apertura puede tardar demasiado en presentar el valor para el espectador."),
    ).toBeVisible();
    expect(screen.getByText("Keep this English hook.")).toBeVisible();
    expect(screen.getByText("Reforzar la apertura")).toBeVisible();
    expect(
      screen.getByText("No se detectó una llamada a la acción clara cerca del final."),
    ).toBeVisible();
    const providerDetail = screen.getByText(
      "The viewer payoff arrives after a generic introduction.",
    );
    expect(providerDetail.closest("details")).not.toBeNull();
    expect(screen.queryByText("Strengthen opening")).not.toBeInTheDocument();
    expect(screen.queryByText("No clear call to action detected near the ending.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No clear call to action was detected near the ending."),
    ).not.toBeInTheDocument();
  });

  it("keeps uploaded brand marks on a paper surface in dark mode", () => {
    applyDocumentAppearance(
      sampleSettings({
        appearance: { ...sampleSettings().appearance, colorMode: "dark" },
      }),
      true,
    );
    render(
      <BrandMark mode="image" text="SP" logoDataUrl={TINY_PNG_DATA_URL} />,
    );
    const mark = document.querySelector(".wordmark__mark--image");
    expect(mark).not.toBeNull();
    expect(mark?.querySelector("img")?.getAttribute("src")).toBe(TINY_PNG_DATA_URL);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
