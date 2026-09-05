/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPONSORGUARD_API_URL?: string;
  readonly VITE_CREATORPREFLIGHT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
