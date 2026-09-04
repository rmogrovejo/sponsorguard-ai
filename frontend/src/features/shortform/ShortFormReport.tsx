import type {
  PreflightFinding,
  PreflightStatus,
  ReviewPriority,
  ShortFormReport,
  ShortFormSuggestion,
  SuggestionFindingId,
} from "../../types/shortform";
import { isSuggestionEligible } from "../../types/shortform";
import type { ShortFormPlatform } from "../../types/shortform";
import { localizeRequestError } from "../../i18n/requestError";
import type { MessageKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import { formatTimestamp, formatTimestampPrecise } from "../../utils/timestamp";
import { localizeFindingCopy, localizePriority, type FindingCopyContext } from "./localizeFinding";
import type { FindingSuggestionState } from "./useShortFormSuggestions";

interface ShortFormReportViewProps {
  report: ShortFormReport;
  onRetry?: () => void;
  retrying?: boolean;
  suggestionStateFor?: (findingId: SuggestionFindingId) => FindingSuggestionState;
  onSuggest?: (findingId: SuggestionFindingId) => void;
  onDismissSuggestion?: (findingId: SuggestionFindingId) => void;
}

const STATUS_KEYS = {
  pass: "shortform.pass",
  warning: "shortform.review",
  fail: "shortform.fail",
  not_evaluated: "shortform.notEvaluated",
} as const satisfies Record<PreflightStatus, MessageKey>;

const PLATFORM_LABEL = {
  tiktok: "shortform.tiktok",
  youtube_shorts: "shortform.youtube_shorts",
  instagram_reels: "shortform.instagram_reels",
} as const satisfies Record<ShortFormPlatform, MessageKey>;

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
  const { t } = useTranslation();
  const platformLabel = t(PLATFORM_LABEL[report.platform]);
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
  const copyContext: FindingCopyContext = {
    platform: report.platform,
    hasAudio: report.media.has_audio,
  };

  return (
    <section className="compliance-report shortform-report" aria-labelledby="shortform-report-heading">
      <header className="report-header">
        <div className="report-header__copy">
          <p className="mono-label">{t("shortform.reportKicker", { platform: platformLabel.toUpperCase() })}</p>
          <h2 id="shortform-report-heading">{platformLabel}</h2>
          <p>{t("shortform.reportBody")}</p>
        </div>
        <div className="report-metrics">
          <div
            className="score-block"
            aria-label={
              score === null
                ? t("shortform.readinessUnavailable")
                : t("shortform.readinessScore", { score })
            }
          >
            <span className="mono-label">{t("shortform.readiness")}</span>
            <strong>{score === null ? "—" : Number.isInteger(score) ? score.toFixed(0) : score.toFixed(1)}</strong>
            <span>{score === null ? t("shortform.notScored") : "/ 100"}</span>
          </div>
          <div
            className="coverage-block"
            aria-label={t("shortform.checksAria", {
              evaluated: report.summary.evaluated,
              total: report.summary.total,
            })}
          >
            <span className="mono-label">{t("shortform.checks")}</span>
            <strong>
              {report.summary.evaluated} / {report.summary.total}
            </strong>
            <span>{t("shortform.evaluated")}</span>
          </div>
        </div>
      </header>

      <div className="shortform-checks">
        {semanticNotice && (
          <SemanticNotice onRetry={onRetry} retrying={retrying} />
        )}
        <FormatSection orientation={orientation} resolution={resolution} context={copyContext} />
        <CheckBlock
          title={t("shortform.durationCheck")}
          finding={duration}
          context={copyContext}
          detail={
            duration?.measurements && typeof duration.measurements.duration_seconds === "number"
              ? t("shortform.seconds", {
                  value: Number(duration.measurements.duration_seconds).toFixed(2),
                })
              : null
          }
        />
        <CheckBlock title={t("shortform.audio")} finding={audio} context={copyContext} />
        <SpeechBlock finding={speech} context={copyContext} />
        <SemanticBlock
          title={t("shortform.opening")}
          finding={opening}
          context={copyContext}
          concise={semanticNotice}
          fallback={t("shortform.openingFallback")}
          suggestionKind="opening"
          suggestionState={suggestionStateFor?.("opening")}
          onSuggest={onSuggest}
          onDismissSuggestion={onDismissSuggestion}
        />
        <PacingBlock finding={pacing} context={copyContext} />
        <SemanticBlock
          title={t("shortform.cta")}
          finding={cta}
          context={copyContext}
          concise={semanticNotice}
          fallback={t("shortform.ctaFallback")}
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
  const { t } = useTranslation();
  return <span className={`status-label status-label--${status}`}>{t(STATUS_KEYS[status])}</span>;
}

function SemanticNotice({
  onRetry,
  retrying,
}: {
  onRetry?: () => void;
  retrying: boolean;
}) {
  const { t } = useTranslation();
  return (
    <article className="shortform-check shortform-notice" aria-label={t("shortform.semanticNoticeAria")}>
      <header>
        <p className="mono-label">{t("shortform.semanticReview")}</p>
        <span className="status-label status-label--not_evaluated">{t("shortform.partiallyUnavailable")}</span>
      </header>
      <p>{t("shortform.semanticNotice")}</p>
      {onRetry && (
        <button className="secondary-button" type="button" disabled={retrying} onClick={onRetry}>
          {t("shortform.retry")}
        </button>
      )}
    </article>
  );
}

function FormatSection({
  orientation,
  resolution,
  context,
}: {
  orientation?: PreflightFinding;
  resolution?: PreflightFinding;
  context: FindingCopyContext;
}) {
  const { t } = useTranslation();
  if (!orientation && !resolution) return null;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{t("shortform.format")}</p>
      </header>
      {orientation && (
        <FormatRow label={t("shortform.orientation")} finding={orientation} context={context} />
      )}
      {resolution && (
        <FormatRow label={t("shortform.resolution")} finding={resolution} context={context} />
      )}
    </article>
  );
}

