import path from "node:path";

/**
 * Convert a video src URL (as it appears in rendered scene HTML) to a
 * filesystem path.
 *
 * Scene HTML is loaded via file://, so a root-relative /assets/... src resolves
 * against the file:// origin to file:///assets/...; absolute http://localhost
 * origins may also appear. We strip both and map normalized /assets/... asset
 * URLs to the configured data dir. Absolute filesystem paths and external URLs
 * (https://cdn..., etc.) pass through unchanged.
 *
 * @param src     the video src as found in the DOM
 * @param dataDir root data directory (defaults to MP_DATA_DIR, mirroring config)
 */
export function resolveVideoPath(
  src: string,
  dataDir: string = process.env.MP_DATA_DIR || "/data/media-producer",
): string {
  let p = src;
  if (p.startsWith("file://")) p = p.slice(7);
  p = p.replace(/^https?:\/\/localhost:\d+/, "");

  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/assets\/([^/]+)\/projects\/([^/]+)\/assets\/(.+)$/)))
    return path.join(dataDir, m[1], "projects", m[2], "assets", m[3]);
  if ((m = p.match(/^\/assets\/([^/]+)\/brand-kit\/(.+)$/)))
    return path.join(dataDir, m[1], "brand-kit", "assets", m[2]);
  if ((m = p.match(/^\/assets\/([^/]+)\/assets\/(.+)$/)))
    return path.join(dataDir, m[1], "assets", m[2]);

  // Absolute filesystem path or external URL -- use as-is.
  return p;
}
