import { useEffect, useId, useRef, useState } from "react";

interface ClearDraftControlProps {
  meaningful: boolean;
  onClear: () => void;
}

export function ClearDraftControl({ meaningful, onClear }: ClearDraftControlProps) {
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const copyId = useId();

  useEffect(() => {
    if (confirming) dialogRef.current?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <button className="text-button" type="button" onClick={() => {
        if (!meaningful) {
          onClear();
          return;
        }
        setConfirming(true);
      }}>
        Start new draft
      </button>
    );
  }

  return (
    <div
      ref={dialogRef}
      className="draft-confirm"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={copyId}
      tabIndex={-1}
    >
      <p id={titleId} className="mono-label">
        Start a new review?
      </p>
      <p id={copyId}>Your locally saved draft will be cleared.</p>
      <div className="draft-confirm__actions">
        <button
          className="text-button text-button--danger"
          type="button"
          onClick={() => {
            setConfirming(false);
            onClear();
          }}
        >
          Clear draft
        </button>
        <button className="text-button" type="button" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
