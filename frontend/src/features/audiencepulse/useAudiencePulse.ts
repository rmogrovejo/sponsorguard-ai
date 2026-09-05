import { useCallback, useState } from "react";

import { useTranslation } from "../../i18n/useTranslation";
import type {
  AudiencePulseInputMode,
  AudiencePulseReport,
  ManualAudienceSource,
} from "../../types/audiencePulse";
import {
  analyzeAudiencePulse,
  AudiencePulseApiError,
} from "../../services/audiencePulseApi";
import { inferAudiencePulseInputMode } from "../persistence/draftSchema";
import { sampleCommentsText } from "./sampleComments";

export type AudiencePulsePhase = "idle" | "analyzing" | "success" | "error";

export interface AudiencePulseRequestError {
  code: string;
  retryable: boolean;
}

export function useAudiencePulse(initial?: {
  youtubeUrl?: string;
  commentsText?: string;
  inputMode?: AudiencePulseInputMode;
  manualSource?: ManualAudienceSource;
}) {
  const { locale } = useTranslation();
  const [youtubeUrl, setYoutubeUrl] = useState(initial?.youtubeUrl ?? "");
  const [commentsText, setCommentsText] = useState(initial?.commentsText ?? "");
  const [inputMode, setInputMode] = useState<AudiencePulseInputMode>(() =>
    inferAudiencePulseInputMode({
      youtubeUrl: initial?.youtubeUrl ?? "",
      commentsText: initial?.commentsText ?? "",
      inputMode: initial?.inputMode,
    }),
  );
  const [manualSource, setManualSource] = useState<ManualAudienceSource>(
    initial?.manualSource ?? "other",
  );
  const [phase, setPhase] = useState<AudiencePulsePhase>("idle");
  const [report, setReport] = useState<AudiencePulseReport | null>(null);
  const [requestError, setRequestError] = useState<AudiencePulseRequestError | null>(
    null,
  );
  const [sampledNotice, setSampledNotice] = useState(false);

  const runAnalyze = useCallback(
    async (mode: "fresh" | "retry") => {
      setPhase("analyzing");
      setRequestError(null);
      const analysisLanguage = locale === "es" ? "es" : "en";

      try {
        let next: AudiencePulseReport;
        if (mode === "retry" && report && report.comments.length > 0) {
          next = await analyzeAudiencePulse({
            loaded_comments: report.comments,
            video: report.video,
            analysis_language: analysisLanguage,
          });
        } else if (inputMode === "youtube") {
          const url = youtubeUrl.trim();
          if (!url) {
            setPhase("error");
            setReport(null);
            setRequestError({ code: "AUDIENCE_PULSE_INPUT_INVALID", retryable: false });
            setSampledNotice(false);
            return;
          }
          setSampledNotice(false);
          next = await analyzeAudiencePulse({
            youtube_url: url,
            analysis_language: analysisLanguage,
          });
        } else {
          const sample = sampleCommentsText(commentsText);
          if (sample.kept === 0) {
            setPhase("error");
            setReport(null);
            setRequestError({ code: "AUDIENCE_PULSE_INPUT_INVALID", retryable: false });
            setSampledNotice(false);
            return;
          }
          setSampledNotice(sample.truncated);
          next = await analyzeAudiencePulse({
            comments_text: sample.text,
            analysis_language: analysisLanguage,
          });
        }
        setReport(next);
        setPhase("success");
      } catch (error: unknown) {
        const code =
          error instanceof AudiencePulseApiError
            ? error.code
            : "INTERNAL_SERVER_ERROR";
        const retryable =
          error instanceof AudiencePulseApiError ? error.retryable : true;
        setRequestError({ code, retryable });
        setPhase("error");
      }
    },
    [
      youtubeUrl,
      commentsText,
      inputMode,
      report,
      locale,
    ],
  );

  const analyze = useCallback(async () => {
    await runAnalyze("fresh");
  }, [runAnalyze]);

  const retryAnalysis = useCallback(async () => {
    await runAnalyze(report && report.comments.length > 0 ? "retry" : "fresh");
  }, [runAnalyze, report]);

  return {
    youtubeUrl,
    setYoutubeUrl,
    commentsText,
    setCommentsText,
    inputMode,
    setInputMode,
    manualSource,
    setManualSource,
    phase,
    report,
    requestError,
    sampledNotice,
    analyze,
    retryAnalysis,
  };
}