function FormatRow({
  label,
  finding,
  context,
}: {
  label: string;
  finding: PreflightFinding;
  context: FindingCopyContext;
}) {
  const { t } = useTranslation();
  const size = pixelSize(finding);
  const copy = localizeFindingCopy(finding, context, t);
  return (
    <div className="shortform-subfinding">
      <header>
        <p className="mono-label">{label.toUpperCase()}</p>
        <Status status={finding.status} />
      </header>
      <p className="shortform-subfinding__lead">{copy.lead}</p>
      {size && <p className="mono-label">{size}</p>}
      {copy.recommendation && <p>{copy.recommendation}</p>}
    </div>
  );
}

function CheckBlock({
  title,
  finding,
  context,
  detail,
}: {
  title: string;
  finding?: PreflightFinding;
  context: FindingCopyContext;
  detail?: string | null;
}) {
  const { t } = useTranslation();
  if (!finding) return null;
  const copy = localizeFindingCopy(finding, context, t);
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{title.toUpperCase()}</p>
        <Status status={finding.status} />
      </header>
      {detail && <p className="mono-label shortform-measure">{detail}</p>}
      <p>{copy.lead}</p>
      {copy.recommendation && <p>{copy.recommendation}</p>}
    </article>
  );
}

function SpeechBlock({
  finding,
  context,
}: {
  finding?: PreflightFinding;
  context: FindingCopyContext;
}) {
  const { t } = useTranslation();
  if (!finding) return null;
  const copy = localizeFindingCopy(finding, context, t);
  const activity =
    finding.measurements && typeof finding.measurements.activity_start_seconds === "number"
      ? Number(finding.measurements.activity_start_seconds)
      : null;
  const estimated = activity !== null && finding.status === "pass";
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{t("shortform.speech")}</p>
        <Status status={finding.status} />
      </header>
      {estimated && (
        <>
          <p className="shortform-range">
            {t("shortform.activityStart")}
            <span>{formatTimestampPrecise(activity)}</span>
          </p>
          <p className="mono-label">{t("shortform.estimated")}</p>
          <p>{t("shortform.speechPassLead")}</p>
          <p>{t("shortform.speechPassNote")}</p>
        </>
      )}
      {!estimated && <p>{copy.lead}</p>}
      {!estimated && copy.recommendation && <p>{copy.recommendation}</p>}
    </article>
  );
}

