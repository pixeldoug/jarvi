/**
 * Single-use secrets that arrive in the page URL: password-reset and
 * email-verification `token`s from our emails, and the Gmail OAuth `handoff`.
 * PostHog (`capture_pageview`), Meta Pixel and the OpenAI pixel all record the
 * full URL, so main.tsx calls `takeUrlSecrets()` before any of them load: the
 * values move into memory and the address bar keeps only the harmless params.
 */
const SECRET_PARAMS = ['token', 'handoff'] as const;
type UrlSecret = (typeof SECRET_PARAMS)[number];

const secrets = new Map<UrlSecret, string>();

export function takeUrlSecrets(): void {
  const url = new URL(window.location.href);
  let found = false;
  for (const name of SECRET_PARAMS) {
    const value = url.searchParams.get(name);
    if (value === null) continue;
    secrets.set(name, value);
    url.searchParams.delete(name);
    found = true;
  }
  if (found) window.history.replaceState(window.history.state, '', url.toString());
}

/** A secret taken from the landing URL, or null. */
export function readUrlSecret(name: UrlSecret): string | null {
  return secrets.get(name) ?? null;
}

/** Like `readUrlSecret`, but forgets it (for values that are redeemed once). */
export function consumeUrlSecret(name: UrlSecret): string | null {
  const value = secrets.get(name) ?? null;
  secrets.delete(name);
  return value;
}
