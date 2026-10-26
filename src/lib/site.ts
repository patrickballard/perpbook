// Where this deployment lives publicly: SITE_URL if set, otherwise Vercel's production domain.
// Null when neither is known (local development, a self-host without SITE_URL).
export function siteUrl(): URL | null {
  const url = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  try {
    return url ? new URL(url) : null;
  } catch {
    return null;
  }
}
