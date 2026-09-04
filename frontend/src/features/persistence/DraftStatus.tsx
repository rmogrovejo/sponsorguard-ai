import type { DraftUiStatus } from "./useCreatorDraft";
import { statusLabel } from "./useCreatorDraft";

interface DraftStatusProps {
  status: DraftUiStatus;
}

export function DraftStatus({ status }: DraftStatusProps) {
  const label = statusLabel(status);
  if (!label) return null;
  return (
    <span className="mono-label draft-status" aria-live="polite">
      {label}
    </span>
  );
}
