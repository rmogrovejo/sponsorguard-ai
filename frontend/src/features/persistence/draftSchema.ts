import type {
  AudiencePulseInputMode,
  ManualAudienceSource,
} from "../../types/audiencePulse";
import { MANUAL_AUDIENCE_SOURCES } from "../../types/audiencePulse";
import type { RequirementDraft, RequirementType } from "../../types/compliance";
import type { ContentModule } from "../shell/productModules";
import type { ShortFormPlatform } from "../../types/shortform";
import {
  DRAFT_VERSION,
  MAX_DRAFT_BYTES,
  MAX_PERSISTED_AUDIENCE_COMMENTS_TEXT,
  MAX_PERSISTED_BRIEF_CHARACTERS,
  MAX_PERSISTED_CAMPAIGN_NAME,
  MAX_PERSISTED_FILENAME,
  MAX_PERSISTED_REQUIREMENT_ID,
  MAX_PERSISTED_REQUIREMENT_TEXT,
  MAX_PERSISTED_REQUIREMENTS,
  MAX_PERSISTED_SOURCE_TEXT,
  MAX_PERSISTED_TRANSCRIPT_CHARACTERS,
  MAX_PERSISTED_YOUTUBE_URL,
} from "./draftKeys";

export type DraftParseFailure =
  | "invalid_json"
  | "wrong_version"
  | "invalid_schema"
  | "oversized";

const REQUIREMENT_TYPES: ReadonlySet<RequirementType> = new Set([
  "required_mention",
  "required_exact_token",
  "forbidden_phrase",
  "required_mention_before",
  "required_url",
  "required_talking_point",
  "forbidden_claim",
]);

const PLATFORMS: ReadonlySet<ShortFormPlatform> = new Set([
  "tiktok",
  "youtube_shorts",
  "instagram_reels",
]);

const MODULES: ReadonlySet<ContentModule> = new Set(["shortform", "sponsored", "audience"]);

const DRAFT_KEYS = new Set([
  "version",
  "savedAt",
  "activeModule",
  "sponsoredContent",
  "shortForm",
  "audiencePulse",
]);
const SPONSORED_KEYS = new Set([
  "campaignName",
  "sponsorBrief",
  "requirements",
  "transcriptContent",
  "transcriptFileName",
]);
const SHORTFORM_KEYS = new Set(["platform", "hadVideoSelected"]);
const AUDIENCE_KEYS = new Set(["youtubeUrl", "commentsText", "inputMode", "manualSource"]);
const AUDIENCE_INPUT_MODES: ReadonlySet<AudiencePulseInputMode> = new Set([
  "youtube",
  "manual",
]);
const MANUAL_SOURCES: ReadonlySet<ManualAudienceSource> = new Set(MANUAL_AUDIENCE_SOURCES);
const REQUIREMENT_KEYS = new Set([
  "id",
  "type",
  "description",
  "value",
  "beforeSeconds",
  "provenance",
]);
const PROVENANCE_KEYS = new Set(["kind", "sourceText"]);

/**
 * Persistence policy: store user-authored working state only.
 * Do not persist analysis reports, Gemini output, File/MP4 objects,
 * request/loading/error state, secrets, or server temp paths.
 * After refresh the user re-runs analysis from restored inputs.
 */
export interface SponsoredContentDraft {
  campaignName: string;
  sponsorBrief: string;
  requirements: RequirementDraft[];
  transcriptContent: string;
  transcriptFileName: string | null;
}

export interface ShortFormDraft {
  platform: ShortFormPlatform;
  hadVideoSelected: boolean;
}

export interface AudiencePulseDraft {
  youtubeUrl: string;
  commentsText: string;
  inputMode: AudiencePulseInputMode;
  manualSource: ManualAudienceSource;
}

export interface CreatorDraft {
  version: 1;
  savedAt: string;
  activeModule: ContentModule;
  sponsoredContent: SponsoredContentDraft;
  shortForm: ShortFormDraft;
  audiencePulse: AudiencePulseDraft;
}

export function emptyAudiencePulse(): AudiencePulseDraft {
  return {
    youtubeUrl: "",
    commentsText: "",
    inputMode: "youtube",
    manualSource: "other",
  };
}

export function inferAudiencePulseInputMode(draft: {
  youtubeUrl: string;
  commentsText: string;
  inputMode?: AudiencePulseInputMode;
}): AudiencePulseInputMode {
  if (draft.inputMode === "youtube" || draft.inputMode === "manual") {
    return draft.inputMode;
  }
  if (draft.commentsText.trim() && !draft.youtubeUrl.trim()) {
    return "manual";
  }
  return "youtube";
}

