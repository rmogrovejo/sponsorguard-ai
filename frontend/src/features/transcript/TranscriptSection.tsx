import { useRef, useState, type ChangeEvent } from "react";

import { SectionHeader } from "../shell/SectionHeader";

const MAX_SRT_FILE_BYTES = 2_000_000;

interface TranscriptSectionProps {
  content: string;
  fileName: string | null;
  disabled: boolean;
  error?: string;
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
  onContentChange,
  onFileLoaded,
  onFileRemoved,
}: TranscriptSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLocaleLowerCase().endsWith(".srt")) {
      setFileError("Choose a file with the .srt extension.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_SRT_FILE_BYTES) {
      setFileError("This SRT file is too large for a single review.");
      event.target.value = "";
      return;
    }

    try {
      const text = await readFileAsText(file);
      setFileError(null);
      onFileLoaded(file.name, text);
    } catch {
      setFileError("The SRT file could not be read. Try another file.");
    }
  };

  const removeFile = () => {
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
    onFileRemoved();
  };

  const errorId = error ? "transcript-content-error" : undefined;

  return (
    <section className="review-section" aria-labelledby="transcript-heading">
      <SectionHeader
        step="04 / TRANSCRIPT"
        title="Creator transcript"
        titleId="transcript-heading"
        description="Paste SRT text directly or load a UTF-8 .srt file from this device."
      />

      <div className="transcript-toolbar">
        <div>
          <p className="mono-label">LOCAL FILE</p>
          <p className="transcript-toolbar__note">
            The file stays in your browser until you analyze the review.
          </p>
        </div>
        <div className="transcript-toolbar__actions">
          <label
            className={`secondary-button ${disabled ? "is-disabled" : ""}`}
            htmlFor="srt-file"
          >
            {fileName ? "Replace SRT" : "Upload SRT"}
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
              Remove file
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
            <span className="mono-label">SOURCE FILE</span>
            <strong>{fileName}</strong>
          </span>
        </div>
      )}

      {fileError && (
        <p className="section-error" role="alert">
          {fileError}
        </p>
      )}

      <div className="form-field transcript-field">
        <label htmlFor="transcript-content">SRT transcript</label>
        <textarea
          id="transcript-content"
          value={content}
          disabled={disabled}
          spellCheck={false}
          placeholder={
            "1\n00:00:38,000 --> 00:00:42,000\nToday's video is sponsored by AcmeVPN."
          }
          onChange={(event) => onContentChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
        />
        <div className="transcript-field__meta">
          <span>Paste or upload SRT only</span>
          <span className="mono-label">{content.length.toLocaleString()} CHARS</span>
        </div>
        {error && (
          <p className="field-error" id="transcript-content-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
