import type { ComplianceResult } from "../../types/compliance";
import { formatTimestamp } from "../../utils/timestamp";
import type { FindingFixState } from "./useFixGeneration";

interface FixRecommendationProps {
  finding: ComplianceResult;
  state: FindingFixState;
  onGenerate: () => void;
  onDismiss: () => void;
}

const ACTION_LABELS = {
  insert: "Insert",
  replace: "Replace",
  review_manually: "Review manually",
} as const;

function placementLabel(state: FindingFixState): string | null {
  const placement = state.suggestion?.placement;
  if (!placement) return null;
  const timestamp =
    placement.timestamp_seconds === null
      ? null
      : formatTimestamp(placement.timestamp_seconds);
  switch (placement.strategy) {
    case "after_segment":
      return timestamp ? `After ${timestamp}` : "After the selected passage";
    case "replace_segment":
      return timestamp ? `Replace wording at ${timestamp}` : "Replace selected wording";
    case "review_segment":
      return timestamp ? `Review wording at ${timestamp}` : "Review selected wording";
    case "before_deadline": {
      const deadline =
        placement.before_seconds === null
          ? null
          : formatTimestamp(placement.before_seconds);
      if (deadline && timestamp) return `Before ${deadline}; current mention at ${timestamp}`;
      return deadline ? `Before ${deadline}` : "Before the required deadline";
    }
  }
}

export function FixRecommendation({
  finding,
  state,
  onGenerate,
  onDismiss,
}: FixRecommendationProps) {
  if (finding.status === "pass") return null;
  if (finding.status === "not_evaluated") {
    return (
      <p className="fix-unavailable">
        Retry verification or review this requirement manually before requesting a
        correction.
      </p>
    );
  }

  const isGenerating = state.phase === "generating";
  const placement = placementLabel(state);
  return (
    <div className="fix-workflow" aria-live="polite" aria-busy={isGenerating}>
      {state.suggestion === null && state.phase !== "error" && (
        <button
          className="secondary-button fix-button"
          type="button"
          disabled={isGenerating}
          onClick={onGenerate}
          aria-label={`Generate fix for ${finding.requirement_id}`}
        >
          {isGenerating ? "Generating fix…" : "Generate fix"}
        </button>
      )}

      {state.suggestion !== null && (
        <section className="fix-recommendation" aria-label="Recommended change">
          <p className="mono-label">RECOMMENDED CHANGE</p>
          <h4>{ACTION_LABELS[state.suggestion.action]}</h4>
          {state.suggestion.suggested_text !== null && (
            <blockquote>“{state.suggestion.suggested_text}”</blockquote>
          )}
          <p>{state.suggestion.reason}</p>
          {placement && (
            <dl>
              <div>
                <dt className="mono-label">PLACEMENT</dt>
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
              {isGenerating ? "Regenerating…" : "Regenerate"}
            </button>
            <button className="text-button" type="button" onClick={onDismiss}>
              Dismiss suggestion
            </button>
          </div>
        </section>
      )}

      {state.error && (
        <div className="fix-error" role="alert">
          <p>{state.error.message}</p>
          {state.error.retryable && (
            <button className="secondary-button" type="button" onClick={onGenerate}>
              Retry fix
            </button>
          )}
        </div>
      )}
    </div>
  );
}
