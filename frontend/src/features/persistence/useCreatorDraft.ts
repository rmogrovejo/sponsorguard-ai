import { useCallback, useEffect, useRef, useState } from "react";

import type { ShortFormPlatform } from "../../types/shortform";
import { AUTOSAVE_DEBOUNCE_MS } from "./draftKeys";
import {
  canonicalDraftPayload,
  emptyDraft,
  isMeaningfulDraft,
  type CreatorDraft,
  type ShortFormDraft,
  type SponsoredContentDraft,
} from "./draftSchema";
import {
  clearDraft,
  loadDraft,
  saveDraft,
} from "./draftStorage";

export type DraftUiStatus = "idle" | "saving" | "saved" | "unavailable";

export function statusLabel(status: DraftUiStatus): string | null {
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved locally";
  if (status === "unavailable") return "Local save unavailable";
  return null;
}

export interface UseCreatorDraftOptions {
  defaultPlatform?: ShortFormPlatform;
}

export function useCreatorDraft(options: UseCreatorDraftOptions = {}) {
  const defaultPlatform = options.defaultPlatform ?? "tiktok";
  const defaultPlatformRef = useRef(defaultPlatform);
  defaultPlatformRef.current = defaultPlatform;

  const loaded = useRef<ReturnType<typeof loadDraft> | null>(null);
  if (loaded.current === null) {
    loaded.current = loadDraft(undefined, defaultPlatform);
  }

  const draftRef = useRef<CreatorDraft>(loaded.current.draft);
  const lastCanonical = useRef(canonicalDraftPayload(loaded.current.draft));
  const timerRef = useRef<number | null>(null);
  const dirtySinceFailure = useRef(false);

  const [status, setStatus] = useState<DraftUiStatus>(() => {
    if (!loaded.current!.storageAvailable) return "unavailable";
    if (loaded.current!.restored) return "saved";
    return "idle";
  });
  const [invalidNotice, setInvalidNotice] = useState(loaded.current.invalidDiscarded);
  const [epoch, setEpoch] = useState(0);
  const [snapshot, setSnapshot] = useState(loaded.current.draft);
  const [meaningful, setMeaningful] = useState(() =>
    isMeaningfulDraft(loaded.current!.draft, defaultPlatform),
  );

  const flush = useCallback((next: CreatorDraft) => {
    const platformDefault = defaultPlatformRef.current;
    setMeaningful(isMeaningfulDraft(next, platformDefault));
    if (!isMeaningfulDraft(next, platformDefault)) {
      const cleared = clearDraft();
      lastCanonical.current = canonicalDraftPayload(emptyDraft(platformDefault));
      dirtySinceFailure.current = false;
      setStatus(cleared === "unavailable" ? "unavailable" : "idle");
      return;
    }
    const result = saveDraft(next);
    if (result.status === "ok") {
      lastCanonical.current = canonicalDraftPayload({ ...next, savedAt: result.savedAt ?? next.savedAt });
      dirtySinceFailure.current = false;
      setStatus("saved");
      return;
    }
    dirtySinceFailure.current = true;
    setStatus("unavailable");
  }, []);

  const schedule = useCallback(
    (next: CreatorDraft) => {
      draftRef.current = next;
      const canonical = canonicalDraftPayload(next);
      if (canonical === lastCanonical.current) return;
      setMeaningful(isMeaningfulDraft(next, defaultPlatformRef.current));
      setStatus((current) => (current === "unavailable" ? current : "saving"));
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        flush(draftRef.current);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtySinceFailure.current || status !== "unavailable") return;
      if (!isMeaningfulDraft(draftRef.current, defaultPlatformRef.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  const updateSponsored = useCallback(
    (sponsoredContent: SponsoredContentDraft) => {
      schedule({ ...draftRef.current, sponsoredContent });
    },
    [schedule],
  );

  const updateShortForm = useCallback(
    (shortForm: ShortFormDraft) => {
      schedule({ ...draftRef.current, shortForm });
    },
    [schedule],
  );

  const updateActiveModule = useCallback(
    (activeModule: CreatorDraft["activeModule"]) => {
      schedule({ ...draftRef.current, activeModule });
    },
    [schedule],
  );

  const startNewDraft = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = emptyDraft(defaultPlatformRef.current);
    draftRef.current = next;
    lastCanonical.current = canonicalDraftPayload(next);
    dirtySinceFailure.current = false;
    const cleared = clearDraft();
    setMeaningful(false);
    setInvalidNotice(false);
    setSnapshot(next);
    setStatus(cleared === "unavailable" ? "unavailable" : "idle");
    setEpoch((value) => value + 1);
  }, []);

  const dismissInvalidNotice = useCallback(() => {
    setInvalidNotice(false);
  }, []);

  return {
    initialDraft: snapshot,
    restored: loaded.current.restored,
    storageAvailable: loaded.current.storageAvailable,
    status,
    statusText: statusLabel(status),
    invalidNotice,
    epoch,
    hasMeaningfulData: meaningful,
    updateSponsored,
    updateShortForm,
    updateActiveModule,
    startNewDraft,
    dismissInvalidNotice,
  };
}
