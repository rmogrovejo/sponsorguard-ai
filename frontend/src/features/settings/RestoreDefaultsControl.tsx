import { useEffect, useId, useRef, useState } from "react";

import { useTranslation } from "../../i18n/useTranslation";

interface RestoreDefaultsControlProps {
  onRestore: () => void;
}

export function RestoreDefaultsControl({ onRestore }: RestoreDefaultsControlProps) {
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
      <button className="secondary-button" type="button" onClick={() => setConfirming(true)}>
        {t("settings.restore")}
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
        {t("settings.restoreTitle")}
      </p>
      <p id={copyId}>{t("settings.restoreBody")}</p>
      <div className="draft-confirm__actions">
        <button
          className="text-button text-button--danger"
          type="button"
          onClick={() => {
            setConfirming(false);
            onRestore();
          }}
        >
          {t("settings.restore")}
        </button>
        <button className="text-button" type="button" onClick={() => setConfirming(false)}>
          {t("persist.confirmCancel")}
        </button>
      </div>
    </div>
  );
}
