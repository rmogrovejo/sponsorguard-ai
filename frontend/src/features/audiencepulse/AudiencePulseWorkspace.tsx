import { useEffect, useRef, type FormEvent } from "react";

import { localizeRequestError } from "../../i18n/requestError";
import type { MessageKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import type {
  AudiencePulseInputMode,
  ManualAudienceSource,
} from "../../types/audiencePulse";
import { MANUAL_AUDIENCE_SOURCES } from "../../types/audiencePulse";
import type { AudiencePulseDraft } from "../persistence/draftSchema";
import { SectionHeader } from "../shell/SectionHeader";
import { AudiencePulseReportView } from "./AudiencePulseReport";
import { useAudiencePulse } from "./useAudiencePulse";

const PHASE_KEYS = {
  idle: "audiencePulse.phaseIdle",
  analyzing: "audiencePulse.phaseAnalyzing",
  success: "audiencePulse.phaseSuccess",
  error: "audiencePulse.phaseError",
} as const satisfies Record<string, MessageKey>;

const PLATFORM_KEYS = {
  tiktok: "audiencePulse.platformTiktok",
  instagram: "audiencePulse.platformInstagram",
  stream: "audiencePulse.platformStream",
  other: "audiencePulse.platformOther",
} as const satisfies Record<ManualAudienceSource, MessageKey>;

interface AudiencePulseWorkspaceProps {
  initialYoutubeUrl?: string;
  initialCommentsText?: string;
  initialInputMode?: AudiencePulseInputMode;
  initialManualSource?: ManualAudienceSource;
  onDraftChange?: (draft: AudiencePulseDraft) => void;
}

export function AudiencePulseWorkspace({
  initialYoutubeUrl = "",
  initialCommentsText = "",
  initialInputMode,
  initialManualSource,
  onDraftChange,
}: AudiencePulseWorkspaceProps = {}) {
  const { t, locale } = useTranslation();
  const skipDraftPublish = useRef(true);
  const {
    youtubeUrl,
    setYoutubeUrl,
    commentsText,
    setCommentsText,
    inputMode,
    setInputMode,
    manualSource,
    setManualSource,
    phase,
    report,
    requestError,
    sampledNotice,
    analyze,
    retryAnalysis,
  } = useAudiencePulse({
    youtubeUrl: initialYoutubeUrl,
    commentsText: initialCommentsText,
    inputMode: initialInputMode,
    manualSource: initialManualSource,
  });
  const requestActive = phase === "analyzing";

  useEffect(() => {
    if (!onDraftChange) return;
    if (skipDraftPublish.current) {
      skipDraftPublish.current = false;
      return;
    }
    onDraftChange({ youtubeUrl, commentsText, inputMode, manualSource });
  }, [youtubeUrl, commentsText, inputMode, manualSource, onDraftChange]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await analyze();
  }

  return (
    <>
      <section className="review-introduction" aria-labelledby="audience-title">
        <div className="section-index">
          <span>{t("audiencePulse.index")}</span>
          <span className="mono-label">{t("audiencePulse.protocol")}</span>
        </div>
        <div className="review-introduction__grid">
          <div>
            <p className="review-introduction__eyebrow mono-label">
              {t("audiencePulse.eyebrow")}
            </p>
            <h1 id="audience-title">{t("audiencePulse.heroTitle")}</h1>
          </div>
          <p>{t("audiencePulse.heroBody")}</p>
        </div>
      </section>

      <section className="review-workspace" aria-labelledby="audience-docket-title">
        <div className="workspace-docket">
          <p className="mono-label">{t("audiencePulse.docket")}</p>
          <h2 id="audience-docket-title">{t("audiencePulse.docketTitle")}</h2>
          <p className="request-state">
            {t("audiencePulse.status", { phase: t(PHASE_KEYS[phase]) })}
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="review-section audience-pulse-intake">
            <SectionHeader
              step={t("audiencePulse.sourceStep")}
              title={t("audiencePulse.sourceTitle")}
              titleId="audience-source-title"
              description={t("audiencePulse.sourceBody")}
            />
            <div className="audience-pulse-input">
              <fieldset className="audience-pulse-source">
                <legend className="mono-label">{t("audiencePulse.sourceLegend")}</legend>
                <div
                  className="audience-pulse-source__options"
                  role="radiogroup"
                  aria-label={t("audiencePulse.sourceLegend")}
                >
                  <label
                    className={
                      inputMode === "youtube"
                        ? "audience-pulse-source__option is-active"
                        : "audience-pulse-source__option"
                    }
                  >
                    <input
                      type="radio"
                      name="audience-source-mode"
                      value="youtube"
                      checked={inputMode === "youtube"}
                      onChange={() => setInputMode("youtube")}
                      disabled={requestActive}
                    />
                    <span>{t("audiencePulse.modeYoutube")}</span>
                  </label>
                  <label
                    className={
                      inputMode === "manual"
                        ? "audience-pulse-source__option is-active"
                        : "audience-pulse-source__option"
                    }
                  >
                    <input
                      type="radio"
                      name="audience-source-mode"
                      value="manual"
                      checked={inputMode === "manual"}
                      onChange={() => setInputMode("manual")}
                      disabled={requestActive}
                    />
                    <span>{t("audiencePulse.modeManual")}</span>
                  </label>
                </div>
              </fieldset>

              {inputMode === "youtube" ? (
                <div className="audience-pulse-field">
                  <label className="mono-label" htmlFor="audience-youtube-url">
                    {t("audiencePulse.urlLabel")}
                  </label>
                  <input
                    id="audience-youtube-url"
                    type="url"
                    className="audience-pulse-field__control"
                    value={youtubeUrl}
                    onChange={(event) => setYoutubeUrl(event.target.value)}
                    placeholder="https://www.youtube.com/shorts/abcdefghijk"
                    disabled={requestActive}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="field-hint">{t("audiencePulse.urlHint")}</p>
                </div>
              ) : (
                <>
                  <div className="audience-pulse-field audience-pulse-field--source">
                    <label className="mono-label" htmlFor="audience-manual-source">
                      {t("audiencePulse.platformLabel")}
                    </label>
                    <select
                      id="audience-manual-source"
                      className="audience-pulse-field__control"
                      value={manualSource}
                      onChange={(event) =>
                        setManualSource(event.target.value as ManualAudienceSource)
                      }
                      disabled={requestActive}
                    >
                      {MANUAL_AUDIENCE_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {t(PLATFORM_KEYS[source])}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="audience-pulse-field">
                    <label className="mono-label" htmlFor="audience-comments-text">
                      {t("audiencePulse.pasteLabel")}
                    </label>
                    <textarea
                      id="audience-comments-text"
                      className="audience-pulse-field__control audience-pulse-field__comments"
                      value={commentsText}
                      onChange={(event) => setCommentsText(event.target.value)}
                      rows={10}
                      disabled={requestActive}
                      placeholder={t("audiencePulse.pastePlaceholder")}
                      spellCheck={false}
                    />
                    <p className="field-hint">{t("audiencePulse.pasteHint")}</p>
                  </div>
                </>
              )}
            </div>
            {sampledNotice && (
              <p className="field-error" role="status">
                {t("audiencePulse.sampledNotice")}
              </p>
            )}
          </div>

          {requestError && (
            <div className="request-error" role="alert">
              <p>{localizeRequestError(locale, requestError.code, "audience")}</p>
              {requestError.retryable && (
                <button className="secondary-button" type="submit" disabled={requestActive}>
                  {t("audiencePulse.retry")}
                </button>
              )}
            </div>
          )}

          <div className="review-section">
            <button className="primary-button" type="submit" disabled={requestActive}>
              {requestActive ? t("audiencePulse.analyzing") : t("audiencePulse.analyze")}
            </button>
          </div>
        </form>

        {report && (
          <AudiencePulseReportView
            report={report}
            manualSource={manualSource}
            onRetryAnalysis={
              report.analysis_status === "not_evaluated" ? retryAnalysis : undefined
            }
            retrying={requestActive}
          />
        )}
      </section>
    </>
  );
}
