/**
 * Localize remote media in assembled scene HTML.
 *
 * Render loads a scene via file:// and waits for `networkidle`. A remote
 * <video> (e.g. a Pexels clip an agent embedded directly instead of using the
 * downloaded local b-roll) keeps streaming, so networkidle never fires and
 * page.goto hits its 60s timeout -> the whole scene render fails. Remote video
 * also can't be frame-seeked locally (resolveVideoPath expects a local file).
 *
 * This downloads any remote (http/https) media referenced in the HTML to a local
 * file and rewrites the reference to file://, making render robust to ANY remote
 * media URL regardless of how it got there.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Media extensions we localize. Fonts/CSS/JS CDN URLs (fonts.googleapis.com,
// gsap, etc.) deliberately don't match -- they complete quickly and don't stall
// networkidle the way a streaming remote <video> does.
export const REMOTE_MEDIA_EXT = /\.(mp4|webm|mov|m4v|ogv|jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i;

/**
 * Download remote media referenced in `html` into `destDir` and rewrite each
 * reference to a file:// path. On download failure the reference is dropped
 * (replaced with "") rather than left remote -- a broken/empty asset is far
 * better than hanging the render on networkidle.
 */
export async function localizeRemoteMedia(html: string, destDir: string): Promise<string> {
  // Match remote media URLs ANYWHERE -- not just src="..." attributes. The src
  // is often embedded in a JS data object (e.g. {"src":"https://...mp4"}) that a
  // component turns into a <video> at runtime, so an attribute-only scan misses
  // it. The media-extension filter keeps fonts/CSS/JS CDN URLs out.
  const urls = new Set<string>();
  let m: RegExpExecArray | null;
  const urlRe = /https?:\/\/[^\s"'`)<>]+/gi;
  while ((m = urlRe.exec(html))) { if (REMOTE_MEDIA_EXT.test(m[0])) urls.add(m[0]); }
  if (urls.size === 0) return html;

  for (const url of urls) {
    let replacement = "";
    try {
      const ext = (url.match(REMOTE_MEDIA_EXT)?.[1] || "bin").toLowerCase();
      const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 16);
      const localPath = path.join(destDir, `remote_${hash}.${ext}`);
      try {
        await fs.access(localPath); // already downloaded (e.g. shared across scenes)
      } catch {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45000);
        try {
          const res = await fetch(url, { signal: ctrl.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(localPath, buf);
          console.log(`  Localized remote media (${(buf.length / 1024 / 1024).toFixed(1)}MB): ${url.slice(0, 80)}`);
        } finally { clearTimeout(timer); }
      }
      replacement = `file://${localPath}`;
    } catch (e: any) {
      console.warn(`  Warning: failed to localize remote media ${url.slice(0, 80)}: ${e?.message || e} -- dropping to avoid render hang`);
      replacement = "";
    }
    html = html.split(url).join(replacement);
  }
  return html;
}
