import fs from "node:fs";
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

/**
 * LLMs occasionally shorten asset URLs while copying them through storyboard
 * scenes or template slots ("/assets/<tenant>/projects/library/assets/x.mp4"
 * becomes "/assets/x.mp4"), which 404s at runtime and ships a scene with an
 * empty video. Given a src that does NOT resolve to a real file, search the
 * tenant's asset tree for the basename and return the canonical URL of the
 * match. Returns the original src when it already resolves, when nothing
 * matches, or when the match is ambiguous across non-library projects.
 */
export function recoverAssetUrl(
  src: string,
  tenantId: string,
  dataDir: string = process.env.MP_DATA_DIR || "/data/media-producer",
): string {
  if (!src || !tenantId || /^(https?|data):/i.test(src)) return src;
  try {
    const resolved = resolveVideoPath(src, dataDir);
    if (resolved && fs.existsSync(resolved)) return src;
    const base = path.basename(src);
    if (!base) return src;
    const hits: string[] = [];
    const projRoot = path.join(dataDir, tenantId, "projects");
    if (fs.existsSync(projRoot)) {
      for (const proj of fs.readdirSync(projRoot)) {
        if (fs.existsSync(path.join(projRoot, proj, "assets", base))) {
          hits.push(`/assets/${tenantId}/projects/${proj}/assets/${base}`);
        }
      }
    }
    if (fs.existsSync(path.join(dataDir, tenantId, "assets", base))) {
      hits.push(`/assets/${tenantId}/assets/${base}`);
    }
    if (hits.length === 1) return hits[0];
    // Ambiguous: prefer the shared library project over one-off copies.
    const lib = hits.find((h) => h.includes("/projects/library/"));
    return lib || src;
  } catch {
    return src;
  }
}
