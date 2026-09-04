import { useEffect, useRef, type ChangeEvent, type FormEvent } from "react";

import { PLATFORM_OPTIONS, SHORTFORM_MAX_UPLOAD_BYTES } from "../../types/shortform";
import type { ShortFormPlatform } from "../../types/shortform";
import { formatTimestamp } from "../../utils/timestamp";
import type { ShortFormDraft } from "../persistence/draftSchema";
import { SectionHeader } from "../shell/SectionHeader";
import { ShortFormReportView } from "./ShortFormReport";
import { useShortFormPreflight } from "./useShortFormPreflight";
import { useShortFormSuggestions } from "./useShortFormSuggestions";

const PHASE_LABELS = {
  idle: "Ready for input",
  analyzing: "Analysis in progress",
  success: "Report complete",
  error: "Action required",
} as const;

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

interface ShortFormWorkspaceProps {
  initialPlatform?: ShortFormPlatform;
  restoredVideoSelected?: boolean;
  onDraftChange?: (draft: ShortFormDraft) => void;
}

export function ShortFormWorkspace({
  initialPlatform = "tiktok",
  restoredVideoSelected = false,
  onDraftChange,
}: ShortFormWorkspaceProps = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const skipDraftPublish = useRef(true);
  const {
    platform,
    setPlatform,
    selection,
    selectionError,
    phase,
    requestError,
    report,
    selectFile,
    analyze,
  } = useShortFormPreflight(initialPlatform);
  const { generate: generateSuggestion, dismiss: dismissSuggestion, stateFor } =
    useShortFormSuggestions(report);
  const requestActive = phase === "analyzing";
  const showReselectNotice = restoredVideoSelected && selection === null;

  useEffect(() => {
    if (!onDraftChange) return;
    if (skipDraftPublish.current) {
      skipDraftPublish.current = false;
      return;
    }
    onDraftChange({
      platform,
      hadVideoSelected: selection !== null || showReselectNotice,
    });
  }, [platform, selection, showReselectNotice, onDraftChange]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    void selectFile(file);
  };

  const removeFile = () => {
    if (inputRef.current) inputRef.current.value = "";
    void selectFile(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void analyze();
  };

  return (
    <>
      <section className="review-introduction" aria-labelledby="shortform-title">
        <div className="section-index">
          <span>Pre-publish quality control</span>
          <span className="mono-label">PROTOCOL / SHORT-FORM</span>
        </div>
        <div className="review-introduction__grid">
          <div>
            <p className="review-introduction__eyebrow mono-label">CREATORPREFLIGHT</p>
            <h1 id="shortform-title">Know what to fix before you publish.</h1>
          </div>
          <p>
            Inspect a TikTok, Shorts, or Reels cut for format, speech, opening,
            pacing, and a closing call to action before it goes live.
          </p>
        </div>
      </section>

      <form className="review-workspace" noValidate onSubmit={submit} aria-busy={requestActive}>
        <div className="workspace-docket">
          <div>
            <p className="mono-label">SHORT-FORM PREFLIGHT</p>
            <h2>Inspect a vertical cut</h2>
          </div>
          <p className="request-state" aria-live="polite">
            Status / {PHASE_LABELS[phase]}
          </p>
        </div>

        <section className="review-section" aria-labelledby="platform-heading">
          <SectionHeader
            step="01 / PLATFORM"
            title="Platform preset"
            titleId="platform-heading"
            description="Preferred vertical guidance for one short-form destination."
          />
          <fieldset className="platform-options" disabled={requestActive}>
            <legend className="visually-hidden">Short-form platform</legend>
            {PLATFORM_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="shortform-platform"
                  value={option.value}
                  checked={platform === option.value}
                  onChange={() => setPlatform(option.value)}
                />
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="review-section" aria-labelledby="video-heading">
          <SectionHeader
            step="02 / VIDEO"
            title="Local video"
            titleId="video-heading"
            description="Upload stays on this machine until you start preflight. MP4 only."
          />
          <div className="transcript-toolbar">
            <input
              ref={inputRef}
              id="shortform-video"
              className="visually-hidden"
              type="file"
              accept=".mp4,video/mp4"
              disabled={requestActive}
              onChange={handleFile}
            />
            <div className="transcript-toolbar__actions">
              <label className="secondary-button" htmlFor="shortform-video">
                {selection ? "Replace video" : "Choose MP4"}
              </label>
              {selection && (
                <button className="text-button" type="button" onClick={removeFile}>
                  Remove file
                </button>
              )}
            </div>
            <p>
              Maximum {Math.round(SHORTFORM_MAX_UPLOAD_BYTES / 1_000_000)} MB. Preflight
              does not start automatically. Uploaded videos are not saved in this browser.
            </p>
          </div>
          {showReselectNotice && (
            <p className="draft-restore-notice" role="status">
              Local video must be selected again after refresh.
            </p>
          )}
          {selection && (
            <dl className="video-meta" aria-label="Selected video">
              <div>
                <dt>Filename</dt>
                <dd>{selection.filename}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(selection.sizeBytes)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>
                  {selection.durationSeconds === null
                    ? "Measured on analyze"
                    : formatTimestamp(selection.durationSeconds)}
                </dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {selection.width && selection.height
                    ? `${selection.width} × ${selection.height}`
                    : "Measured on analyze"}
                </dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>
                  {PLATFORM_OPTIONS.find((item) => item.value === platform)?.label}
                </dd>
              </div>
            </dl>
          )}
          {selectionError && (
            <p className="field-error" role="alert">
              {selectionError}
            </p>
          )}
        </section>

        {requestError && (
          <div className="request-error" role="alert">
            <div>
              <p className="mono-label">PREFLIGHT NOT COMPLETED</p>
              <h3>{requestError.message}</h3>
            </div>
            {requestError.retryable && (
              <button
                className="secondary-button"
                type="button"
                disabled={requestActive}
                onClick={() => void analyze()}
              >
                Retry preflight
              </button>
            )}
          </div>
        )}

        <footer className="analysis-bar">
          <div>
            <p className="mono-label">03 / ANALYZE</p>
            <p>Run deterministic media checks for the selected preset.</p>
          </div>
          <button className="primary-button" type="submit" disabled={requestActive || !selection}>
            {requestActive ? "Running preflight…" : "Start preflight"}
          </button>
        </footer>
      </form>

      {report && (
        <ShortFormReportView
          report={report}
          onRetry={() => void analyze()}
          retrying={requestActive}
          suggestionStateFor={stateFor}
          onSuggest={(findingId) => void generateSuggestion(findingId)}
          onDismissSuggestion={dismissSuggestion}
        />
      )}
    </>
  );
}
