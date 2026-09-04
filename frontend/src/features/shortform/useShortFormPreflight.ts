import { useCallback, useRef, useState } from "react";

import type { MessageKey } from "../../i18n/translations";
import {
  analyzeShortForm,
  ShortFormApiError,
} from "../../services/shortformApi";
import type {
  LocalVideoSelection,
  ShortFormPlatform,
  ShortFormReport,
} from "../../types/shortform";
import { SHORTFORM_MAX_UPLOAD_BYTES } from "../../types/shortform";

export type ShortFormPhase = "idle" | "analyzing" | "success" | "error";

export interface ShortFormRequestError {
  code: string;
  message: string;
  retryable: boolean;
}

function inspectLocalVideo(file: File): Promise<LocalVideoSelection> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, 1500);
    video.onloadedmetadata = () => {
      window.clearTimeout(timeoutId);
      const selection: LocalVideoSelection = {
        file,
        filename: file.name,
        sizeBytes: file.size,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      };
      cleanup();
      resolve(selection);
    };
    video.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("unreadable"));
    };
    video.src = url;
  });
}

export function useShortFormPreflight(initialPlatform: ShortFormPlatform = "tiktok") {
  const [platform, setPlatform] = useState<ShortFormPlatform>(initialPlatform);
  const [selection, setSelection] = useState<LocalVideoSelection | null>(null);
  const [selectionError, setSelectionError] = useState<MessageKey | null>(null);
  const [phase, setPhase] = useState<ShortFormPhase>("idle");
  const [requestError, setRequestError] = useState<ShortFormRequestError | null>(null);
  const [report, setReport] = useState<ShortFormReport | null>(null);
  const inFlight = useRef(false);

  const selectFile = useCallback(async (file: File | null) => {
    setSelectionError(null);
    setRequestError(null);
    setReport(null);
    setPhase("idle");
    if (!file) {
      setSelection(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".mp4")) {
      setSelection(null);
      setSelectionError("shortform.mp4Only");
      return;
    }
    if (file.size > SHORTFORM_MAX_UPLOAD_BYTES) {
      setSelection(null);
      setSelectionError("shortform.tooLarge");
      return;
    }
    if (typeof URL.createObjectURL !== "function") {
      setSelection({
        file,
        filename: file.name,
        sizeBytes: file.size,
        durationSeconds: null,
        width: null,
        height: null,
      });
      return;
    }
    try {
      setSelection(await inspectLocalVideo(file));
    } catch {
      setSelection({
        file,
        filename: file.name,
        sizeBytes: file.size,
        durationSeconds: null,
        width: null,
        height: null,
      });
    }
  }, []);

  const analyze = useCallback(async (): Promise<void> => {
    if (inFlight.current || selection === null) return;
    inFlight.current = true;
    setPhase("analyzing");
    setRequestError(null);
    try {
      const nextReport = await analyzeShortForm(platform, selection.file);
      setReport(nextReport);
      setPhase("success");
    } catch (error: unknown) {
      const safeError =
        error instanceof ShortFormApiError
          ? { code: error.code, message: error.message, retryable: error.retryable }
          : {
              code: "UNEXPECTED_CLIENT_ERROR",
              message: "CreatorPreflight could not finish this preflight. Try again.",
              retryable: true,
            };
      setRequestError(safeError);
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }, [platform, selection]);

  return {
    platform,
    setPlatform,
    selection,
    selectionError,
    phase,
    requestError,
    report,
    selectFile,
    analyze,
  };
}
