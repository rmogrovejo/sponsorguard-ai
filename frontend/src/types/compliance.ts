export type RequirementType =
  | "required_mention"
  | "required_exact_token"
  | "forbidden_phrase"
  | "required_mention_before"
  | "required_url"
  | "required_talking_point"
  | "forbidden_claim";

export interface RequirementDraft {
  id: string;
  type: RequirementType;
  description: string;
  value: string;
  beforeSeconds: string;
  provenance?: {
    kind: "sponsor_brief";
    sourceText: string;
  };
}

interface RequirementPayloadBase {
  id: string;
  description: string;
  value: string;
}

export type RequirementPayload =
  | (RequirementPayloadBase & {
      type: Exclude<RequirementType, "required_mention_before">;
    })
  | (RequirementPayloadBase & {
      type: "required_mention_before";
      before_seconds: number;
    });

export interface AnalyzeComplianceRequest {
  requirements: RequirementPayload[];
  transcript: {
    format: "srt";
    content: string;
  };
}

export type ComplianceStatus = "pass" | "warning" | "fail" | "not_evaluated";

export interface ComplianceSummary {
  total: number;
  evaluated: number;
  not_evaluated: number;
  passed: number;
  warnings: number;
  failed: number;
  compliance_score: number | null;
  verification_coverage: number;
}

export interface ComplianceResult {
  requirement_id: string;
  status: ComplianceStatus;
  reason_code: string;
  reason: string;
  source_segment_index: number | null;
  timestamp_seconds: number | null;
  evidence: string | null;
}

export interface AnalyzeComplianceResponse {
  summary: ComplianceSummary;
  results: ComplianceResult[];
}

export type FixAction = "insert" | "replace" | "review_manually";

export type FixPlacementStrategy =
  | "after_segment"
  | "replace_segment"
  | "before_deadline"
  | "review_segment";

export interface GenerateFixRequest {
  requirement: RequirementPayload;
  finding: ComplianceResult;
  transcript: {
    format: "srt";
    content: string;
  };
}

export interface GeneratedFix {
  requirement_id: string;
  action: FixAction;
  suggested_text: string | null;
  placement: {
    strategy: FixPlacementStrategy;
    source_segment_index: number | null;
    timestamp_seconds: number | null;
    before_seconds: number | null;
  } | null;
  reason: string;
}

export type RequestPhase =
  | "idle"
  | "validating"
  | "analyzing"
  | "success"
  | "error";
