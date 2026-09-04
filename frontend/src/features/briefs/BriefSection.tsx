import type { BriefExtractionPhase, ExtractedRequirement } from "../../types/briefs";
import { REQUIREMENT_LABEL_KEYS } from "../requirements/requirementLabels";
import { SectionHeader } from "../shell/SectionHeader";
import { MAX_BRIEF_CHARACTERS, type BriefExtractionError } from "./useBriefExtraction";
import { localizeRequestError } from "../../i18n/requestError";
import { useTranslation } from "../../i18n/useTranslation";

interface BriefSectionProps {
  brief: string;
  disabled: boolean;
  phase: BriefExtractionPhase;
  error: BriefExtractionError | null;
  requirements: ExtractedRequirement[];
  onBriefChange: (value: string) => void;
  onExtract: () => void;
  onRetry: () => void;
  onAppend: () => void;
  onDiscard: () => void;
  onRemoveCandidate: (id: string) => void;
}

export function BriefSection({
  brief,
  disabled,
  phase,
  error,
  requirements,
  onBriefChange,
  onExtract,
  onRetry,
  onAppend,
  onDiscard,
  onRemoveCandidate,
}: BriefSectionProps) {
  const { t, locale } = useTranslation();
  const extracting = phase === "extracting";
  const statusText =
    phase === "extracting"
      ? t("sponsored.extractingStatus")
      : phase === "success"
        ? t(requirements.length === 1 ? "sponsored.readyOne" : "sponsored.readyMany", {
            count: requirements.length,
          })
        : "";

  return (
    <section className="review-section brief-section" aria-labelledby="brief-heading">
      <SectionHeader
        step={t("sponsored.briefStep")}
        title={t("sponsored.briefTitle")}
        titleId="brief-heading"
        description={t("sponsored.briefBody")}
        action={
          <button
            className="secondary-button"
            type="button"
            disabled={disabled || extracting}
            onClick={onExtract}
          >
            {extracting ? t("sponsored.extracting") : t("sponsored.extract")}
          </button>
        }
      />

      <div className="form-field brief-field">
        <label htmlFor="sponsor-brief">{t("sponsored.briefLabel")}</label>
        <textarea
          id="sponsor-brief"
          value={brief}
          disabled={disabled || extracting}
          maxLength={MAX_BRIEF_CHARACTERS}
          placeholder={t("sponsored.briefPlaceholder")}
          onChange={(event) => onBriefChange(event.target.value)}
          aria-invalid={Boolean(error?.code === "CLIENT_VALIDATION_ERROR")}
          aria-describedby="sponsor-brief-note sponsor-brief-status"
        />
        <div className="brief-field__meta" id="sponsor-brief-note">
          <span>{t("sponsored.briefOptional")}</span>
          <span className="mono-label">
            {brief.length.toLocaleString()} / {MAX_BRIEF_CHARACTERS.toLocaleString()}
          </span>
        </div>
      </div>

      <div
        className="brief-status"
        id="sponsor-brief-status"
        role={error ? "alert" : "status"}
        aria-live="polite"
      >
        {statusText && <p>{statusText}</p>}
        {error && (
          <div className="brief-error">
            <div>
              <p className="mono-label">{t("sponsored.extractionFailed")}</p>
              <p>{localizeRequestError(locale, error.code, "brief")}</p>
              <p>{t("sponsored.briefUnchanged")}</p>
            </div>
            {error.retryable && (
              <button
                className="secondary-button"
                type="button"
                disabled={disabled || extracting}
                onClick={onRetry}
              >
                {t("sponsored.retryExtract")}
              </button>
            )}
          </div>
        )}
      </div>

      {phase === "success" && (
        <div className="extraction-review" aria-labelledby="extraction-review-heading">
          <header className="extraction-review__header">
            <div>
              <p className="mono-label">{t("sponsored.humanReview")}</p>
              <h3 id="extraction-review-heading">{t("sponsored.extractedChecklist")}</h3>
              <p>{t("sponsored.staged")}</p>
            </div>
            <div className="extraction-review__actions">
              <button
                className="text-button"
                type="button"
                disabled={disabled}
                onClick={onDiscard}
              >
                {t("sponsored.discard")}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={disabled || requirements.length === 0}
                onClick={onAppend}
              >
                {t("sponsored.appendCount", { count: requirements.length })}
              </button>
            </div>
          </header>

          {requirements.length === 0 ? (
            <p className="extraction-review__empty">
              {t("sponsored.noneFound")}
            </p>
          ) : (
            <ol className="extraction-candidates">
              {requirements.map((requirement) => (
                <li key={requirement.id}>
                  <div className="extraction-candidate__heading">
                    <div>
                      <p className="mono-label">
                        {t(REQUIREMENT_LABEL_KEYS[requirement.type])}
                      </p>
                      <h4>{requirement.value}</h4>
                    </div>
                    <button
                      className="text-button text-button--danger"
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemoveCandidate(requirement.id)}
                      aria-label={t("sponsored.excludeAria", { description: requirement.description })}
                    >
                      {t("sponsored.exclude")}
                    </button>
                  </div>
                  <p>{requirement.description}</p>
                  {requirement.before_seconds !== null && (
                    <p className="extraction-candidate__deadline mono-label">
                      {t("sponsored.deadlineSec", { seconds: requirement.before_seconds })}
                    </p>
                  )}
                  <figure>
                    <figcaption className="mono-label">{t("sponsored.source")}</figcaption>
                    <blockquote>“{requirement.source_text}”</blockquote>
                  </figure>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
