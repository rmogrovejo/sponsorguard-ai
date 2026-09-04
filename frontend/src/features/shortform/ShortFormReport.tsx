import type {
  PreflightFinding,
  PreflightStatus,
  ReviewPriority,
  ShortFormReport,
  ShortFormSuggestion,
  SuggestionFindingId,
} from "../../types/shortform";
import { PLATFORM_OPTIONS, isSuggestionEligible } from "../../types/shortform";
import { formatTimestamp, formatTimestampPrecise } from "../../utils/timestamp";
import type { FindingSuggestionState } from "./useShortFormSuggestions";

interface ShortFormReportViewProps {
  report: ShortFormReport;
  onRetry?: () => void;
  retrying?: boolean;
  suggestionStateFor?: (findingId: SuggestionFindingId) => FindingSuggestionState;
  onSuggest?: (findingId: SuggestionFindingId) => void;
  onDismissSuggestion?: (findingId: SuggestionFindingId) => void;
}

const STATUS_LABELS = {
  pass: "Pass",
  warning: "Review",
  fail: "Fail",
  not_evaluated: "Not evaluated",
} as const;

function findingById(report: ShortFormReport, checkId: string): PreflightFinding | undefined {
  return report.findings.find((item) => item.check_id === checkId);
}

function isSemanticProviderGap(finding?: PreflightFinding): boolean {
  if (!finding || finding.status !== "not_evaluated") return false;
  const reason = finding.reason.toLowerCase();
  if (reason.includes("no usable speech") || reason.includes("no audio")) return false;
  return (
    reason.includes("language-model") ||
    reason.includes("provider failed") ||
    reason.includes("provider returned invalid") ||
    reason.includes("not configured") ||
    reason.includes("speech analysis is unavailable") ||
    reason.includes("were not evaluated")
  );
}

function pixelSize(finding?: PreflightFinding): string | null {
  const width = finding?.measurements?.width;
  const height = finding?.measurements?.height;
  if (typeof width === "number" && typeof height === "number") {
    return `${width} × ${height}`;
  }
  return null;
}

export function ShortFormReportView({
  report,
  onRetry,
  retrying = false,
  suggestionStateFor,
  onSuggest,
  onDismissSuggestion,
}: ShortFormReportViewProps) {
  const platformLabel =
    PLATFORM_OPTIONS.find((item) => item.value === report.platform)?.label ?? report.platform;
  const orientation = findingById(report, "orientation");
  const resolution = findingById(report, "resolution");
  const duration = findingById(report, "duration");
  const audio = findingById(report, "audio_track");
  const speech = findingById(report, "speech_activity");
  const opening = findingById(report, "opening");
  const pacing = findingById(report, "dead_air");
  const cta = findingById(report, "cta");
  const score = report.summary.readiness_score;
  const semanticNotice = isSemanticProviderGap(opening) && isSemanticProviderGap(cta);

  return (
    <section className="compliance-report shortform-report" aria-labelledby="shortform-report-heading">
      <header className="report-header">
        <div className="report-header__copy">
          <p className="mono-label">SHORT-FORM PREFLIGHT / {platformLabel.toUpperCase()}</p>
          <h2 id="shortform-report-heading">{platformLabel}</h2>
          <p>Format, speech, opening, pacing, and closing-action findings from the selected preset.</p>
        </div>
        <div className="report-metrics">
          <div
            className="score-block"
            aria-label={
              score === null
                ? "Readiness score unavailable"
                : `Readiness score ${score} out of 100`
            }
          >
            <span className="mono-label">READINESS</span>
            <strong>{score === null ? "—" : Number.isInteger(score) ? score.toFixed(0) : score.toFixed(1)}</strong>
            <span>{score === null ? "not scored" : "/ 100"}</span>
          </div>
          <div
            className="coverage-block"
            aria-label={`${report.summary.evaluated} of ${report.summary.total} checks evaluated`}
          >
            <span className="mono-label">CHECKS</span>
            <strong>
              {report.summary.evaluated} / {report.summary.total}
            </strong>
            <span>evaluated</span>
          </div>
        </div>
      </header>

      <div className="shortform-checks">
        {semanticNotice && (
          <SemanticNotice onRetry={onRetry} retrying={retrying} />
        )}
        <FormatSection orientation={orientation} resolution={resolution} />
        <CheckBlock
          title="Duration"
          finding={duration}
          detail={
            duration?.measurements && typeof duration.measurements.duration_seconds === "number"
              ? `${Number(duration.measurements.duration_seconds).toFixed(2)} sec`
              : null
          }
        />
        <CheckBlock title="Audio" finding={audio} />
        <SpeechBlock finding={speech} />
        <SemanticBlock
          title="Opening"
          finding={opening}
          concise={semanticNotice}
          fallback="Retry preflight to evaluate the opening."
          suggestionKind="opening"
          suggestionState={suggestionStateFor?.("opening")}
          onSuggest={onSuggest}
          onDismissSuggestion={onDismissSuggestion}
        />
        <PacingBlock finding={pacing} />
        <SemanticBlock
          title="Call to action"
          finding={cta}
          concise={semanticNotice}
          fallback="Retry preflight to evaluate the call to action."
          suggestionKind="cta"
          suggestionState={suggestionStateFor?.("cta")}
          onSuggest={onSuggest}
          onDismissSuggestion={onDismissSuggestion}
        />
        <ReportTimeline report={report} />
        <PriorityList priorities={report.priorities} />
      </div>
    </section>
  );
}