function SemanticBlock({
  title,
  finding,
  context,
  concise,
  fallback,
  suggestionKind,
  suggestionState,
  onSuggest,
  onDismissSuggestion,
}: {
  title: string;
  finding?: PreflightFinding;
  context: FindingCopyContext;
  concise: boolean;
  fallback: string;
  suggestionKind: SuggestionFindingId;
  suggestionState?: FindingSuggestionState;
  onSuggest?: (findingId: SuggestionFindingId) => void;
  onDismissSuggestion?: (findingId: SuggestionFindingId) => void;
}) {
  const { t } = useTranslation();
  if (!finding) return null;
  const copy = localizeFindingCopy(finding, context, t);
  const providerGap = isSemanticProviderGap(finding);
  const stamp = finding.ranges[0]?.start_seconds;
  const reason = providerGap ? (concise ? fallback : copy.lead) : copy.lead;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{title.toUpperCase()}</p>
        <Status status={finding.status} />
      </header>
      <p>{reason}</p>
      {!providerGap && copy.recommendation && <p>{copy.recommendation}</p>}
      {!providerGap && copy.providerDetail && (
        <details className="technical-detail">
          <summary>{t("shortform.semanticDetail")}</summary>
          <p>{copy.providerDetail}</p>
        </details>
      )}
      {!providerGap && (stamp !== undefined || finding.evidence_text) && (
        <div className="shortform-evidence">
          <p className="mono-label">{t("shortform.evidence")}</p>
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
  const { t, locale } = useTranslation();
  if (!isSuggestionEligible(finding)) return null;
  const phase = state?.phase ?? "idle";
  const generating = phase === "generating";
  const actionLabel = kind === "opening" ? t("shortform.suggestOpening") : t("shortform.suggestCta");
  const recommendedLabel = kind === "opening" ? t("shortform.recommendedOpening") : t("shortform.recommendedCta");
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
          {generating ? t("shortform.suggesting") : phase === "error" ? t("shortform.retryShort") : actionLabel}
        </button>
      )}
      {phase === "error" && state?.error && (
        <p className="shortform-suggestion__error" role="alert">
          {localizeRequestError(locale, state.error.code, "suggestion")}
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
  const { t } = useTranslation();
  return (
    <div className="shortform-suggestion__result">
      <p className="mono-label">{recommendedLabel}</p>
      {suggestion.suggested_text && (
        <blockquote cite="suggestion">{suggestion.suggested_text}</blockquote>
      )}
      <p className="mono-label">{t("shortform.placement")}</p>
      <p className="shortform-range">{formatSuggestionPlacement(suggestion, t)}</p>
      <div className="shortform-suggestion__actions">
        <button className="text-button" type="button" disabled={regenerating} onClick={onRegenerate}>
          {regenerating ? t("shortform.suggesting") : t("shortform.regenerate")}
        </button>
        {onDismiss && (
          <button className="text-button" type="button" disabled={regenerating} onClick={onDismiss}>
            {t("shortform.dismissSuggestion")}
          </button>
        )}
      </div>
    </div>
  );
}

function formatSuggestionPlacement(
  suggestion: ShortFormSuggestion,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  const { placement } = suggestion;
  if (placement.strategy === "replace_opening" && placement.start_seconds != null && placement.end_seconds != null) {
    return t("shortform.placeReplaceOpening", {
      start: formatTimestampPrecise(placement.start_seconds),
      end: formatTimestampPrecise(placement.end_seconds),
    });
  }
  if (placement.strategy === "opening_first_seconds") {
    return t("shortform.placeOpeningFirst");
  }
  if (placement.after_seconds != null) {
    return t("shortform.placeNearEndingAfter", { time: formatTimestampPrecise(placement.after_seconds) });
  }
  return t("shortform.placeNearEnding");
}

function PacingBlock({
  finding,
  context,
}: {
  finding?: PreflightFinding;
  context: FindingCopyContext;
}) {
  const { t } = useTranslation();
  if (!finding) return null;
  const copy = localizeFindingCopy(finding, context, t);
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{t("shortform.pacing")}</p>
        <Status status={finding.status} />
      </header>
      {finding.ranges.map((range) => (
        <p key={`${range.start_seconds}-${range.end_seconds}`} className="shortform-range">
          {formatTimestampPrecise(range.start_seconds)}–{formatTimestampPrecise(range.end_seconds)}
          <span>{t("shortform.lowEnergy", { value: range.duration_seconds.toFixed(2) })}</span>
        </p>
      ))}
      <p>{copy.lead}</p>
      {copy.recommendation && <p>{copy.recommendation}</p>}
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
  const { t } = useTranslation();
  const duration = report.media.duration_seconds;
  if (duration <= 0) return null;
  const marks = collectTimelineMarks(report, t);
  if (marks.length === 0) return null;
  const laidOut = layoutMarks(marks, duration);
  const stacked = laidOut.some((mark) => mark.offset > 0);
  const pacingLegend = marks.filter((mark) => mark.kind === "pacing" && marks.filter((item) => item.kind === "pacing").length > 1);
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{t("shortform.timeline")}</p>
      </header>
      <div className="shortform-timeline" aria-label={t("shortform.timelineAria")}>
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

function collectTimelineMarks(
  report: ShortFormReport,
  t: (key: MessageKey) => string,
): TimelineMark[] {
  const marks: TimelineMark[] = [];
  const opening = findingById(report, "opening");
  const pacing = findingById(report, "dead_air");
  const cta = findingById(report, "cta");
  const openingAt = opening?.ranges[0]?.start_seconds;
  if (openingAt !== undefined && opening?.status !== "not_evaluated") {
    marks.push({
      key: "hook",
      label: t("shortform.markHook"),
      seconds: openingAt,
      kind: "hook",
    });
  }
  const pacingRanges = pacing?.ranges ?? [];
  pacingRanges.forEach((range, index) => {
    marks.push({
      key: `pacing-${range.start_seconds}-${range.end_seconds}`,
      label: pacingRanges.length > 1 ? `P${index + 1}` : t("shortform.markPacing"),
      seconds: range.start_seconds,
      endSeconds: range.end_seconds,
      kind: "pacing",
    });
  });
  const ctaAt = cta?.ranges[0]?.start_seconds;
  if (ctaAt !== undefined && cta?.status === "pass") {
    marks.push({
      key: "cta",
      label: t("shortform.markCta"),
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
  const { t } = useTranslation();
  if (priorities.length === 0) return null;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{t("shortform.priorities")}</p>
      </header>
      <ol className="shortform-priorities">
        {priorities.map((item) => (
          <li key={`${item.rank}-${item.check_id}`}>
            <span className="mono-label">{String(item.rank).padStart(2, "0")}</span>
            {localizePriority(item, t)}
          </li>
        ))}
      </ol>
    </article>
  );
}
