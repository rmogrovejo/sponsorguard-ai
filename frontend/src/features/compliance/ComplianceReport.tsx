import type { RefObject } from "react";

import type { ComplianceStatus } from "../../types/compliance";
import { formatTimestamp } from "../../utils/timestamp";
import type { ReviewReportSnapshot } from "../review/useComplianceAnalysis";

interface ComplianceReportProps {
  report: ReviewReportSnapshot;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  pass: "Pass",
  warning: "Warning",
  fail: "Fail",
};

function formatScore(score: number): string {
  return Number.isInteger(score) ? score.toFixed(0) : score.toFixed(1);
}

export function ComplianceReport({
  report,
  headingRef,
}: ComplianceReportProps) {
  const { summary, results } = report.response;

  return (
    <section className="compliance-report" aria-labelledby="report-heading">
      <header className="report-header">
        <div className="report-header__copy">
          <p className="mono-label">COMPLIANCE REPORT / FINAL</p>
          <h2 id="report-heading" ref={headingRef} tabIndex={-1}>
            {report.campaignName}
          </h2>
          <p>
            Deterministic pre-publish findings from the submitted requirements
            and transcript.
          </p>
        </div>

        <div
          className="score-block"
          aria-label={`Compliance score ${formatScore(summary.compliance_score)} out of 100`}
        >
          <span className="mono-label">COMPLIANCE SCORE</span>
          <strong>{formatScore(summary.compliance_score)}</strong>
          <span>/ 100</span>
        </div>
      </header>

      <dl className="summary-strip" aria-label="Compliance totals">
        <div>
          <dt>Total checks</dt>
          <dd>{summary.total}</dd>
        </div>
        <div className="summary-strip__pass">
          <dt>Passed</dt>
          <dd>{summary.passed}</dd>
        </div>
        <div className="summary-strip__warning">
          <dt>Warnings</dt>
          <dd>{summary.warnings}</dd>
        </div>
        <div className="summary-strip__fail">
          <dt>Failed</dt>
          <dd>{summary.failed}</dd>
        </div>
      </dl>

      <div className="findings-heading">
        <p className="mono-label">FINDINGS REGISTER</p>
        <span>{results.length} evaluated requirements</span>
      </div>

      <ol className="finding-list">
        {results.map((result, index) => {
          const statusLabel = STATUS_LABELS[result.status];
          const timestamp =
            result.timestamp_seconds === null
              ? null
              : formatTimestamp(result.timestamp_seconds);

          return (
            <li key={result.requirement_id} className="finding">
              <header className="finding__header">
                <span className="finding__number mono-label">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="finding__title">
                  <p className="mono-label">REQUIREMENT</p>
                  <h3>
                    {report.requirementDescriptions[result.requirement_id] ??
                      "Sponsorship requirement"}
                  </h3>
                </div>
                <span
                  className={`status-label status-label--${result.status}`}
                  aria-label={`Compliance status: ${statusLabel}`}
                >
                  {statusLabel}
                </span>
              </header>

              <div className="finding__body">
                <p className="finding__reason">{result.reason}</p>

                {result.evidence !== null && timestamp !== null && (
                  <figure className="evidence-block">
                    <figcaption>
                      <span className="mono-label">EVIDENCE</span>
                      <span className="evidence-block__timestamp">{timestamp}</span>
                    </figcaption>
                    <blockquote>“{result.evidence}”</blockquote>
                    {result.source_segment_index !== null && (
                      <p className="mono-label">
                        SOURCE CUE / {result.source_segment_index}
                      </p>
                    )}
                  </figure>
                )}

                <details className="technical-detail">
                  <summary>Technical detail</summary>
                  <dl>
                    <div>
                      <dt>Reason code</dt>
                      <dd>{result.reason_code}</dd>
                    </div>
                    <div>
                      <dt>Requirement ID</dt>
                      <dd>{result.requirement_id}</dd>
                    </div>
                  </dl>
                </details>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
