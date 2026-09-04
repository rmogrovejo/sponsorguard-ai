import { useCallback, useEffect, useRef, useState } from "react";

import {
  FixGenerationApiError,
  generateFix as requestFix,
} from "../../services/fixGenerationApi";
import type { ComplianceResult, GeneratedFix } from "../../types/compliance";
import type { ReviewReportSnapshot } from "../review/useComplianceAnalysis";

export type FixPhase = "idle" | "generating" | "success" | "error";

export interface FindingFixState {
  phase: FixPhase;
  suggestion: GeneratedFix | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

const EMPTY_STATE: FindingFixState = {
  phase: "idle",
  suggestion: null,
  error: null,
};

export function useFixGeneration(report: ReviewReportSnapshot) {
  const [states, setStates] = useState<Record<string, FindingFixState>>({});
  const inFlight = useRef(new Set<string>());
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    setStates({});
    inFlight.current.clear();
  }, [report]);

  const generate = useCallback(
    async (finding: ComplianceResult): Promise<void> => {
      const id = finding.requirement_id;
      if (inFlight.current.has(id)) return;
      const requirement = report.requirementsById[id];
      if (!requirement) return;
      const reportAtStart = report;

      inFlight.current.add(id);
      setStates((current) => ({
        ...current,
        [id]: {
          phase: "generating",
          suggestion: current[id]?.suggestion ?? null,
          error: null,
        },
      }));
      try {
        const suggestion = await requestFix({
          requirement,
          finding,
          transcript: { format: "srt", content: reportAtStart.transcriptContent },
        });
        if (reportRef.current !== reportAtStart) return;
        setStates((current) => ({
          ...current,
          [id]: { phase: "success", suggestion, error: null },
        }));
      } catch (error: unknown) {
        if (reportRef.current !== reportAtStart) return;
        const safeError =
          error instanceof FixGenerationApiError
            ? { code: error.code, message: error.message, retryable: error.retryable }
            : {
                code: "UNEXPECTED_CLIENT_ERROR",
                message: "SponsorGuard could not generate a fix. Try again.",
                retryable: true,
              };
        setStates((current) => ({
          ...current,
          [id]: {
            phase: "error",
            suggestion: current[id]?.suggestion ?? null,
            error: safeError,
          },
        }));
      } finally {
        if (reportRef.current === reportAtStart) {
          inFlight.current.delete(id);
        }
      }
    },
    [report],
  );

  const dismiss = useCallback((requirementId: string) => {
    setStates((current) => {
      const next = { ...current };
      delete next[requirementId];
      return next;
    });
  }, []);

  const stateFor = useCallback(
    (requirementId: string) => states[requirementId] ?? EMPTY_STATE,
    [states],
  );

  return { generate, dismiss, stateFor };
}
