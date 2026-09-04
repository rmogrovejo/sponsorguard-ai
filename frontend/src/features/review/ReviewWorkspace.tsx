import { useEffect, useRef, useState, type FormEvent } from "react";

import { localizeRequestError } from "../../i18n/requestError";
import { useTranslation } from "../../i18n/useTranslation";
import type { MessageKey } from "../../i18n/translations";
import type { RequirementDraft } from "../../types/compliance";
import type { SponsoredContentDraft } from "../persistence/draftSchema";
import { BriefSection } from "../briefs/BriefSection";
import { useBriefExtraction } from "../briefs/useBriefExtraction";
import { ComplianceReport } from "../compliance/ComplianceReport";
import {
  createExtractedRequirementDraft,
  createRequirementDraft,
} from "../requirements/requirementModel";
import { RequirementsSection } from "../requirements/RequirementsSection";
import { SectionHeader } from "../shell/SectionHeader";
import { TranscriptSection } from "../transcript/TranscriptSection";
import { useComplianceAnalysis } from "./useComplianceAnalysis";

const PHASE_KEYS = {
  idle: "sponsored.phaseIdle",
  validating: "sponsored.phaseValidating",
  analyzing: "sponsored.phaseAnalyzing",
  success: "sponsored.phaseSuccess",
  error: "sponsored.phaseError",
} as const satisfies Record<string, MessageKey>;

interface ReviewWorkspaceProps {
  initialCampaignName?: string;
  initialSponsorBrief?: string;
  initialRequirements?: RequirementDraft[];
  initialTranscriptContent?: string;
  initialTranscriptFileName?: string | null;
  onDraftChange?: (draft: SponsoredContentDraft) => void;
}

