import type { BriefExtractionPhase, ExtractedRequirement } from "../../types/briefs";
import { getRequirementLabel } from "../requirements/requirementModel";
import { SectionHeader } from "../shell/SectionHeader";
import { MAX_BRIEF_CHARACTERS, type BriefExtractionError } from "./useBriefExtraction";

interface BriefSectionProps {
  brief: string;
  disabled: boolean;
  phase: BriefExtractionPhase;
  error: BriefExtractionError | null;
  requirements: ExtractedRequirement[];
  onBriefChange: (value: string) => void;
  onExtract: () => void;
  onRetry: () => void;
  onAppend: () => void;
  onDiscard: () => void;
  onRemoveCandidate: (id: string) => void;
}

export function BriefSection({
  brief,
  disabled,
  phase,
  error,
  requirements,
  onBriefChange,
  onExtract,
  onRetry,
  onAppend,
  onDiscard,
  onRemoveCandidate,
}: BriefSectionProps) {
  const extracting = phase === "extracting";
  const statusText =
    phase === "extracting"
      ? "Extracting campaign requirements…"
      : phase === "success"
        ? `${requirements.length} supported ${requirements.length === 1 ? "requirement" : "requirements"} ready for review.`
        : "";

  return (
    <section className="review-section brief-section" aria-labelledby="brief-heading">
      <SectionHeader
        step="02 / SPONSOR BRIEF"
        title="Sponsor brief"
        titleId="brief-heading"
        description="Extract explicit campaign instructions into a checklist, then review every rule before using it."
        action={
          <button
            className="secondary-button"
            type="button"
            disabled={disabled || extracting}
            onClick={onExtract}
          >
            {extracting ? "Reading sponsor brief…" : "Extract requirements"}
          </button>
        }
      />

      <div className="form-field brief-field">
        <label htmlFor="sponsor-brief">Campaign document</label>
        <textarea
          id="sponsor-brief"
          value={brief}
          disabled={disabled || extracting}
          maxLength={MAX_BRIEF_CHARACTERS}
          placeholder="Paste the sponsor's campaign instructions here…"
          onChange={(event) => onBriefChange(event.target.value)}
          aria-invalid={Boolean(error?.code === "CLIENT_VALIDATION_ERROR")}
          aria-describedby="sponsor-brief-note sponsor-brief-status"
        />
        <div className="brief-field__meta" id="sponsor-brief-note">
          <span>Optional when requirements are entered manually.</span>
          <span className="mono-label">
            {brief.length.toLocaleString()} / {MAX_BRIEF_CHARACTERS.toLocaleString()}
          </span>
        </div>
      </div>

      <div
        className="brief-status"
        id="sponsor-brief-status"
        role={error ? "alert" : "status"}
        aria-live="polite"
      >
        {statusText && <p>{statusText}</p>}
        {error && (
          <div className="brief-error">
            <div>
              <p className="mono-label">EXTRACTION NOT COMPLETED</p>
              <p>{error.message}</p>
              <p>Your brief and manual checklist have not been changed.</p>
            </div>
            {error.retryable && (
              <button
                className="secondary-button"
                type="button"
                disabled={disabled || extracting}
                onClick={onRetry}
              >
                Retry extraction
              </button>
            )}
          </div>
        )}
      </div>

      {phase === "success" && (
        <div className="extraction-review" aria-labelledby="extraction-review-heading">
          <header className="extraction-review__header">
            <div>
              <p className="mono-label">HUMAN REVIEW REQUIRED</p>
              <h3 id="extraction-review-heading">Extracted checklist</h3>
              <p>
                These rules are staged only. Appending them will not replace your
                current checklist.
              </p>
            </div>
            <div className="extraction-review__actions">
              <button
                className="text-button"
                type="button"
                disabled={disabled}
                onClick={onDiscard}
              >
                Discard extraction
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={disabled || requirements.length === 0}
                onClick={onAppend}
              >
                Append {requirements.length} to checklist
              </button>
            </div>
          </header>

          {requirements.length === 0 ? (
            <p className="extraction-review__empty">
              No explicit supported requirements were found. Add rules manually
              if the brief needs interpretation.
            </p>
          ) : (
            <ol className="extraction-candidates">
              {requirements.map((requirement) => (
                <li key={requirement.id}>
                  <div className="extraction-candidate__heading">
                    <div>
                      <p className="mono-label">
                        {getRequirementLabel(requirement.type)}
                      </p>
                      <h4>{requirement.value}</h4>
                    </div>
                    <button
                      className="text-button text-button--danger"
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemoveCandidate(requirement.id)}
                      aria-label={`Exclude extracted requirement ${requirement.description}`}
                    >
                      Exclude
                    </button>
                  </div>
                  <p>{requirement.description}</p>
                  {requirement.before_seconds !== null && (
                    <p className="extraction-candidate__deadline mono-label">
                      DEADLINE / {requirement.before_seconds} SEC
                    </p>
                  )}
                  <figure>
                    <figcaption className="mono-label">SOURCE</figcaption>
                    <blockquote>“{requirement.source_text}”</blockquote>
                  </figure>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
