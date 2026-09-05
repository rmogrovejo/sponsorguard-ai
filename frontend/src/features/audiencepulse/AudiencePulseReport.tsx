import type {
  AudiencePulseReport,
  AudienceSignalCategory,
  ManualAudienceSource,
} from "../../types/audiencePulse";
import { localizeRequestError } from "../../i18n/requestError";
import type { MessageKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";

const SIGNAL_LABEL: Record<AudienceSignalCategory, MessageKey> = {
  positive: "audiencePulse.signalPositive",
  question: "audiencePulse.signalQuestion",
  content_request: "audiencePulse.signalContentRequest",
  funny: "audiencePulse.signalFunny",
  constructive_criticism: "audiencePulse.signalConstructive",
  negative: "audiencePulse.signalNegative",
  confusion: "audiencePulse.signalConfusion",
  low_information: "audiencePulse.signalLowInformation",
};

const REPLY_LABEL = {
  question: "audiencePulse.replyQuestion",
  request: "audiencePulse.replyRequest",
  criticism: "audiencePulse.replyCriticism",
} as const satisfies Record<string, MessageKey>;

const PLATFORM_KEYS = {
  tiktok: "audiencePulse.platformTiktok",
  instagram: "audiencePulse.platformInstagram",
  stream: "audiencePulse.platformStream",
  other: "audiencePulse.platformOther",
} as const satisfies Record<ManualAudienceSource, MessageKey>;

interface AudiencePulseReportViewProps {
  report: AudiencePulseReport;
  manualSource?: ManualAudienceSource;
  onRetryAnalysis?: () => void;
  retrying?: boolean;
}

function reportSourceLabel(
  report: AudiencePulseReport,
  manualSource: ManualAudienceSource,
  t: (key: MessageKey) => string,
): string {
  if (report.source === "youtube" || report.video) {
    return t("audiencePulse.sourceYoutube");
  }
  return t(PLATFORM_KEYS[manualSource]);
}

export function AudiencePulseReportView({
  report,
  manualSource = "other",
  onRetryAnalysis,
  retrying = false,
}: AudiencePulseReportViewProps) {
  const { t, locale } = useTranslation();
  const unavailable = report.analysis_status === "not_evaluated";
  const sourceLabel = reportSourceLabel(report, manualSource, t);

  return (
    <section
      className="review-section audience-pulse-report"
      aria-labelledby="audience-report-title"
    >
      <div className="workspace-docket">
        <p className="mono-label">{t("audiencePulse.reportLabel")}</p>
        <h2 id="audience-report-title">{t("audiencePulse.reportTitle")}</h2>
        <p className="request-state">
          {t("audiencePulse.reportByline", {
            source: sourceLabel,
            count: String(report.comments_loaded),
          })}
        </p>
        {report.video && (
          <div className="audience-pulse-snapshot">
            <p className="mono-label">{t("audiencePulse.snapshotLabel")}</p>
            <p className="audience-pulse-snapshot__names">
              {report.video.title} · {report.video.channel_title}
            </p>
          </div>
        )}
      </div>

      <div className="audience-pulse-block">
        <p className="mono-label">{t("audiencePulse.sampleLabel")}</p>
        <ul className="audience-pulse-comments">
          {report.comments.map((comment) => (
            <li key={comment.id}>
              <strong className="mono-label">{comment.id}</strong>
              <p className="audience-pulse-comments__text">“{comment.text}”</p>
            </li>
          ))}
        </ul>
      </div>

      {unavailable ? (
        <div className="audience-pulse-block" role="status">
          <p className="mono-label">{t("audiencePulse.analysisLabel")}</p>
          <h3>{t("audiencePulse.notEvaluated")}</h3>
          <p>
            {report.analysis_error_code
              ? localizeRequestError(locale, report.analysis_error_code, "audience")
              : t("audiencePulse.notEvaluatedBody")}
          </p>
          {onRetryAnalysis && (
            <button
              className="secondary-button"
              type="button"
              onClick={onRetryAnalysis}
              disabled={retrying}
            >
              {retrying ? t("audiencePulse.analyzing") : t("audiencePulse.retryAnalysis")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="audience-pulse-block">
            <p className="mono-label">{t("audiencePulse.signalsLabel")}</p>
            <p className="audience-pulse-block__lede">
              {t("audiencePulse.classifiedSummary", {
                classified: String(report.comments_classified),
                actionable: String(report.comments_actionable),
                loaded: String(report.comments_loaded),
              })}
            </p>
            <ul className="audience-pulse-signals">
              {report.signals.map((signal) => (
                <li key={signal.category}>
                  <strong>{t(SIGNAL_LABEL[signal.category])}</strong>
                  <span>
                    {signal.percentage === null
                      ? t("audiencePulse.signalCountOnly", {
                          count: String(signal.count),
                        })
                      : `${signal.percentage}% · ${signal.count}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="audience-pulse-block">
            <p className="mono-label">{t("audiencePulse.themesLabel")}</p>
            {report.themes.length === 0 ? (
              <p className="audience-pulse-block__lede">{t("audiencePulse.themesEmpty")}</p>
            ) : (
              <ol className="audience-pulse-entries">
                {report.themes.map((theme) => (
                  <li key={theme.rank} className="audience-pulse-entry">
                    <span className="audience-pulse-entry__index mono-label">
                      {String(theme.rank).padStart(2, "0")}
                    </span>
                    <div className="audience-pulse-entry__body">
                      <h3>{theme.summary}</h3>
                      <p className="audience-pulse-entry__meta">
                        {t("audiencePulse.themeCount", {
                          count: String(theme.comment_count),
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="audience-pulse-block">
            <p className="mono-label">{t("audiencePulse.replyLabel")}</p>
            {report.reply_worthy.length === 0 ? (
              <p className="audience-pulse-block__lede">{t("audiencePulse.replyEmpty")}</p>
            ) : (
              <ul className="audience-pulse-comments">
                {report.reply_worthy.map((item) => (
                  <li key={`${item.kind}-${item.comment_id}`}>
                    <strong className="mono-label">{t(REPLY_LABEL[item.kind])}</strong>
                    <p className="audience-pulse-comments__text">“{item.text}”</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="audience-pulse-block">
            <p className="mono-label">{t("audiencePulse.opportunitiesLabel")}</p>
            {report.opportunities.length === 0 ? (
              <p className="audience-pulse-block__lede">
                {t("audiencePulse.opportunitiesEmpty")}
              </p>
            ) : (
              <ol className="audience-pulse-entries">
                {report.opportunities.map((item) => (
                  <li key={item.rank} className="audience-pulse-entry">
                    <span className="audience-pulse-entry__index mono-label">
                      {String(item.rank).padStart(2, "0")}
                    </span>
                    <div className="audience-pulse-entry__body">
                      <h3>{item.title}</h3>
                      <p className="audience-pulse-entry__meta">
                        {t("audiencePulse.opportunityGrounded", {
                          count: String(item.grounded_in_count),
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