export function ReviewWorkspace({
  initialCampaignName = "",
  initialSponsorBrief = "",
  initialRequirements,
  initialTranscriptContent = "",
  initialTranscriptFileName = null,
  onDraftChange,
}: ReviewWorkspaceProps = {}) {
  const { t, locale } = useTranslation();
  const [campaignName, setCampaignName] = useState(initialCampaignName);
  const [sponsorBrief, setSponsorBrief] = useState(initialSponsorBrief);
  const [requirements, setRequirements] = useState<RequirementDraft[]>(() =>
    initialRequirements && initialRequirements.length > 0
      ? initialRequirements
      : [createRequirementDraft()],
  );
  const [transcriptContent, setTranscriptContent] = useState(initialTranscriptContent);
  const [fileName, setFileName] = useState<string | null>(initialTranscriptFileName);
  const reportHeadingRef = useRef<HTMLHeadingElement>(null);
  const {
    phase,
    validationErrors,
    requestError,
    report,
    analyze,
    markDirty,
  } = useComplianceAnalysis();
  const briefExtraction = useBriefExtraction();
  const requestActive = phase === "validating" || phase === "analyzing";
  const skipDraftPublish = useRef(true);

  useEffect(() => {
    if (!onDraftChange) return;
    if (skipDraftPublish.current) {
      skipDraftPublish.current = false;
      return;
    }
    onDraftChange({
      campaignName,
      sponsorBrief,
      requirements,
      transcriptContent,
      transcriptFileName: fileName,
    });
  }, [campaignName, sponsorBrief, requirements, transcriptContent, fileName, onDraftChange]);

  useEffect(() => {
    if (phase === "success") {
      reportHeadingRef.current?.focus();
    }
  }, [phase]);

  const submitReview = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    void analyze({ campaignName, requirements, transcriptContent });
  };

  const updateCampaignName = (value: string) => {
    setCampaignName(value);
    markDirty();
  };

  const updateSponsorBrief = (value: string) => {
    setSponsorBrief(value);
    briefExtraction.reset();
  };

  const appendExtractedRequirements = () => {
    const extractedDrafts = briefExtraction.requirements.map(
      createExtractedRequirementDraft,
    );
    setRequirements((current) => [...current, ...extractedDrafts]);
    briefExtraction.reset();
    markDirty();
  };

  const addRequirement = () => {
    setRequirements((current) => [...current, createRequirementDraft()]);
    markDirty();
  };

  const updateRequirement = (updated: RequirementDraft) => {
    setRequirements((current) =>
      current.map((requirement) =>
        requirement.id === updated.id ? updated : requirement,
      ),
    );
    markDirty();
  };

  const removeRequirement = (id: string) => {
    setRequirements((current) =>
      current.filter((requirement) => requirement.id !== id),
    );
    markDirty();
  };

  const updateTranscript = (content: string) => {
    setTranscriptContent(content);
    markDirty();
  };

  const loadFile = (nextFileName: string, content: string) => {
    setFileName(nextFileName);
    setTranscriptContent(content);
    markDirty();
  };

  const removeFile = () => {
    setFileName(null);
    setTranscriptContent("");
    markDirty();
  };

  return (
    <>
      <form
        className="review-workspace"
        noValidate
        onSubmit={submitReview}
        aria-busy={requestActive}
      >
        <div className="workspace-docket">
          <div>
            <p className="mono-label">{t("sponsored.workspaceKicker")}</p>
            <h2>{t("sponsored.workspaceTitle")}</h2>
          </div>
          <p className="request-state" aria-live="polite">
            {t("sponsored.status", { phase: t(PHASE_KEYS[phase]) })}
          </p>
        </div>

        <section className="review-section" aria-labelledby="campaign-heading">
          <SectionHeader
            step={t("sponsored.campaignStep")}
            title={t("sponsored.campaignTitle")}
            titleId="campaign-heading"
            description={t("sponsored.campaignBody")}
          />
          <div className="form-field campaign-field">
            <label htmlFor="campaign-name">{t("sponsored.campaignLabel")}</label>
            <input
              id="campaign-name"
              type="text"
              value={campaignName}
              disabled={requestActive}
              maxLength={160}
              placeholder={t("sponsored.campaignPlaceholder")}
              onChange={(event) => updateCampaignName(event.target.value)}
              aria-invalid={Boolean(validationErrors.campaignName)}
              aria-describedby={
                validationErrors.campaignName ? "campaign-name-error" : undefined
              }
            />
            {validationErrors.campaignName && (
              <p className="field-error" id="campaign-name-error">
                {t(validationErrors.campaignName)}
              </p>
            )}
          </div>
        </section>

        <BriefSection
          brief={sponsorBrief}
          disabled={requestActive}
          phase={briefExtraction.phase}
          error={briefExtraction.error}
          requirements={briefExtraction.requirements}
          onBriefChange={updateSponsorBrief}
          onExtract={() => void briefExtraction.extract(sponsorBrief)}
          onRetry={() => void briefExtraction.extract(sponsorBrief)}
          onAppend={appendExtractedRequirements}
          onDiscard={briefExtraction.reset}
          onRemoveCandidate={briefExtraction.removeCandidate}
        />

        <RequirementsSection
          requirements={requirements}
          disabled={requestActive}
          errors={validationErrors}
          onAdd={addRequirement}
          onChange={updateRequirement}
          onRemove={removeRequirement}
        />

        <TranscriptSection
          content={transcriptContent}
          fileName={fileName}
          disabled={requestActive}
          error={validationErrors.transcript}
          formatIssue={requestError?.code === "INVALID_TRANSCRIPT"}
          onContentChange={updateTranscript}
          onFileLoaded={loadFile}
          onFileRemoved={removeFile}
        />

        {requestError && (
          <div className="request-error" role="alert">
            <div>
              <p className="mono-label">{t("sponsored.notCompleted")}</p>
              <h3>{localizeRequestError(locale, requestError.code, "compliance")}</h3>
              <p>{t("sponsored.kept")}</p>
            </div>
            {requestError.retryable && (
              <button
                className="secondary-button"
                type="button"
                disabled={requestActive}
                onClick={() => submitReview()}
              >
                {t("sponsored.retry")}
              </button>
            )}
          </div>
        )}

        <footer className="analysis-bar">
          <div>
            <p className="mono-label">{t("sponsored.analyzeStep")}</p>
            <p>
              {t(
                requirements.length === 1 ? "sponsored.analyzeCount" : "sponsored.analyzeCountPlural",
                { count: requirements.length },
              )}
            </p>
          </div>
          <button
            className="primary-button"
            type="submit"
            disabled={requestActive}
          >
            {phase === "validating"
              ? t("sponsored.checking")
              : phase === "analyzing"
                ? t("sponsored.analyzing")
                : t("sponsored.analyze")}
          </button>
        </footer>
      </form>

      {report && (
        <ComplianceReport report={report} headingRef={reportHeadingRef} />
      )}
    </>
  );
}
