import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";

import type { MessageKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import { SectionHeader } from "../shell/SectionHeader";

const MAX_SRT_FILE_BYTES = 2_000_000;

interface TranscriptSectionProps {
  content: string;
  fileName: string | null;
  disabled: boolean;
  error?: MessageKey;
  formatIssue?: boolean;
  onContentChange: (content: string) => void;
  onFileLoaded: (fileName: string, content: string) => void;
  onFileRemoved: () => void;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unexpected file result"));
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsText(file, "UTF-8");
  });
}

export function TranscriptSection({
  content,
  fileName,
  disabled,
  error,
  formatIssue = false,
  onContentChange,
  onFileLoaded,
  onFileRemoved,
}: TranscriptSectionProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<MessageKey | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideId = useId();
  const exampleId = useId();
  const errorId = error ? "transcript-content-error" : undefined;

  useEffect(() => {
    if (formatIssue) setGuideOpen(true);
  }, [formatIssue]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLocaleLowerCase().endsWith(".srt")) {
      setFileError("sponsored.srtExt");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_SRT_FILE_BYTES) {
      setFileError("sponsored.srtTooLarge");
      event.target.value = "";
      return;
    }

    try {
      const text = await readFileAsText(file);
      setFileError(null);
      onFileLoaded(file.name, text);
    } catch {
      setFileError("sponsored.srtUnreadable");
    }
  };

  const removeFile = () => {
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
    onFileRemoved();
  };

  const describedBy = [guideId, exampleId, errorId].filter(Boolean).join(" ");

  return (
    <section className="review-section" aria-labelledby="transcript-heading">
      <SectionHeader
        step={t("sponsored.transcriptStep")}
        title={t("sponsored.transcriptTitle")}
        titleId="transcript-heading"
        description={t("sponsored.transcriptBody")}
      />

      <div className="transcript-toolbar">
        <div>
          <p className="mono-label">{t("sponsored.localFile")}</p>
          <p className="transcript-toolbar__note">
            {t("sponsored.fileStays")}
          </p>
        </div>
        <div className="transcript-toolbar__actions">
          <label
            className={`secondary-button ${disabled ? "is-disabled" : ""}`}
            htmlFor="srt-file"
          >
            {fileName ? t("sponsored.replaceSrt") : t("sponsored.uploadSrt")}
          </label>
          <input
            ref={inputRef}
            className="visually-hidden"
            id="srt-file"
            type="file"
            accept=".srt,application/x-subrip"
            disabled={disabled}
            onChange={handleFile}
          />
          {fileName && (
            <button
              className="text-button text-button--danger"
              type="button"
              disabled={disabled}
              onClick={removeFile}
            >
              {t("shortform.removeFile")}
            </button>
          )}
        </div>
      </div>

      {fileName && (
        <div className="file-record" role="status">
          <span className="file-record__mark" aria-hidden="true">
            SRT
          </span>
          <span>
            <span className="mono-label">{t("sponsored.sourceFile")}</span>
            <strong>{fileName}</strong>
          </span>
        </div>
      )}

      {fileError && (
        <p className="section-error" role="alert">
          {t(fileError)}
        </p>
      )}

      <div className="form-field transcript-field">
        <label htmlFor="transcript-content">{t("sponsored.srtLabel")}</label>
        <div
          className={`srt-guide${formatIssue ? " srt-guide--attention" : ""}`}
          role="note"
        >
          <p className="mono-label" id={guideId}>
            {t("sponsored.srtFormatTitle")}
          </p>
          <p className="srt-guide__summary">{t("sponsored.srtFormatSummary")}</p>
          <pre className="srt-guide__example" id={exampleId}>
            <code>{t("sponsored.srtExample")}</code>
          </pre>
          <details
            open={guideOpen}
            onToggle={(event) => setGuideOpen(event.currentTarget.open)}
          >
            <summary>{t("sponsored.srtGuideToggle")}</summary>
            <ol className="srt-guide__rules">
              <li>{t("sponsored.srtRule1")}</li>
              <li>{t("sponsored.srtRule2")}</li>
              <li>{t("sponsored.srtRule3")}</li>
              <li>{t("sponsored.srtRule4")}</li>
            </ol>
          </details>
        </div>
        <textarea
          id="transcript-content"
          value={content}
          disabled={disabled}
          spellCheck={false}
          placeholder={t("sponsored.srtPlaceholder")}
          onChange={(event) => onContentChange(event.target.value)}
          aria-invalid={Boolean(error) || formatIssue}
          aria-describedby={describedBy || undefined}
        />
        <div className="transcript-field__meta">
          <span>{t("sponsored.pasteOnly")}</span>
          <span className="mono-label">{t("sponsored.chars", { count: content.length.toLocaleString() })}</span>
        </div>
        {error && (
          <p className="field-error" id="transcript-content-error">
            {t(error)}
          </p>
        )}
      </div>
    </section>
  );
}
