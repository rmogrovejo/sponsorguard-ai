import { useCallback, useRef, useState } from "react";

import {
  BriefExtractionApiError,
  extractBriefRequirements,
} from "../../services/briefExtractionApi";
import type {
  BriefExtractionPhase,
  ExtractedRequirement,
} from "../../types/briefs";

export const MAX_BRIEF_CHARACTERS = 20_000;

export interface BriefExtractionError {
  code: string;
  message: string;
  retryable: boolean;
}

export function useBriefExtraction() {
  const [phase, setPhase] = useState<BriefExtractionPhase>("idle");
  const [requirements, setRequirements] = useState<ExtractedRequirement[]>([]);
  const [error, setError] = useState<BriefExtractionError | null>(null);
  const inFlight = useRef(false);

  const extract = useCallback(async (brief: string): Promise<void> => {
    if (inFlight.current) return;

    if (!brief.trim()) {
      setRequirements([]);
      setError({
        code: "CLIENT_VALIDATION_ERROR",
        message: "Enter a sponsor brief before extracting requirements.",
        retryable: false,
      });
      setPhase("error");
      return;
    }
    if (brief.length > MAX_BRIEF_CHARACTERS) {
      setRequirements([]);
      setError({
        code: "BRIEF_TOO_LARGE",
        message: "The sponsor brief is too large to process.",
        retryable: false,
      });
      setPhase("error");
      return;
    }

    inFlight.current = true;
    setPhase("extracting");
    setError(null);
    setRequirements([]);
    try {
      const response = await extractBriefRequirements({ brief });
      setRequirements(response.requirements);
      setPhase("success");
    } catch (caught: unknown) {
      const safeError =
        caught instanceof BriefExtractionApiError
          ? {
              code: caught.code,
              message: caught.message,
              retryable: caught.retryable,
            }
          : {
              code: "UNEXPECTED_CLIENT_ERROR",
              message:
                "SponsorGuard could not extract requirements. You can continue manually.",
              retryable: true,
            };
      setError(safeError);
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  const removeCandidate = useCallback((id: string) => {
    setRequirements((current) =>
      current.filter((requirement) => requirement.id !== id),
    );
  }, []);

  const reset = useCallback(() => {
    if (inFlight.current) return;
    setPhase("idle");
    setRequirements([]);
    setError(null);
  }, []);

  return { phase, requirements, error, extract, removeCandidate, reset };
}
