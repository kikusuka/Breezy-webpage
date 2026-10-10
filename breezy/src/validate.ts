import { isLocal } from "./net";

export type UrlCheck = { ok: true; warn?: string } | { ok: false; error: string };

/**
 * Checks a user-entered provider base URL. This runs in the browser, so it is about
 * catching mistakes and unsafe setups, not about SSRF (the user's own browser makes the request).
 * If a backend ever fetches user-supplied URLs, it needs its own server-side checks.
 */
export function checkBaseUrl(raw: string): UrlCheck {
  const v = raw.trim();
  if (!v) return { ok: false, error: "Enter a base URL." };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { ok: false, error: "Not a valid URL. Include https:// at the start." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    return { ok: false, error: "Only http and https URLs are supported." };
  if (u.username || u.password)
    return { ok: false, error: "Don't put credentials in the URL. Use the API key field." };
  if (u.protocol === "http:" && !isLocal(v))
    return { ok: true, warn: "Plain http sends your key unencrypted. Use https unless this is on your own network." };
  return { ok: true };
}