function Status({ status }: { status: PreflightStatus }) {
  return <span className={`status-label status-label--${status}`}>{STATUS_LABELS[status]}</span>;
}

function SemanticNotice({
  onRetry,
  retrying,
}: {
  onRetry?: () => void;
  retrying: boolean;
}) {
  return (
    <article className="shortform-check shortform-notice" aria-label="Semantic review partially unavailable">
      <header>
        <p className="mono-label">SEMANTIC REVIEW</p>
        <span className="status-label status-label--not_evaluated">Partially unavailable</span>
      </header>
      <p>Format, audio, duration, and pacing checks completed. Opening and CTA could not be evaluated.</p>
      {onRetry && (
        <button className="secondary-button" type="button" disabled={retrying} onClick={onRetry}>
          Retry preflight
        </button>
      )}
    </article>
  );
}

function FormatSection({
  orientation,
  resolution,
}: {
  orientation?: PreflightFinding;
  resolution?: PreflightFinding;
}) {
  if (!orientation && !resolution) return null;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">FORMAT</p>
      </header>
      {orientation && <FormatRow label="Orientation" finding={orientation} />}
      {resolution && <FormatRow label="Resolution" finding={resolution} />}
    </article>
  );
}

function FormatRow({ label, finding }: { label: string; finding: PreflightFinding }) {
  const size = pixelSize(finding);
  const compactPortrait = finding.reason.includes("9:16 portrait");
  return (
    <div className="shortform-subfinding">
      <header>
        <p className="mono-label">{label.toUpperCase()}</p>
        <Status status={finding.status} />
      </header>
      <p className="shortform-subfinding__lead">
        {compactPortrait ? "9:16 portrait" : finding.reason}
      </p>
      {size && <p className="mono-label">{size}</p>}
      {finding.recommendation && <p>{finding.recommendation}</p>}
    </div>
  );
}

function CheckBlock({
  title,
  finding,
  detail,
}: {
  title: string;
  finding?: PreflightFinding;
  detail?: string | null;
}) {
  if (!finding) return null;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{title.toUpperCase()}</p>
        <Status status={finding.status} />
      </header>
      {detail && <p className="mono-label shortform-measure">{detail}</p>}
      <p>{finding.reason}</p>
      {finding.recommendation && <p>{finding.recommendation}</p>}
    </article>
  );
}

function SpeechBlock({ finding }: { finding?: PreflightFinding }) {
  if (!finding) return null;
  const activity =
    finding.measurements && typeof finding.measurements.activity_start_seconds === "number"
      ? Number(finding.measurements.activity_start_seconds)
      : null;
  const estimated = activity !== null && finding.status === "pass";
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">SPEECH</p>
        <Status status={finding.status} />
      </header>
      {estimated && (
        <>
          <p className="shortform-range">
            Activity start
            <span>{formatTimestampPrecise(activity)}</span>
          </p>
          <p className="mono-label">Estimated</p>
          <p>First sustained voice-like activity detected.</p>
          <p>Energy-based estimate. Music or effects may also trigger this measurement.</p>
        </>
      )}
      {!estimated && <p>{finding.reason}</p>}
      {finding.recommendation && <p>{finding.recommendation}</p>}
    </article>
  );
}

