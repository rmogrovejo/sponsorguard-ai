import type { RequirementType } from "./compliance";

export interface ExtractBriefRequest {
  brief: string;
}

export interface ExtractedRequirement {
  id: string;
  type: RequirementType;
  description: string;
  value: string;
  before_seconds: number | null;
  source_text: string;
}

export interface BriefExtractionMeta {
  provider: string;
  model: string;
  prompt_version: string;
  requirement_count: number;
}

export interface ExtractBriefResponse {
  requirements: ExtractedRequirement[];
  meta: BriefExtractionMeta;
}

export type BriefExtractionPhase = "idle" | "extracting" | "success" | "error";
