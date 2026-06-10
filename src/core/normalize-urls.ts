/**
 * Asset URL normalization.
 *
 * All internal asset URLs must be stored and served as relative paths
 * (e.g. `/assets/tenant/brand-kit/logo.png`), never as absolute
 * localhost URLs (e.g. `http://localhost:3200/assets/...`).
 *
 * This module provides a single normalizeAssetUrl() function and a
 * deep-walk normalizeAllUrls() that sanitizes entire objects/strings.
 *
 * See ARCHITECTURE.md § "Asset URL Normalization" for rationale.
 */

/**
 * Strip any `http(s)://localhost:<port>` prefix from an asset URL,
 * leaving only the relative path. Non-localhost URLs are untouched.
 *
 * Examples:
 *   "http://localhost:3200/assets/t/logo.png"  → "/assets/t/logo.png"
 *   "/assets/t/logo.png"                       → "/assets/t/logo.png"
 *   "https://cdn.example.com/img.png"          → "https://cdn.example.com/img.png"
 */
export function normalizeAssetUrl(url: string): string {
  if (!url) return url;
  return url.replace(/^https?:\/\/localhost(:\d+)?\//, "/");
}

/**
 * Recursively walk a JSON-serializable value (object, array, string)
 * and normalize every string that looks like a localhost asset URL.
 * Returns a new value (does not mutate the input).
 */
export function normalizeAllUrls<T>(value: T): T {
  if (typeof value === "string") {
    return normalizeAssetUrl(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAllUrls(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeAllUrls(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Normalize localhost URLs in an HTML string.
 * Handles both attribute values and inline CSS url() references.
 */
export function normalizeHtmlUrls(html: string): string {
  if (!html) return html;
  return html.replace(/https?:\/\/localhost(:\d+)?\//g, "/");
}
