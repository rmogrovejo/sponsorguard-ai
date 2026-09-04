import { SETTINGS_STORAGE_KEY as SETTINGS_KEY } from "../settings/settingsKeys";

export const DRAFT_STORAGE_KEY = "creatorpreflight:draft:v1";

/** Independent from drafts. Defined in settingsKeys.ts. */
export const SETTINGS_STORAGE_KEY = SETTINGS_KEY;

export const DRAFT_VERSION = 1;
export const AUTOSAVE_DEBOUNCE_MS = 400;

export const MAX_PERSISTED_CAMPAIGN_NAME = 160;
export const MAX_PERSISTED_BRIEF_CHARACTERS = 20_000;
export const MAX_PERSISTED_TRANSCRIPT_CHARACTERS = 2_000_000;
export const MAX_PERSISTED_REQUIREMENTS = 50;
export const MAX_PERSISTED_REQUIREMENT_TEXT = 500;
export const MAX_PERSISTED_SOURCE_TEXT = 2_000;
export const MAX_PERSISTED_REQUIREMENT_ID = 128;
export const MAX_PERSISTED_FILENAME = 255;
export const MAX_DRAFT_BYTES = 4_000_000;
