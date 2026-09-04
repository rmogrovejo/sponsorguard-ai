import { useEffect, useState } from "react";

import { ClearDraftControl } from "./features/persistence/ClearDraftControl";
import { DraftStatus } from "./features/persistence/DraftStatus";
import { useCreatorDraft } from "./features/persistence/useCreatorDraft";
import { ReviewWorkspace } from "./features/review/ReviewWorkspace";
import { ProductNav } from "./features/shell/ProductNav";
import {
  isContentModule,
  type ProductModule,
} from "./features/shell/productModules";
import { ShortFormWorkspace } from "./features/shortform/ShortFormWorkspace";
import { BrandMark } from "./features/settings/BrandMark";
import { SettingsWorkspace } from "./features/settings/SettingsWorkspace";
import {
  displayProductName,
  displayTagline,
} from "./features/settings/settingsSchema";
import { useWorkspaceSettings } from "./features/settings/useWorkspaceSettings";
import { LocaleProvider, useTranslation } from "./i18n/useTranslation";

function App() {
  const workspace = useWorkspaceSettings();
  return (
    <LocaleProvider locale={workspace.settings.preferences.language}>
      <AppWorkspace workspace={workspace} />
    </LocaleProvider>
  );
}

function AppWorkspace({
  workspace,
}: {
  workspace: ReturnType<typeof useWorkspaceSettings>;
}) {
  const { t, locale } = useTranslation();
  const draft = useCreatorDraft({
    defaultPlatform: workspace.settings.preferences.defaultPlatform,
  });
  const [module, setModule] = useState<ProductModule>(draft.initialDraft.activeModule);
  const productName = displayProductName(workspace.settings.brand.productName);
  const tagline = displayTagline(workspace.settings.brand.tagline, locale);
  const settingsUnavailable = workspace.status === "unavailable";
  const settingsStatus =
    workspace.status === "saving"
      ? t("persist.saving")
      : workspace.status === "saved"
        ? t("persist.saved")
        : workspace.status === "unavailable"
          ? t("persist.settingsUnavailable")
          : null;

  useEffect(() => {
    if (isContentModule(module)) {
      draft.updateActiveModule(module);
    }
  }, [module, draft.updateActiveModule]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("skip")}
      </a>

      <header className="masthead">
        <div className="page-frame masthead__inner">
          <div className="wordmark" aria-label={productName}>
            <BrandMark
              mode={workspace.settings.brand.markMode}
              text={workspace.settings.brand.markText}
              logoDataUrl={workspace.settings.brand.logoDataUrl}
            />
            <span className="wordmark__name">{productName}</span>
          </div>

          <div className="masthead__meta" aria-label={t("nav.mode")}>
            <span className="masthead__tagline">{tagline}</span>
            <span className="masthead__divider" aria-hidden="true" />
            <span className="mono-label">{t("shell.protocol")}</span>
            {module === "settings" && settingsStatus && (
              <>
                <span className="masthead__divider" aria-hidden="true" />
                <span className="mono-label draft-status" aria-live="polite">
                  {settingsStatus}
                </span>
              </>
            )}
            {module !== "settings" && draft.statusText && (
              <>
                <span className="masthead__divider" aria-hidden="true" />
                <DraftStatus status={draft.status} />
              </>
            )}
            {settingsUnavailable && module !== "settings" && (
              <>
                <span className="masthead__divider" aria-hidden="true" />
                <span className="mono-label draft-status" aria-live="polite">
                  {t("persist.settingsUnavailable")}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="product-layout">
        <ProductNav module={module} onChange={setModule} productName={productName} />
        <main id="main-content" className="product-stage">
          {draft.invalidNotice && (
            <p className="draft-restore-notice" role="status">
              <span className="mono-label">{t("shell.draftLabel")}</span>
              {t("shell.draftInvalid")}
              <button className="text-button" type="button" onClick={draft.dismissInvalidNotice}>
                {t("shell.dismiss")}
              </button>
            </p>
          )}
          {workspace.invalidNotice && (
            <p className="draft-restore-notice" role="status">
              <span className="mono-label">{t("shell.settingsLabel")}</span>
              {t("shell.settingsInvalid")}
              <button
                className="text-button"
                type="button"
                onClick={workspace.dismissInvalidNotice}
              >
                {t("shell.dismiss")}
              </button>
            </p>
          )}
          <div hidden={module !== "shortform"}>
            <ShortFormWorkspace
              key={`shortform-${draft.epoch}`}
              initialPlatform={draft.initialDraft.shortForm.platform}
              restoredVideoSelected={draft.initialDraft.shortForm.hadVideoSelected}
              onDraftChange={draft.updateShortForm}
            />
          </div>
          <div hidden={module !== "sponsored"}>
            <section className="review-introduction" aria-labelledby="sponsored-title">
              <div className="section-index">
                <span>{t("sponsored.index")}</span>
                <span className="mono-label">{t("sponsored.protocol")}</span>
              </div>
              <div className="review-introduction__grid">
                <div>
                  <p className="review-introduction__eyebrow mono-label">
                    {t("sponsored.eyebrow")}
                  </p>
                  <h1 id="sponsored-title">{t("sponsored.title")}</h1>
                </div>
                <p>{t("sponsored.body")}</p>
              </div>
            </section>
            <ReviewWorkspace
              key={`sponsored-${draft.epoch}`}
              initialCampaignName={draft.initialDraft.sponsoredContent.campaignName}
              initialSponsorBrief={draft.initialDraft.sponsoredContent.sponsorBrief}
              initialRequirements={draft.initialDraft.sponsoredContent.requirements}
              initialTranscriptContent={draft.initialDraft.sponsoredContent.transcriptContent}
              initialTranscriptFileName={draft.initialDraft.sponsoredContent.transcriptFileName}
              onDraftChange={draft.updateSponsored}
            />
          </div>
          {module === "settings" && (
            <SettingsWorkspace
              settings={workspace.settings}
              logoNotice={workspace.logoNotice}
              onDismissLogoNotice={workspace.dismissLogoNotice}
              onLogoFailure={workspace.reportLogoFailure}
              onBrandChange={workspace.updateBrand}
              onAppearanceChange={workspace.updateAppearance}
              onPreferencesChange={workspace.updatePreferences}
              onRestoreDefaults={workspace.restoreDefaults}
            />
          )}
          <footer className="page-note">
            <div className="page-note__privacy">
              <span>{t("shell.footerPrivacy")}</span>
              <ClearDraftControl
                meaningful={draft.hasMeaningfulData}
                onClear={() => {
                  draft.startNewDraft();
                  setModule("shortform");
                }}
              />
            </div>
            <span className="mono-label">{productName}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
