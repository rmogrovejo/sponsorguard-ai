import type { RefObject } from "react";

import type { ComplianceStatus } from "../../types/compliance";
import type { MessageKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import { formatTimestamp } from "../../utils/timestamp";
import { FixRecommendation } from "../fixes/FixRecommendation";
import { useFixGeneration } from "../fixes/useFixGeneration";
import type { ReviewReportSnapshot } from "../review/useComplianceAnalysis";
import { isSemanticRequirementType } from "../requirements/requirementModel";
import { localizeComplianceReason } from "./localizeReason";

interface ComplianceReportProps {
  report: ReviewReportSnapshot;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

const STATUS_KEYS: Record<ComplianceStatus, MessageKey> = {
  pass: "sponsored.pass",
  warning: "sponsored.warning",
  fail: "sponsored.fail",
  not_evaluated: "sponsored.statusNotEvaluated",
};

function formatScore(score: number): string {
  return Number.isInteger(score) ? score.toFixed(0) : score.toFixed(1);
}

export function ComplianceReport({
  report,
  headingRef,
}: ComplianceReportProps) {
  const { t } = useTranslation();
  const { summary, results } = report.response;
  const fixes = useFixGeneration(report);

  return (
    <section className="compliance-report" aria-labelledby="report-heading">
      <header className="report-header">
        <div className="report-header__copy">
          <p className="mono-label">{t("sponsored.reportKicker")}</p>
          <h2 id="report-heading" ref={headingRef} tabIndex={-1}>
            {report.campaignName}
          </h2>
          <p>{t("sponsored.reportBody")}</p>
        </div>

        <div className="report-metrics">
          <div
            className="score-block"
            aria-label={
              summary.compliance_score === null
                ? t("sponsored.scoreUnavailable")
                : t("sponsored.scoreAria", { score: formatScore(summary.compliance_score) })
            }
          >
            <span className="mono-label">{t("sponsored.score")}</span>
            <strong>
              {summary.compliance_score === null
                ? "—"
                : formatScore(summary.compliance_score)}
            </strong>
            <span>
              {summary.compliance_score === null ? t("shortform.notScored") : "/ 100"}
            </span>
          </div>
          <div
            className="coverage-block"
            aria-label={t("sponsored.coverageAria", {
              coverage: formatScore(summary.verification_coverage),
              evaluated: summary.evaluated,
              total: summary.total,
            })}
          >
            <span className="mono-label">{t("sponsored.coverage")}</span>
            <strong>
              {summary.evaluated} / {summary.total}
            </strong>
            <span>{t("sponsored.evaluated")}</span>
          </div>
        </div>
      </header>

      <dl className="summary-strip" aria-label={t("sponsored.totals")}>
        <div>
          <dt>{t("sponsored.totalChecks")}</dt>
          <dd>{summary.total}</dd>
        </div>
        <div className="summary-strip__pass">
          <dt>{t("sponsored.passed")}</dt>
          <dd>{summary.passed}</dd>
        </div>
        <div className="summary-strip__warning">
          <dt>{t("sponsored.warnings")}</dt>
          <dd>{summary.warnings}</dd>
        </div>
        <div className="summary-strip__fail">
          <dt>{t("sponsored.failed")}</dt>
          <dd>{summary.failed}</dd>
        </div>
        <div className="summary-strip__not-evaluated">
          <dt>{t("sponsored.notEvaluated")}</dt>
          <dd>{summary.not_evaluated}</dd>
        </div>
      </dl>

      <div className="findings-heading">
        <p className="mono-label">{t("sponsored.findings")}</p>
        <span>{t("sponsored.evaluatedReqs", { count: results.length })}</span>
      </div>

      <ol className="finding-list">
        {results.map((result, index) => {
          const statusLabel = t(STATUS_KEYS[result.status]);
          const timestamp =
            result.timestamp_seconds === null
              ? null
              : formatTimestamp(result.timestamp_seconds);
          const requirementType = report.requirementTypes[result.requirement_id];
          const isSemantic =
            requirementType !== undefined &&
            isSemanticRequirementType(requirementType);
          const reasonCopy = localizeComplianceReason(
            result,
            report.requirementsById[result.requirement_id],
            t,
          );

          return (
            <li key={result.requirement_id} className="finding">
              <header className="finding__header">
                <span className="finding__number mono-label">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="finding__title">
                  <p className="mono-label">{t("sponsored.requirement")}</p>
                  <h3>
                    {report.requirementDescriptions[result.requirement_id] ??
                      t("sponsored.fallbackRequirement")}
                  </h3>
                </div>
                <span
                  className={`status-label status-label--${result.status}`}
                  aria-label={t("sponsored.statusAria", { status: statusLabel })}
                >
                  {statusLabel}
                </span>
              </header>

              <div className="finding__body">
                {isSemantic && (
                  <p className="finding__verification mono-label">
                    {t("sponsored.verificationSemantic")}
                  </p>
                )}
                <p className="finding__reason">{reasonCopy.lead}</p>

                {result.evidence !== null && timestamp !== null && (
                  <figure className="evidence-block">
                    <figcaption>
                      <span className="mono-label">{t("sponsored.evidence")}</span>
                      <span className="evidence-block__timestamp">{timestamp}</span>
                    </figcaption>
                    <blockquote>“{result.evidence}”</blockquote>
                    {result.source_segment_index !== null && (
                      <p className="mono-label">
                        {t("sponsored.sourceCue", { index: result.source_segment_index })}
                      </p>
                    )}
                  </figure>
                )}

                <FixRecommendation
                  finding={result}
                  state={fixes.stateFor(result.requirement_id)}
                  onGenerate={() => void fixes.generate(result)}
                  onDismiss={() => fixes.dismiss(result.requirement_id)}
                />

                <details className="technical-detail">
                  <summary>{t("sponsored.technicalDetail")}</summary>
                  <dl>
                    <div>
                      <dt>{t("sponsored.reasonCode")}</dt>
                      <dd>{result.reason_code}</dd>
                    </div>
                    <div>
                      <dt>{t("sponsored.requirementId")}</dt>
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
