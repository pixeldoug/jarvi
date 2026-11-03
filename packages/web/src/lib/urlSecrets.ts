/**
 * Single-use secrets that arrive in the page URL: password-reset and
 * email-verification `token`s from our emails, and the Gmail OAuth `handoff`.
 * PostHog (`capture_pageview`), Meta Pixel and the OpenAI pixel all record the
 * full URL, so main.tsx calls `takeUrlSecrets()` before any of them load: the
 * values move out of the URL and the address bar keeps only the harmless params.
 *
 * `token` is also kept in this tab's sessionStorage (analytics don't read it),
 * so reloading the reset page doesn't make a still-valid link unusable; pages
 * call `clearUrlSecret('token')` once it's redeemed.
 */
const SECRET_PARAMS = ['token', 'handoff'] as const;
type UrlSecret = (typeof SECRET_PARAMS)[number];

const PERSISTED: ReadonlySet<UrlSecret> = new Set(['token']);
const storageKey = (name: UrlSecret) => `jarvi:url-secret:${name}`;

const secrets = new Map<UrlSecret, string>();

function storeValue(name: UrlSecret, value: string | null): void {
  if (!PERSISTED.has(name)) return;
  try {
    if (value === null) sessionStorage.removeItem(storageKey(name));
    else sessionStorage.setItem(storageKey(name), value);
  } catch {
    // Private mode / blocked storage: the in-memory copy still works.
  }
}

function storedValue(name: UrlSecret): string | null {
  if (!PERSISTED.has(name)) return null;
  try {
    return sessionStorage.getItem(storageKey(name));
  } catch {
    return null;
  }
}

export function takeUrlSecrets(): void {
  const url = new URL(window.location.href);
  let found = false;
  for (const name of SECRET_PARAMS) {
    const value = url.searchParams.get(name);
    if (value === null) continue;
    secrets.set(name, value);
    storeValue(name, value);
    url.searchParams.delete(name);
    found = true;
  }
  if (found) window.history.replaceState(window.history.state, '', url.toString());
}

/** A secret taken from the landing URL (or kept from it before a reload), or null. */
export function readUrlSecret(name: UrlSecret): string | null {
  return secrets.get(name) ?? storedValue(name);
}

/** Forgets a secret once it's been redeemed (or turned out invalid). */
export function clearUrlSecret(name: UrlSecret): void {
  secrets.delete(name);
  storeValue(name, null);
}

/** Like `readUrlSecret`, but forgets it (for values that are redeemed once). */
export function consumeUrlSecret(name: UrlSecret): string | null {
  const value = readUrlSecret(name);
  clearUrlSecret(name);
  return value;
}
