import { useEffect, useId, useRef, useState } from "react";

import { useTranslation } from "../../i18n/useTranslation";

interface ClearDraftControlProps {
  meaningful: boolean;
  onClear: () => void;
}

export function ClearDraftControl({ meaningful, onClear }: ClearDraftControlProps) {
  const { t } = useTranslation();
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
        {t("persist.startNew")}
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
        {t("persist.confirmTitle")}
      </p>
      <p id={copyId}>{t("persist.confirmBody")}</p>
      <div className="draft-confirm__actions">
        <button
          className="text-button text-button--danger"
          type="button"
          onClick={() => {
            setConfirming(false);
            onClear();
          }}
        >
          {t("persist.confirmClear")}
        </button>
        <button className="text-button" type="button" onClick={() => setConfirming(false)}>
          {t("persist.confirmCancel")}
        </button>
      </div>
    </div>
  );
}
