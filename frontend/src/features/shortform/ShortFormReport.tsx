import type { PreflightFinding, ShortFormReport } from "../../types/shortform";
import { PLATFORM_OPTIONS } from "../../types/shortform";
import { formatTimestamp, formatTimestampPrecise } from "../../utils/timestamp";

interface ShortFormReportViewProps {
  report: ShortFormReport;
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

export function ShortFormReportView({ report }: ShortFormReportViewProps) {
  const platformLabel =
    PLATFORM_OPTIONS.find((item) => item.value === report.platform)?.label ?? report.platform;
  const format = findingById(report, "orientation");
  const resolution = findingById(report, "resolution");
  const duration = findingById(report, "duration");
  const audio = findingById(report, "audio_track");
  const pacing = findingById(report, "dead_air");
  const score = report.summary.readiness_score;

  return (
    <section className="compliance-report shortform-report" aria-labelledby="shortform-report-heading">
      <header className="report-header">
        <div className="report-header__copy">
          <p className="mono-label">SHORT-FORM PREFLIGHT / {platformLabel.toUpperCase()}</p>
          <h2 id="shortform-report-heading">{platformLabel}</h2>
          <p>Deterministic media findings from the uploaded clip and selected platform preset.</p>
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
        <CheckBlock title="Format" finding={format} extra={resolution} />
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
        <PacingBlock finding={pacing} durationSeconds={report.media.duration_seconds} />
      </div>
    </section>
  );
}

function CheckBlock({
  title,
  finding,
  extra,
  detail,
}: {
  title: string;
  finding?: PreflightFinding;
  extra?: PreflightFinding;
  detail?: string | null;
}) {
  if (!finding) return null;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">{title.toUpperCase()}</p>
        <span className={`status-label status-label--${finding.status}`}>
          {STATUS_LABELS[finding.status]}
        </span>
      </header>
      <h3>{finding.title}</h3>
      <p>{finding.reason}</p>
      {detail && <p className="mono-label">{detail}</p>}
      {extra && <p>{extra.reason}</p>}
      {finding.recommendation && <p>{finding.recommendation}</p>}
    </article>
  );
}

function PacingBlock({
  finding,
  durationSeconds,
}: {
  finding?: PreflightFinding;
  durationSeconds: number;
}) {
  if (!finding) return null;
  return (
    <article className="shortform-check">
      <header>
        <p className="mono-label">PACING</p>
        <span className={`status-label status-label--${finding.status}`}>
          {STATUS_LABELS[finding.status]}
        </span>
      </header>
      <h3>{finding.title}</h3>
      {finding.ranges.map((range) => (
        <p key={`${range.start_seconds}-${range.end_seconds}`} className="shortform-range">
          {formatTimestampPrecise(range.start_seconds)} → {formatTimestampPrecise(range.end_seconds)}
          <span>{range.duration_seconds.toFixed(2)} sec low-energy interval</span>
        </p>
      ))}
      <p>{finding.reason}</p>
      {finding.recommendation && <p>{finding.recommendation}</p>}
      {finding.ranges.length > 0 && durationSeconds > 0 && (
        <PacingTimeline ranges={finding.ranges} durationSeconds={durationSeconds} />
      )}
    </article>
  );
}

function PacingTimeline({
  ranges,
  durationSeconds,
}: {
  ranges: ShortFormReport["findings"][number]["ranges"];
  durationSeconds: number;
}) {
  return (
    <div className="pacing-timeline" aria-label="Pacing timeline">
      <div className="pacing-timeline__track">
        {ranges.map((range) => (
          <span
            key={`${range.start_seconds}-${range.end_seconds}`}
            className="pacing-timeline__mark"
            style={{ left: `${Math.min(96, (range.start_seconds / durationSeconds) * 100)}%` }}
          >
            ▲
            <em>PACING</em>
          </span>
        ))}
      </div>
      <div className="pacing-timeline__scale">
        <span>{formatTimestamp(0)}</span>
        <span>{formatTimestamp(durationSeconds / 2)}</span>
        <span>{formatTimestamp(durationSeconds)}</span>
      </div>
    </div>
  );
}