function SemanticBlock({
  title,
  finding,
  concise,
  fallback,
  suggestionKind,
  suggestionState,
  onSuggest,
  onDismissSuggestion,
}: {
  title: string;
  finding?: PreflightFinding;
  concise: boolean;
  fallback: string;
  suggestionKind: SuggestionFindingId;
  suggestionState?: FindingSuggestionState;
  onSuggest?: (findingId: SuggestionFindingId) => void;
  onDismissSuggestion?: (findingId: SuggestionFindingId) => void;
}) {
  if (!finding) return null;
  const providerGap = isSemanticProviderGap(finding);
  const stamp = finding.ranges[0]?.start_seconds;
  const reason = providerGap ? (concise ? fallback : "Semantic review temporarily unavailable.") : finding.reason;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{title.toUpperCase()}</p>
        <Status status={finding.status} />
      </header>
      <p>{reason}</p>
      {!providerGap && finding.recommendation && <p>{finding.recommendation}</p>}
      {!providerGap && (stamp !== undefined || finding.evidence_text) && (
        <div className="shortform-evidence">
          <p className="mono-label">EVIDENCE</p>
          {stamp !== undefined && (
            <p className="shortform-range">{formatTimestampPrecise(stamp)}</p>
          )}
          {finding.evidence_text && <blockquote>{finding.evidence_text}</blockquote>}
        </div>
      )}
      {!providerGap && onSuggest && (
        <SuggestionPanel
          finding={finding}
          kind={suggestionKind}
          state={suggestionState}
          onSuggest={onSuggest}
          onDismiss={onDismissSuggestion}
        />
      )}
    </article>
  );
}

function SuggestionPanel({
  finding,
  kind,
  state,
  onSuggest,
  onDismiss,
}: {
  finding: PreflightFinding;
  kind: SuggestionFindingId;
  state?: FindingSuggestionState;
  onSuggest: (findingId: SuggestionFindingId) => void;
  onDismiss?: (findingId: SuggestionFindingId) => void;
}) {
  if (!isSuggestionEligible(finding)) return null;
  const phase = state?.phase ?? "idle";
  const generating = phase === "generating";
  const actionLabel = kind === "opening" ? "Suggest stronger opening" : "Suggest CTA";
  const recommendedLabel = kind === "opening" ? "RECOMMENDED OPENING" : "RECOMMENDED CTA";
  const showInitialAction = phase === "idle" || (phase === "error" && !state?.suggestion) || (phase === "generating" && !state?.suggestion);
  return (
    <div
      className="shortform-suggestion"
      aria-busy={generating}
      aria-live="polite"
    >
      {showInitialAction && (
        <button
          className="secondary-button"
          type="button"
          disabled={generating}
          onClick={() => onSuggest(kind)}
        >
          {generating ? "Suggesting…" : phase === "error" ? "Retry" : actionLabel}
        </button>
      )}
      {phase === "error" && state?.error && (
        <p className="shortform-suggestion__error" role="alert">
          {state.error.message}
        </p>
      )}
      {state?.suggestion && (phase === "success" || phase === "error" || phase === "generating") && (
        <SuggestionResult
          suggestion={state.suggestion}
          recommendedLabel={recommendedLabel}
          regenerating={generating}
          onRegenerate={() => onSuggest(kind)}
          onDismiss={onDismiss ? () => onDismiss(kind) : undefined}
        />
      )}
    </div>
  );
}

function SuggestionResult({
  suggestion,
  recommendedLabel,
  regenerating = false,
  onRegenerate,
  onDismiss,
}: {
  suggestion: ShortFormSuggestion;
  recommendedLabel: string;
  regenerating?: boolean;
  onRegenerate: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="shortform-suggestion__result">
      <p className="mono-label">{recommendedLabel}</p>
      <p className="mono-label">{suggestion.display_label}</p>
      {suggestion.suggested_text && (
        <blockquote cite="suggestion">{suggestion.suggested_text}</blockquote>
      )}
      <p>{suggestion.reason}</p>
      <p className="mono-label">PLACEMENT</p>
      <p className="shortform-range">{formatSuggestionPlacement(suggestion)}</p>
      <div className="shortform-suggestion__actions">
        <button className="text-button" type="button" disabled={regenerating} onClick={onRegenerate}>
          {regenerating ? "Suggesting…" : "Regenerate"}
        </button>
        {onDismiss && (
          <button className="text-button" type="button" disabled={regenerating} onClick={onDismiss}>
            Dismiss suggestion
          </button>
        )}
      </div>
    </div>
  );
}

function formatSuggestionPlacement(suggestion: ShortFormSuggestion): string {
  const { placement } = suggestion;
  if (placement.strategy === "replace_opening" && placement.start_seconds != null && placement.end_seconds != null) {
    return `Replace opening / ${formatTimestampPrecise(placement.start_seconds)}–${formatTimestampPrecise(placement.end_seconds)}`;
  }
  if (placement.strategy === "opening_first_seconds") {
    return "Opening / first seconds";
  }
  if (placement.after_seconds != null) {
    return `Near ending / after ${formatTimestampPrecise(placement.after_seconds)}`;
  }
  return "Near ending";
}

