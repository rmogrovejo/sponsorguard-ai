export const DEV_API_FALLBACK = "http://127.0.0.1:8000";

export function resolveApiBaseUrl(
  configured?: string | null,
  options: { production?: boolean } = {},
): string {
  const explicit = configured?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const fromEnv = (
    import.meta.env.VITE_SPONSORGUARD_API_URL ??
    import.meta.env.VITE_CREATORPREFLIGHT_API_URL ??
    ""
  ).trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  const production = options.production ?? import.meta.env.PROD;
  if (production) {
    return "";
  }
  return DEV_API_FALLBACK;
}