export function emptyDraft(defaultPlatform: ShortFormPlatform = "tiktok"): CreatorDraft {
  return {
    version: DRAFT_VERSION,
    savedAt: new Date().toISOString(),
    activeModule: "shortform",
    sponsoredContent: {
      campaignName: "",
      sponsorBrief: "",
      requirements: [],
      transcriptContent: "",
      transcriptFileName: null,
    },
    shortForm: {
      platform: defaultPlatform,
      hadVideoSelected: false,
    },
    audiencePulse: emptyAudiencePulse(),
  };
}

export function canonicalDraftPayload(draft: CreatorDraft): string {
  return JSON.stringify({
    version: draft.version,
    activeModule: draft.activeModule,
    sponsoredContent: draft.sponsoredContent,
    shortForm: draft.shortForm,
    audiencePulse: draft.audiencePulse,
  });
}

export function isMeaningfulDraft(
  draft: CreatorDraft,
  defaultPlatform: ShortFormPlatform = "tiktok",
): boolean {
  const sponsored = draft.sponsoredContent;
  if (sponsored.campaignName.trim()) return true;
  if (sponsored.sponsorBrief.trim()) return true;
  if (sponsored.transcriptContent.trim()) return true;
  if (sponsored.transcriptFileName) return true;
  if (sponsored.requirements.some((item) => item.description.trim() || item.value.trim())) {
    return true;
  }
  if (draft.shortForm.platform !== defaultPlatform) return true;
  if (draft.shortForm.hadVideoSelected) return true;
  if (draft.audiencePulse.youtubeUrl.trim()) return true;
  if (draft.audiencePulse.commentsText.trim()) return true;
  return false;
}

export function measureDraftBytes(draft: CreatorDraft): number {
  return new TextEncoder().encode(JSON.stringify(draft)).length;
}

export function draftFitsPersistence(draft: CreatorDraft): boolean {
  const sponsored = draft.sponsoredContent;
  if (sponsored.campaignName.length > MAX_PERSISTED_CAMPAIGN_NAME) return false;
  if (sponsored.sponsorBrief.length > MAX_PERSISTED_BRIEF_CHARACTERS) return false;
  if (sponsored.transcriptContent.length > MAX_PERSISTED_TRANSCRIPT_CHARACTERS) return false;
  if ((sponsored.transcriptFileName?.length ?? 0) > MAX_PERSISTED_FILENAME) return false;
  if (sponsored.requirements.length > MAX_PERSISTED_REQUIREMENTS) return false;
  for (const requirement of sponsored.requirements) {
    if (requirement.id.length > MAX_PERSISTED_REQUIREMENT_ID) return false;
    if (requirement.description.length > MAX_PERSISTED_REQUIREMENT_TEXT) return false;
    if (requirement.value.length > MAX_PERSISTED_REQUIREMENT_TEXT) return false;
    if (requirement.beforeSeconds.length > 32) return false;
    if ((requirement.provenance?.sourceText.length ?? 0) > MAX_PERSISTED_SOURCE_TEXT) {
      return false;
    }
  }
  if (draft.audiencePulse.youtubeUrl.length > MAX_PERSISTED_YOUTUBE_URL) return false;
  if (draft.audiencePulse.commentsText.length > MAX_PERSISTED_AUDIENCE_COMMENTS_TEXT) {
    return false;
  }
  return measureDraftBytes(draft) <= MAX_DRAFT_BYTES;
}

export function parseCreatorDraft(raw: string): CreatorDraft | DraftParseFailure {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return "invalid_json";
  }
  return validateCreatorDraft(value);
}

export function validateCreatorDraft(value: unknown): CreatorDraft | DraftParseFailure {
  if (!isPlainObject(value)) return "invalid_schema";
  if (hasUnexpectedKeys(value, DRAFT_KEYS)) return "invalid_schema";
  if (value.version !== DRAFT_VERSION) return "wrong_version";
  if (typeof value.savedAt !== "string" || !value.savedAt || value.savedAt.length > 40) {
    return "invalid_schema";
  }
  if (typeof value.activeModule !== "string" || !MODULES.has(value.activeModule as ContentModule)) {
    return "invalid_schema";
  }
  const sponsored = validateSponsored(value.sponsoredContent);
  if (sponsored === null) return "invalid_schema";
  const shortForm = validateShortForm(value.shortForm);
  if (shortForm === null) return "invalid_schema";
  // Backward compatible: drafts saved before Audience Pulse omit this slice.
  const audiencePulse =
    value.audiencePulse === undefined
      ? emptyAudiencePulse()
      : validateAudiencePulse(value.audiencePulse);
  if (audiencePulse === null) return "invalid_schema";
  const draft: CreatorDraft = {
    version: 1,
    savedAt: value.savedAt,
    activeModule: value.activeModule as ContentModule,
    sponsoredContent: sponsored,
    shortForm,
    audiencePulse,
  };
  if (!draftFitsPersistence(draft)) return "oversized";
  return draft;
}

