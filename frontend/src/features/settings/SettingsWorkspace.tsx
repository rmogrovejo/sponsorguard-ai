import { type ChangeEvent, type FormEvent } from "react";

import { PLATFORM_OPTIONS } from "../../types/shortform";
import type { MessageKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import { SectionHeader } from "../shell/SectionHeader";
import { BrandMark } from "./BrandMark";
import { readRasterLogo, type LogoReadFailure } from "./logoValidation";
import { RestoreDefaultsControl } from "./RestoreDefaultsControl";
import {
  ACCENT_OPTIONS,
  COLOR_MODE_OPTIONS,
  DENSITY_OPTIONS,
  displayProductName,
  displayTagline,
  HEADING_FONT_OPTIONS,
  INTERFACE_FONT_OPTIONS,
  LANGUAGE_OPTIONS,
  MOTION_OPTIONS,
  type AccentId,
  type ColorMode,
  type DensityId,
  type HeadingFontId,
  type InterfaceFontId,
  type MotionId,
  type WorkspaceSettings,
} from "./settingsSchema";
import {
  MAX_MARK_TEXT,
  MAX_PRODUCT_NAME,
  MAX_TAGLINE,
} from "./settingsKeys";

const LOGO_NOTICE: Record<LogoReadFailure, MessageKey> = {
  svg: "settings.logoSvg",
  type: "settings.logoType",
  empty: "settings.logoEmpty",
  oversized: "settings.logoOversized",
  unreadable: "settings.logoUnreadable",
};

const ACCENT_LABEL: Record<AccentId, MessageKey> = {
  terracotta: "settings.terracotta",
  rust: "settings.rust",
  olive: "settings.olive",
  ink: "settings.ink",
  ochre: "settings.ochre",
};

const DENSITY_LABEL: Record<DensityId, MessageKey> = {
  comfortable: "settings.comfortable",
  compact: "settings.compact",
};

const COLOR_LABEL: Record<ColorMode, MessageKey> = {
  light: "settings.light",
  dark: "settings.dark",
  system: "settings.system",
};

const LANGUAGE_LABEL = {
  english: "settings.english",
  spanish: "settings.spanish",
} as const satisfies Record<"english" | "spanish", MessageKey>;

const PLATFORM_LABEL = {
  tiktok: "shortform.tiktok",
  youtube_shorts: "shortform.youtube_shorts",
  instagram_reels: "shortform.instagram_reels",
} as const satisfies Record<string, MessageKey>;

const HEADING_LABEL: Record<HeadingFontId, MessageKey> = {
  editorial: "settings.editorial",
  classic: "settings.classic",
  modern: "settings.modern",
};

const INTERFACE_LABEL: Record<InterfaceFontId, MessageKey> = {
  neutral: "settings.neutral",
  humanist: "settings.humanist",
  system: "settings.systemFont",
};

interface SettingsWorkspaceProps {
  settings: WorkspaceSettings;
  logoNotice: MessageKey | null;
  onDismissLogoNotice: () => void;
  onLogoFailure: (message: MessageKey) => void;
  onBrandChange: (brand: WorkspaceSettings["brand"]) => boolean;
  onAppearanceChange: (appearance: WorkspaceSettings["appearance"]) => void;
  onPreferencesChange: (preferences: WorkspaceSettings["preferences"]) => void;
  onRestoreDefaults: () => void;
}

export function SettingsWorkspace({
  settings,
  logoNotice,
  onDismissLogoNotice,
  onLogoFailure,
  onBrandChange,
  onAppearanceChange,
  onPreferencesChange,
  onRestoreDefaults,
}: SettingsWorkspaceProps) {
  const { t, locale } = useTranslation();
  const { brand, appearance, preferences } = settings;

  const handleName = (event: ChangeEvent<HTMLInputElement>) => {
    onBrandChange({ ...brand, productName: event.target.value });
  };

  const handleTagline = (event: ChangeEvent<HTMLInputElement>) => {
    onBrandChange({ ...brand, tagline: event.target.value });
  };

  const handleMarkText = (event: ChangeEvent<HTMLInputElement>) => {
    onBrandChange({
      ...brand,
      markMode: "text",
      markText: event.target.value,
      logoDataUrl: null,
    });
  };

  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    void readRasterLogo(file).then((result) => {
      if (!result.ok) {
        onLogoFailure(LOGO_NOTICE[result.reason]);
        return;
      }
      const accepted = onBrandChange({
        ...brand,
        markMode: "image",
        logoDataUrl: result.dataUrl,
      });
      if (!accepted) onLogoFailure("settings.logoOversized");
    });
  };

  const removeLogo = () => {
    onBrandChange({
      ...brand,
      markMode: "text",
      logoDataUrl: null,
    });
  };

  const preventSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <>
      <section className="review-introduction" aria-labelledby="settings-title">
        <div className="section-index">
          <span>{t("settings.index")}</span>
          <span className="mono-label">{t("settings.protocol")}</span>
        </div>
        <div className="review-introduction__grid">
          <div>
            <p className="review-introduction__eyebrow mono-label">{t("settings.eyebrow")}</p>
            <h1 id="settings-title">{t("settings.title")}</h1>
          </div>
          <p>{t("settings.body")}</p>
        </div>
      </section>

      <form className="review-workspace settings-workspace" noValidate onSubmit={preventSubmit}>
        <div className="workspace-docket">
          <div>
            <p className="mono-label">{t("settings.docket")}</p>
            <h2>{t("settings.docketTitle")}</h2>
          </div>
          <p className="request-state">{t("settings.localOnly")}</p>
        </div>

        <div className="settings-preview" aria-label={t("settings.preview")}>
          <div className="wordmark">
            <BrandMark
              mode={brand.markMode}
              text={brand.markText}
              logoDataUrl={brand.logoDataUrl}
            />
            <span className="wordmark__name">{displayProductName(brand.productName)}</span>
          </div>
          <p className="settings-preview__tagline">{displayTagline(brand.tagline, locale)}</p>
        </div>

        <section className="review-section" aria-labelledby="brand-heading">
          <SectionHeader
            step={t("settings.brandStep")}
            title={t("settings.brandTitle")}
            titleId="brand-heading"
            description={t("settings.brandBody")}
          />
          <div className="settings-stack">
            <label className="form-field settings-row" htmlFor="settings-product-name">
              <span>{t("settings.productName")}</span>
              <input
                id="settings-product-name"
                value={brand.productName}
                maxLength={MAX_PRODUCT_NAME}
                autoComplete="off"
                spellCheck={false}
                onChange={handleName}
              />
            </label>
            <label className="form-field settings-row" htmlFor="settings-tagline">
              <span>{t("settings.tagline")}</span>
              <input
                id="settings-tagline"
                value={brand.tagline}
                maxLength={MAX_TAGLINE}
                autoComplete="off"
                onChange={handleTagline}
              />
            </label>
            <div className="settings-row">
              <span id="brand-mark-label">{t("settings.brandMark")}</span>
              <div className="settings-mark-controls" role="group" aria-labelledby="brand-mark-label">
                <label className="form-field" htmlFor="settings-mark-text">
                  <span className="visually-hidden">{t("settings.textMark")}</span>
                  <input
                    id="settings-mark-text"
                    value={brand.markText}
                    maxLength={MAX_MARK_TEXT}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={t("settings.textMark")}
                    onChange={handleMarkText}
                  />
                </label>
                <input
                  id="settings-logo"
                  className="visually-hidden"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onChange={handleLogo}
                />
                <label className="secondary-button" htmlFor="settings-logo">
                  {t("settings.uploadLogo")}
                </label>
                {brand.markMode === "image" && (
                  <button className="text-button" type="button" onClick={removeLogo}>
                    {t("settings.useTextMark")}
                  </button>
                )}
              </div>
            </div>
            {logoNotice && (
              <p className="settings-notice" role="status">
                <span className="mono-label">{t("settings.logoLabel")}</span>
                {t(logoNotice)}
                <button className="text-button" type="button" onClick={onDismissLogoNotice}>
                  {t("shell.dismiss")}
                </button>
              </p>
            )}
          </div>
        </section>

        <section className="review-section" aria-labelledby="appearance-heading">
          <SectionHeader
            step={t("settings.appearanceStep")}
            title={t("settings.appearanceTitle")}
            titleId="appearance-heading"
            description={t("settings.appearanceBody")}
          />
          <div className="settings-stack">
            <fieldset className="settings-row">
              <legend>{t("settings.accent")}</legend>
              <div className="accent-options">
                {ACCENT_OPTIONS.map((option) => (
                  <label key={option.id}>
                    <input
                      type="radio"
                      name="settings-accent"
                      value={option.id}
                      checked={appearance.accent === option.id}
                      onChange={() =>
                        onAppearanceChange({ ...appearance, accent: option.id })
                      }
                    />
                    <span className="accent-chip" data-swatch={option.id} aria-hidden="true" />
                    {t(ACCENT_LABEL[option.id])}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="settings-row">
              <legend>{t("settings.colorMode")}</legend>
              <div className="choice-row">
                {COLOR_MODE_OPTIONS.map((option) => (
                  <label key={option.id}>
                    <input
                      type="radio"
                      name="settings-color-mode"
                      value={option.id}
                      checked={appearance.colorMode === option.id}
                      onChange={() =>
                        onAppearanceChange({
                          ...appearance,
                          colorMode: option.id as ColorMode,
                        })
                      }
                    />
                    {t(COLOR_LABEL[option.id])}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="form-field settings-row" htmlFor="settings-heading-font">
              <span>{t("settings.headingFont")}</span>
              <select
                id="settings-heading-font"
                value={appearance.headingFont}
                onChange={(event) =>
                  onAppearanceChange({
                    ...appearance,
                    headingFont: event.target.value as HeadingFontId,
                  })
                }
              >
                {HEADING_FONT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {t(HEADING_LABEL[option.id])}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field settings-row" htmlFor="settings-interface-font">
              <span>{t("settings.interfaceFont")}</span>
              <select
                id="settings-interface-font"
                value={appearance.interfaceFont}
                onChange={(event) =>
                  onAppearanceChange({
                    ...appearance,
                    interfaceFont: event.target.value as InterfaceFontId,
                  })
                }
              >
                {INTERFACE_FONT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {t(INTERFACE_LABEL[option.id])}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="settings-row">
              <legend>{t("settings.density")}</legend>
              <div className="choice-row">
                {DENSITY_OPTIONS.map((option) => (
                  <label key={option.id}>
                    <input
                      type="radio"
                      name="settings-density"
                      value={option.id}
                      checked={appearance.density === option.id}
                      onChange={() =>
                        onAppearanceChange({
                          ...appearance,
                          density: option.id,
                        })
                      }
                    />
                    {t(DENSITY_LABEL[option.id])}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section className="review-section" aria-labelledby="defaults-heading">
          <SectionHeader
            step={t("settings.defaultsStep")}
            title={t("settings.defaultsTitle")}
            titleId="defaults-heading"
            description={t("settings.defaultsBody")}
          />
          <div className="settings-stack">
            <fieldset className="settings-row">
              <legend>{t("settings.language")}</legend>
              <div className="choice-row">
                {LANGUAGE_OPTIONS.map((option) => (
                  <label key={option.id}>
                    <input
                      type="radio"
                      name="settings-language"
                      value={option.id}
                      checked={preferences.language === option.id}
                      onChange={() =>
                        onPreferencesChange({
                          ...preferences,
                          language: option.id,
                        })
                      }
                    />
                    {t(LANGUAGE_LABEL[option.labelKey])}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="form-field settings-row" htmlFor="settings-default-platform">
              <span>{t("settings.platform")}</span>
              <select
                id="settings-default-platform"
                value={preferences.defaultPlatform}
                onChange={(event) =>
                  onPreferencesChange({
                    ...preferences,
                    defaultPlatform: event.target.value as WorkspaceSettings["preferences"]["defaultPlatform"],
                  })
                }
              >
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(PLATFORM_LABEL[option.value])}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="settings-row">
              <legend>{t("settings.motion")}</legend>
              <div className="choice-row">
                {MOTION_OPTIONS.map((option) => (
                  <label key={option.id}>
                    <input
                      type="radio"
                      name="settings-motion"
                      value={option.id}
                      checked={preferences.motion === option.id}
                      onChange={() =>
                        onPreferencesChange({
                          ...preferences,
                          motion: option.id as MotionId,
                        })
                      }
                    />
                    {option.id === "system" ? t("settings.motionSystem") : t("settings.motionReduced")}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="field-hint">{t("settings.motionHint")}</p>
          </div>
        </section>

        <section className="review-section" aria-labelledby="reset-heading">
          <SectionHeader
            step={t("settings.resetStep")}
            title={t("settings.resetTitle")}
            titleId="reset-heading"
            description={t("settings.resetBody")}
          />
          <RestoreDefaultsControl onRestore={onRestoreDefaults} />
        </section>
      </form>
    </>
  );
}
