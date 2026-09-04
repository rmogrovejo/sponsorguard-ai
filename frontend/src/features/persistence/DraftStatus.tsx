import type { DraftUiStatus } from "./useCreatorDraft";
import { useTranslation } from "../../i18n/useTranslation";

interface DraftStatusProps {
  status: DraftUiStatus;
}

export function DraftStatus({ status }: DraftStatusProps) {
  const { t } = useTranslation();
  const label =
    status === "saving"
      ? t("persist.saving")
      : status === "saved"
        ? t("persist.saved")
        : status === "unavailable"
          ? t("persist.unavailable")
          : null;
  if (!label) return null;
  return (
    <span className="mono-label draft-status" aria-live="polite">
      {label}
    </span>
  );
}