function PacingBlock({ finding }: { finding?: PreflightFinding }) {
  if (!finding) return null;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">PACING</p>
        <Status status={finding.status} />
      </header>
      {finding.ranges.map((range) => (
        <p key={`${range.start_seconds}-${range.end_seconds}`} className="shortform-range">
          {formatTimestampPrecise(range.start_seconds)}–{formatTimestampPrecise(range.end_seconds)}
          <span>{range.duration_seconds.toFixed(2)} sec low-energy interval</span>
        </p>
      ))}
      <p>{finding.reason}</p>
      {finding.recommendation && <p>{finding.recommendation}</p>}
    </article>
  );
}

type TimelineMark = {
  key: string;
  label: string;
  seconds: number;
  endSeconds?: number;
  kind: "hook" | "pacing" | "cta";
};

function ReportTimeline({ report }: { report: ShortFormReport }) {
  const duration = report.media.duration_seconds;
  if (duration <= 0) return null;
  const marks = collectTimelineMarks(report);
  if (marks.length === 0) return null;
  const laidOut = layoutMarks(marks, duration);
  const stacked = laidOut.some((mark) => mark.offset > 0);
  const pacingLegend = marks.filter((mark) => mark.kind === "pacing" && marks.filter((item) => item.kind === "pacing").length > 1);
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">TIMELINE</p>
      </header>
      <div className="shortform-timeline" aria-label="Short-form timeline">
        <div className={`shortform-timeline__track${stacked ? " shortform-timeline__track--stacked" : ""}`}>
          {laidOut.map((mark) => (
            <span
              key={mark.key}
              className={`shortform-timeline__mark shortform-timeline__mark--${mark.align}${mark.offset > 0 ? " shortform-timeline__mark--offset" : ""}`}
              style={{ left: `${mark.left}%` }}
              aria-label={`${mark.label} at ${formatTimestampPrecise(mark.seconds)}`}
            >
              ▲
              <em>{mark.label}</em>
            </span>
          ))}
        </div>
        <div className="shortform-timeline__scale">
          <span>{formatTimestamp(0)}</span>
          <span>{formatTimestamp(duration / 2)}</span>
          <span>{formatTimestamp(duration)}</span>
        </div>
        {pacingLegend.length > 0 && (
          <ul className="shortform-timeline__legend">
            {pacingLegend.map((mark) => (
              <li key={mark.key}>
                <span>{mark.label}</span>
                <span>
                  {formatTimestampPrecise(mark.seconds)}
                  {mark.endSeconds !== undefined ? `–${formatTimestampPrecise(mark.endSeconds)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function collectTimelineMarks(report: ShortFormReport): TimelineMark[] {
  const marks: TimelineMark[] = [];
  const opening = findingById(report, "opening");
  const pacing = findingById(report, "dead_air");
  const cta = findingById(report, "cta");
  const openingAt = opening?.ranges[0]?.start_seconds;
  if (openingAt !== undefined && opening?.status !== "not_evaluated") {
    marks.push({
      key: "hook",
      label: "HOOK",
      seconds: openingAt,
      kind: "hook",
    });
  }
  const pacingRanges = pacing?.ranges ?? [];
  pacingRanges.forEach((range, index) => {
    marks.push({
      key: `pacing-${range.start_seconds}-${range.end_seconds}`,
      label: pacingRanges.length > 1 ? `P${index + 1}` : "PACING",
      seconds: range.start_seconds,
      endSeconds: range.end_seconds,
      kind: "pacing",
    });
  });
  const ctaAt = cta?.ranges[0]?.start_seconds;
  if (ctaAt !== undefined && cta?.status === "pass") {
    marks.push({
      key: "cta",
      label: "CTA",
      seconds: ctaAt,
      kind: "cta",
    });
  }
  return marks;
}

function layoutMarks(marks: TimelineMark[], duration: number) {
  const cluster = 8;
  return marks.map((mark, index) => {
    const raw = (mark.seconds / duration) * 100;
    const left = Math.min(96, Math.max(1, raw));
    let offset = 0;
    for (let prior = 0; prior < index; prior += 1) {
      const previous = (marks[prior].seconds / duration) * 100;
      if (Math.abs(left - previous) < cluster) {
        offset += 1;
      }
    }
    const align = left <= 6 ? "start" : left >= 90 ? "end" : "center";
    return { ...mark, left, offset, align };
  });
}

function PriorityList({ priorities }: { priorities: ReviewPriority[] }) {
  if (priorities.length === 0) return null;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">REVIEW PRIORITIES</p>
      </header>
      <ol className="shortform-priorities">
        {priorities.map((item) => (
          <li key={`${item.rank}-${item.check_id}`}>
            <span className="mono-label">{String(item.rank).padStart(2, "0")}</span>
            {item.title}
          </li>
        ))}
      </ol>
    </article>
  );
}
