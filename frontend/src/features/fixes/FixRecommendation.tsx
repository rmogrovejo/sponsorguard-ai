import type { ComplianceResult } from "../../types/compliance";
import { localizeRequestError } from "../../i18n/requestError";
import type { MessageKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import { formatTimestamp } from "../../utils/timestamp";
import type { FindingFixState } from "./useFixGeneration";

interface FixRecommendationProps {
  finding: ComplianceResult;
  state: FindingFixState;
  onGenerate: () => void;
  onDismiss: () => void;
}

const ACTION_KEYS = {
  insert: "fix.insert",
  replace: "fix.replace",
  review_manually: "fix.reviewManually",
} as const satisfies Record<string, MessageKey>;

function placementLabel(
  state: FindingFixState,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string | null {
  const placement = state.suggestion?.placement;
  if (!placement) return null;
  const timestamp =
    placement.timestamp_seconds === null
      ? null
      : formatTimestamp(placement.timestamp_seconds);
  switch (placement.strategy) {
    case "after_segment":
      return timestamp ? t("fix.afterTime", { time: timestamp }) : t("fix.afterPassage");
    case "replace_segment":
      return timestamp ? t("fix.replaceAt", { time: timestamp }) : t("fix.replaceSelected");
    case "review_segment":
      return timestamp ? t("fix.reviewAt", { time: timestamp }) : t("fix.reviewSelected");
    case "before_deadline": {
      const deadline =
        placement.before_seconds === null
          ? null
          : formatTimestamp(placement.before_seconds);
      if (deadline && timestamp) return t("fix.beforeBoth", { deadline, time: timestamp });
      return deadline ? t("fix.beforeDeadline", { deadline }) : t("fix.beforeRequired");
    }
  }
}

export function FixRecommendation({
  finding,
  state,
  onGenerate,
  onDismiss,
}: FixRecommendationProps) {
  const { t, locale } = useTranslation();
  if (finding.status === "pass") return null;
  if (finding.status === "not_evaluated") {
    return <p className="fix-unavailable">{t("fix.unavailable")}</p>;
  }

  const isGenerating = state.phase === "generating";
  const placement = placementLabel(state, t);
  return (
    <div className="fix-workflow" aria-live="polite" aria-busy={isGenerating}>
      {state.suggestion === null && state.phase !== "error" && (
        <button
          className="secondary-button fix-button"
          type="button"
          disabled={isGenerating}
          onClick={onGenerate}
          aria-label={t("fix.generateAria", { id: finding.requirement_id })}
        >
          {isGenerating ? t("fix.generating") : t("fix.generate")}
        </button>
      )}

      {state.suggestion !== null && (
        <section className="fix-recommendation" aria-label={t("fix.recommended")}>
          <p className="mono-label">{t("fix.recommended")}</p>
          <h4>{t(ACTION_KEYS[state.suggestion.action])}</h4>
          {state.suggestion.suggested_text !== null && (
            <blockquote>“{state.suggestion.suggested_text}”</blockquote>
          )}
          {placement && (
            <dl>
              <div>
                <dt className="mono-label">{t("fix.placement")}</dt>
                <dd>{placement}</dd>
              </div>
            </dl>
          )}
          <div className="fix-recommendation__actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isGenerating}
              onClick={onGenerate}
            >
              {isGenerating ? t("fix.regenerating") : t("fix.regenerate")}
            </button>
            <button className="text-button" type="button" onClick={onDismiss}>
              {t("fix.dismiss")}
            </button>
          </div>
        </section>
      )}

      {state.error && (
        <div className="fix-error" role="alert">
          <p>{localizeRequestError(locale, state.error.code, "fix")}</p>
          {state.error.retryable && (
            <button className="secondary-button" type="button" onClick={onGenerate}>
              {t("fix.retry")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
