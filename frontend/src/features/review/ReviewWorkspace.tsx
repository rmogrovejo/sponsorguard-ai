import { useEffect, useRef, useState, type FormEvent } from "react";

import type { RequirementDraft } from "../../types/compliance";
import { ComplianceReport } from "../compliance/ComplianceReport";
import { createRequirementDraft } from "../requirements/requirementModel";
import { RequirementsSection } from "../requirements/RequirementsSection";
import { TranscriptSection } from "../transcript/TranscriptSection";
import { useComplianceAnalysis } from "./useComplianceAnalysis";

const PHASE_LABELS = {
  idle: "Ready for input",
  validating: "Validating review",
  analyzing: "Analysis in progress",
  success: "Report complete",
  error: "Action required",
} as const;

export function ReviewWorkspace() {
  const [campaignName, setCampaignName] = useState("");
  const [requirements, setRequirements] = useState<RequirementDraft[]>(() => [
    createRequirementDraft(),
  ]);
  const [transcriptContent, setTranscriptContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const reportHeadingRef = useRef<HTMLHeadingElement>(null);
  const {
    phase,
    validationErrors,
    requestError,
    report,
    analyze,
    markDirty,
  } = useComplianceAnalysis();
  const requestActive = phase === "validating" || phase === "analyzing";

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
            <p className="mono-label">REVIEW WORKSPACE</p>
            <h2>Create pre-publish review</h2>
          </div>
          <div className="request-state" aria-live="polite">
            <span className={`request-state__mark request-state__mark--${phase}`} />
            <span>{PHASE_LABELS[phase]}</span>
          </div>
        </div>

        <section className="review-section" aria-labelledby="campaign-heading">
          <header className="review-section__header review-section__header--compact">
            <div className="section-number mono-label">01 / REVIEW</div>
            <div>
              <h2 id="campaign-heading">Campaign identity</h2>
              <p>Name this review so its findings remain easy to identify.</p>
            </div>
          </header>
          <div className="form-field campaign-field">
            <label htmlFor="campaign-name">Campaign or review name</label>
            <input
              id="campaign-name"
              type="text"
              value={campaignName}
              disabled={requestActive}
              maxLength={160}
              placeholder="AcmeVPN September Campaign"
              onChange={(event) => updateCampaignName(event.target.value)}
              aria-invalid={Boolean(validationErrors.campaignName)}
              aria-describedby={
                validationErrors.campaignName ? "campaign-name-error" : undefined
              }
            />
            {validationErrors.campaignName && (
              <p className="field-error" id="campaign-name-error">
                {validationErrors.campaignName}
              </p>
            )}
          </div>
        </section>

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
          onContentChange={updateTranscript}
          onFileLoaded={loadFile}
          onFileRemoved={removeFile}
        />

        {requestError && (
          <div className="request-error" role="alert">
            <div>
              <p className="mono-label">REVIEW NOT COMPLETED</p>
              <h3>{requestError.message}</h3>
              <p>
                Your campaign, requirements, and transcript have been kept in
                place.
              </p>
            </div>
            {requestError.retryable && (
              <button
                className="secondary-button"
                type="button"
                disabled={requestActive}
                onClick={() => submitReview()}
              >
                Retry analysis
              </button>
            )}
          </div>
        )}

        <footer className="analysis-bar">
          <div>
            <p className="mono-label">04 / ANALYZE</p>
            <p>
              SponsorGuard will evaluate {requirements.length} configured
              {requirements.length === 1 ? " requirement" : " requirements"}.
            </p>
          </div>
          <button
            className="primary-button"
            type="submit"
            disabled={requestActive}
          >
            {phase === "validating"
              ? "Checking inputs…"
              : phase === "analyzing"
                ? "Analyzing review…"
                : "Analyze review"}
          </button>
        </footer>
      </form>

      {report && (
        <ComplianceReport report={report} headingRef={reportHeadingRef} />
      )}
    </>
  );
}