function validateSponsored(value: unknown): SponsoredContentDraft | null {
  if (!isPlainObject(value) || hasUnexpectedKeys(value, SPONSORED_KEYS)) return null;
  if (typeof value.campaignName !== "string") return null;
  if (typeof value.sponsorBrief !== "string") return null;
  if (typeof value.transcriptContent !== "string") return null;
  if (!(value.transcriptFileName === null || typeof value.transcriptFileName === "string")) {
    return null;
  }
  if (!Array.isArray(value.requirements)) return null;
  const requirements: RequirementDraft[] = [];
  for (const item of value.requirements) {
    const requirement = validateRequirement(item);
    if (requirement === null) return null;
    requirements.push(requirement);
  }
  const ids = new Set(requirements.map((item) => item.id));
  if (ids.size !== requirements.length) return null;
  return {
    campaignName: value.campaignName,
    sponsorBrief: value.sponsorBrief,
    requirements,
    transcriptContent: value.transcriptContent,
    transcriptFileName: value.transcriptFileName,
  };
}

function validateShortForm(value: unknown): ShortFormDraft | null {
  if (!isPlainObject(value) || hasUnexpectedKeys(value, SHORTFORM_KEYS)) return null;
  if (typeof value.platform !== "string" || !PLATFORMS.has(value.platform as ShortFormPlatform)) {
    return null;
  }
  if (typeof value.hadVideoSelected !== "boolean") return null;
  return {
    platform: value.platform as ShortFormPlatform,
    hadVideoSelected: value.hadVideoSelected,
  };
}

function validateAudiencePulse(value: unknown): AudiencePulseDraft | null {
  if (!isPlainObject(value) || hasUnexpectedKeys(value, AUDIENCE_KEYS)) return null;
  if (typeof value.youtubeUrl !== "string") return null;
  if (typeof value.commentsText !== "string") return null;
  if (
    value.inputMode !== undefined &&
    (typeof value.inputMode !== "string" ||
      !AUDIENCE_INPUT_MODES.has(value.inputMode as AudiencePulseInputMode))
  ) {
    return null;
  }
  if (
    value.manualSource !== undefined &&
    (typeof value.manualSource !== "string" ||
      !MANUAL_SOURCES.has(value.manualSource as ManualAudienceSource))
  ) {
    return null;
  }
  return {
    youtubeUrl: value.youtubeUrl,
    commentsText: value.commentsText,
    inputMode: inferAudiencePulseInputMode({
      youtubeUrl: value.youtubeUrl,
      commentsText: value.commentsText,
      inputMode: value.inputMode as AudiencePulseInputMode | undefined,
    }),
    manualSource: (value.manualSource as ManualAudienceSource | undefined) ?? "other",
  };
}

function validateRequirement(value: unknown): RequirementDraft | null {
  if (!isPlainObject(value) || hasUnexpectedKeys(value, REQUIREMENT_KEYS)) return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.type !== "string" || !REQUIREMENT_TYPES.has(value.type as RequirementType)) {
    return null;
  }
  if (typeof value.description !== "string") return null;
  if (typeof value.value !== "string") return null;
  if (typeof value.beforeSeconds !== "string") return null;
  let provenance: RequirementDraft["provenance"];
  if (value.provenance !== undefined) {
    if (!isPlainObject(value.provenance) || hasUnexpectedKeys(value.provenance, PROVENANCE_KEYS)) {
      return null;
    }
    if (value.provenance.kind !== "sponsor_brief") return null;
    if (typeof value.provenance.sourceText !== "string") return null;
    provenance = {
      kind: "sponsor_brief",
      sourceText: value.provenance.sourceText,
    };
  }
  return {
    id: value.id,
    type: value.type as RequirementType,
    description: value.description,
    value: value.value,
    beforeSeconds: value.beforeSeconds,
    provenance,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnexpectedKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}
