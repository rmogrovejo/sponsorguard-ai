import { useEffect, useRef, type ChangeEvent, type FormEvent } from "react";

import { PLATFORM_OPTIONS, SHORTFORM_MAX_UPLOAD_BYTES } from "../../types/shortform";
import type { ShortFormPlatform } from "../../types/shortform";
import { localizeRequestError } from "../../i18n/requestError";
import type { MessageKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import { formatTimestamp } from "../../utils/timestamp";
import type { ShortFormDraft } from "../persistence/draftSchema";
import { SectionHeader } from "../shell/SectionHeader";
import { ShortFormReportView } from "./ShortFormReport";
import { useShortFormPreflight } from "./useShortFormPreflight";
import { useShortFormSuggestions } from "./useShortFormSuggestions";

const PHASE_KEYS = {
  idle: "shortform.phaseIdle",
  analyzing: "shortform.phaseAnalyzing",
  success: "shortform.phaseSuccess",
  error: "shortform.phaseError",
} as const satisfies Record<string, MessageKey>;

const PLATFORM_LABEL = {
  tiktok: "shortform.tiktok",
  youtube_shorts: "shortform.youtube_shorts",
  instagram_reels: "shortform.instagram_reels",
} as const satisfies Record<ShortFormPlatform, MessageKey>;

const PLATFORM_DETAIL = {
  tiktok: "shortform.tiktokDetail",
  youtube_shorts: "shortform.youtube_shortsDetail",
  instagram_reels: "shortform.instagram_reelsDetail",
} as const satisfies Record<ShortFormPlatform, MessageKey>;

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

interface ShortFormWorkspaceProps {
  initialPlatform?: ShortFormPlatform;
  restoredVideoSelected?: boolean;
  onDraftChange?: (draft: ShortFormDraft) => void;
}

export function ShortFormWorkspace({
  initialPlatform = "tiktok",
  restoredVideoSelected = false,
  onDraftChange,
}: ShortFormWorkspaceProps = {}) {
  const { t, locale } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const skipDraftPublish = useRef(true);
  const {
    platform,
    setPlatform,
    selection,
    selectionError,
    phase,
    requestError,
    report,
    selectFile,
    analyze,
  } = useShortFormPreflight(initialPlatform);
  const { generate: generateSuggestion, dismiss: dismissSuggestion, stateFor } =
    useShortFormSuggestions(report);
  const requestActive = phase === "analyzing";
  const showReselectNotice = restoredVideoSelected && selection === null;

  useEffect(() => {
    if (!onDraftChange) return;
    if (skipDraftPublish.current) {
      skipDraftPublish.current = false;
      return;
    }
    onDraftChange({
      platform,
      hadVideoSelected: selection !== null || showReselectNotice,
    });
  }, [platform, selection, showReselectNotice, onDraftChange]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    void selectFile(file);
  };

  const removeFile = () => {
    if (inputRef.current) inputRef.current.value = "";
    void selectFile(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void analyze();
  };

  return (
    <>
      <section className="review-introduction" aria-labelledby="shortform-title">
        <div className="section-index">
          <span>{t("shortform.index")}</span>
          <span className="mono-label">{t("shortform.protocol")}</span>
        </div>
        <div className="review-introduction__grid">
          <div>
            <p className="review-introduction__eyebrow mono-label">{t("shortform.eyebrow")}</p>
            <h1 id="shortform-title">{t("shortform.heroTitle")}</h1>
          </div>
          <p>{t("shortform.heroBody")}</p>
        </div>
      </section>

      <form className="review-workspace" noValidate onSubmit={submit} aria-busy={requestActive}>
        <div className="workspace-docket">
          <div>
            <p className="mono-label">{t("shortform.docket")}</p>
            <h2>{t("shortform.docketTitle")}</h2>
          </div>
          <p className="request-state" aria-live="polite">
            {t("shortform.status", { phase: t(PHASE_KEYS[phase]) })}
          </p>
        </div>

        <section className="review-section" aria-labelledby="platform-heading">
          <SectionHeader
            step={t("shortform.platformStep")}
            title={t("shortform.platformTitle")}
            titleId="platform-heading"
            description={t("shortform.platformBody")}
          />
          <fieldset className="platform-options" disabled={requestActive}>
            <legend className="visually-hidden">{t("shortform.platformLegend")}</legend>
            {PLATFORM_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="shortform-platform"
                  value={option.value}
                  checked={platform === option.value}
                  onChange={() => setPlatform(option.value)}
                />
                <strong>{t(PLATFORM_LABEL[option.value])}</strong>
                <span>{t(PLATFORM_DETAIL[option.value])}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="review-section" aria-labelledby="video-heading">
          <SectionHeader
            step={t("shortform.videoStep")}
            title={t("shortform.videoTitle")}
            titleId="video-heading"
            description={t("shortform.videoBody")}
          />
          <div className="transcript-toolbar">
            <input
              ref={inputRef}
              id="shortform-video"
              className="visually-hidden"
              type="file"
              accept=".mp4,video/mp4"
              disabled={requestActive}
              onChange={handleFile}
            />
            <div className="transcript-toolbar__actions">
              <label className="secondary-button" htmlFor="shortform-video">
                {selection ? t("shortform.replaceVideo") : t("shortform.chooseMp4")}
              </label>
              {selection && (
                <button className="text-button" type="button" onClick={removeFile}>
                  {t("shortform.removeFile")}
                </button>
              )}
            </div>
            <p>
              {t("shortform.videoHint", {
                max: Math.round(SHORTFORM_MAX_UPLOAD_BYTES / 1_000_000),
              })}
            </p>
          </div>
          {showReselectNotice && (
            <p className="draft-restore-notice" role="status">
              {t("shortform.reselectVideo")}
            </p>
          )}
          {selection && (
            <dl className="video-meta" aria-label={t("shortform.selectedVideo")}>
              <div>
                <dt>{t("shortform.filename")}</dt>
                <dd>{selection.filename}</dd>
              </div>
              <div>
                <dt>{t("shortform.size")}</dt>
                <dd>{formatBytes(selection.sizeBytes)}</dd>
              </div>
              <div>
                <dt>{t("shortform.duration")}</dt>
                <dd>
                  {selection.durationSeconds === null
                    ? t("shortform.measuredLater")
                    : formatTimestamp(selection.durationSeconds)}
                </dd>
              </div>
              <div>
                <dt>{t("shortform.dimensions")}</dt>
                <dd>
                  {selection.width && selection.height
                    ? `${selection.width} × ${selection.height}`
                    : t("shortform.measuredLater")}
                </dd>
              </div>
              <div>
                <dt>{t("shortform.platform")}</dt>
                <dd>{t(PLATFORM_LABEL[platform])}</dd>
              </div>
            </dl>
          )}
          {selectionError && (
            <p className="field-error" role="alert">
              {t(selectionError)}
            </p>
          )}
        </section>

        {requestError && (
          <div className="request-error" role="alert">
            <div>
              <p className="mono-label">{t("shortform.notCompleted")}</p>
              <h3>{localizeRequestError(locale, requestError.code, "shortform")}</h3>
            </div>
            {requestError.retryable && (
              <button
                className="secondary-button"
                type="button"
                disabled={requestActive}
                onClick={() => void analyze()}
              >
                {t("shortform.retry")}
              </button>
            )}
          </div>
        )}

        <footer className="analysis-bar">
          <div>
            <p className="mono-label">{t("shortform.analyzeStep")}</p>
            <p>{t("shortform.analyzeBody")}</p>
          </div>
          <button className="primary-button" type="submit" disabled={requestActive || !selection}>
            {requestActive ? t("shortform.running") : t("shortform.start")}
          </button>
        </footer>
      </form>

      {report && (
        <ShortFormReportView
          report={report}
          onRetry={() => void analyze()}
          retrying={requestActive}
          suggestionStateFor={stateFor}
          onSuggest={(findingId) => void generateSuggestion(findingId)}
          onDismissSuggestion={dismissSuggestion}
        />
      )}
    </>
  );
}
