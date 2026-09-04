import { useCallback, useEffect, useRef, useState } from "react";

import {
  ShortFormSuggestionApiError,
  generateShortFormSuggestion,
} from "../../services/shortformSuggestionApi";
import type {
  ShortFormReport,
  ShortFormSuggestion,
  SuggestionFindingId,
} from "../../types/shortform";
import { isSuggestionEligible } from "../../types/shortform";

export type SuggestionPhase = "idle" | "generating" | "success" | "error";

export interface FindingSuggestionState {
  phase: SuggestionPhase;
  suggestion: ShortFormSuggestion | null;
  error: { message: string; retryable: boolean } | null;
}

const EMPTY_STATE: FindingSuggestionState = {
  phase: "idle",
  suggestion: null,
  error: null,
};

function relevantSegments(report: ShortFormReport, findingId: SuggestionFindingId) {
  const duration = report.media.duration_seconds;
  const finding = report.findings.find((item) => item.check_id === findingId);
  const windowStart = findingId === "opening" ? 0 : Math.max(0, duration * 0.8);
  const windowEnd = findingId === "opening" ? Math.min(8, duration) : duration;
  return report.speech_segments.filter((segment) => {
    const overlapsWindow = segment.start_seconds < windowEnd && segment.end_seconds > windowStart;
    const overlapsFinding = (finding?.ranges ?? []).some(
      (range) => segment.start_seconds < range.end_seconds && segment.end_seconds > range.start_seconds,
    );
    return overlapsWindow || overlapsFinding;
  });
}

export function useShortFormSuggestions(report: ShortFormReport | null) {
  const [states, setStates] = useState<Record<SuggestionFindingId, FindingSuggestionState>>({
    opening: EMPTY_STATE,
    cta: EMPTY_STATE,
  });
  const inFlight = useRef(new Set<SuggestionFindingId>());
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    setStates({ opening: EMPTY_STATE, cta: EMPTY_STATE });
    inFlight.current.clear();
  }, [report]);

  const generate = useCallback(async (findingId: SuggestionFindingId): Promise<void> => {
    const currentReport = reportRef.current;
    if (!currentReport || inFlight.current.has(findingId)) return;
    const finding = currentReport.findings.find((item) => item.check_id === findingId);
    if (!finding || !isSuggestionEligible(finding)) return;

    inFlight.current.add(findingId);
    setStates((current) => ({
      ...current,
      [findingId]: {
        phase: "generating",
        suggestion: current[findingId]?.suggestion ?? null,
        error: null,
      },
    }));
    try {
      const suggestion = await generateShortFormSuggestion({
        finding_id: findingId,
        platform: currentReport.platform,
        finding,
        speech_segments: relevantSegments(currentReport, findingId),
        video_duration_seconds: currentReport.media.duration_seconds,
      });
      if (reportRef.current !== currentReport) return;
      setStates((current) => ({
        ...current,
        [findingId]: { phase: "success", suggestion, error: null },
      }));
    } catch (error: unknown) {
      if (reportRef.current !== currentReport) return;
      const safeError =
        error instanceof ShortFormSuggestionApiError
          ? { message: error.message, retryable: error.retryable }
          : {
              message: "CreatorPreflight could not generate this suggestion. Try again.",
              retryable: true,
            };
      setStates((current) => ({
        ...current,
        [findingId]: {
          phase: "error",
          suggestion: current[findingId]?.suggestion ?? null,
          error: safeError,
        },
      }));
    } finally {
      if (reportRef.current === currentReport) {
        inFlight.current.delete(findingId);
      }
    }
  }, []);

  const dismiss = useCallback((findingId: SuggestionFindingId) => {
    inFlight.current.delete(findingId);
    setStates((current) => ({
      ...current,
      [findingId]: EMPTY_STATE,
    }));
  }, []);

  const stateFor = useCallback(
    (findingId: SuggestionFindingId) => states[findingId] ?? EMPTY_STATE,
    [states],
  );

  return { generate, dismiss, stateFor };
}
