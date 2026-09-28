/**
 * SHARE LINKS: a rendered film you can send as a link.
 *
 * Marc was downloading the MP4 and re-uploading it to Slack -- slow, and
 * Slack's re-compression cost resolution. A share is a SNAPSHOT of the
 * project's latest render (output.mp4 is overwritten by every render, so a
 * link someone already has must not change under them), a poster frame for
 * link previews, and an unguessable token: /watch/{token} is a clean public
 * page that plays it; the tenant and project ids never appear in the link.
 * Turning a share off deletes its snapshot and the link 404s.
 *
 * Records live in <dataDir>/_system/shares/<token>.json (a global index so a
 * public request finds its share by token alone); the files live in the
 * project's output dir under shares/.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { projectOutputDir } from "../persistence/paths.js";
import { probeVideoMeta } from "./asset-intel.js";
import { ensureFaststart } from "./encode.js";

const execFileAsync = promisify(execFile);

export interface Share {
  token: string;
  tenant_id: string;
  project_id: string;
  title: string;
  created_at: string;
  /** When the render it snapshots was written. */
  rendered_at: string;
  width: number;
  height: number;
  duration: number;
  size_bytes: number;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{16,32}$/;

export function sharesDir(dataDir = config.dataDir): string {
  return path.join(dataDir, "_system", "shares");
}

export function isShareToken(t: string): boolean {
  return TOKEN_RE.test(t);
}

/** The snapshot and poster paths for a share. */
export function shareFiles(share: Pick<Share, "tenant_id" | "project_id" | "token">): { video: string; poster: string } {
  const dir = path.join(projectOutputDir(share.tenant_id, share.project_id), "shares");
  return { video: path.join(dir, `${share.token}.mp4`), poster: path.join(dir, `${share.token}.jpg`) };
}

/**
 * Snapshot the project's latest render as a new share. Throws when the
 * project has no render yet.
 */
export async function createShare(tenantId: string, projectId: string, title: string, dataDir = config.dataDir): Promise<Share> {
  const src = path.join(projectOutputDir(tenantId, projectId), "output.mp4");
  const st = await fs.stat(src).catch(() => null);
  if (!st) throw new Error("this film has not been rendered yet -- render it, then share");
  const token = crypto.randomBytes(12).toString("base64url");
  const share: Share = {
    token, tenant_id: tenantId, project_id: projectId,
    title: String(title || "").trim().slice(0, 140) || "A film",
    created_at: new Date().toISOString(),
    rendered_at: st.mtime.toISOString(),
    width: 0, height: 0, duration: 0, size_bytes: st.size,
  };
  const files = shareFiles(share);
  await fs.mkdir(path.dirname(files.video), { recursive: true });
  await fs.copyFile(src, files.video);
  // Older renders wrote the index last: fix the snapshot so it streams.
  await ensureFaststart(files.video).catch(() => false);
  const meta = await probeVideoMeta(files.video).catch(() => null);
  if (meta) { share.width = meta.width; share.height = meta.height; share.duration = Math.round(meta.duration * 100) / 100; }
  // The poster: a frame a little way in (past a black open), scaled for previews.
  const at = share.duration > 0 ? Math.min(Math.max(1, share.duration * 0.2), share.duration - 0.1) : 1;
  await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(at), "-i", files.video, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", files.poster], { maxBuffer: 10 * 1024 * 1024 })
    .catch((e) => console.warn(`  share: poster skipped (${String(e?.message || e).slice(0, 160)})`));
  share.size_bytes = (await fs.stat(files.video)).size;
  await fs.mkdir(sharesDir(dataDir), { recursive: true });
  await fs.writeFile(path.join(sharesDir(dataDir), `${token}.json`), JSON.stringify(share, null, 2));
  return share;
}

export async function getShare(token: string, dataDir = config.dataDir): Promise<Share | null> {
  if (!isShareToken(token)) return null;
  try { return JSON.parse(await fs.readFile(path.join(sharesDir(dataDir), `${token}.json`), "utf-8")) as Share; }
  catch { return null; }
}

/** A project's live shares, newest first. */
export async function listShares(tenantId: string, projectId: string, dataDir = config.dataDir): Promise<Share[]> {
  const names = await fs.readdir(sharesDir(dataDir)).catch(() => [] as string[]);
  const out: Share[] = [];
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    const s = await getShare(n.slice(0, -5), dataDir);
    if (s && s.tenant_id === tenantId && s.project_id === projectId) out.push(s);
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Turn a share off: the record and its files go; the link 404s. False when it is not this project's. */
export async function revokeShare(tenantId: string, projectId: string, token: string, dataDir = config.dataDir): Promise<boolean> {
  const s = await getShare(token, dataDir);
  if (!s || s.tenant_id !== tenantId || s.project_id !== projectId) return false;
  const files = shareFiles(s);
  await fs.unlink(path.join(sharesDir(dataDir), `${token}.json`)).catch(() => {});
  await fs.unlink(files.video).catch(() => {});
  await fs.unlink(files.poster).catch(() => {});
  return true;
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The public watch page: the film, full quality, nothing else in the way.
 * Open Graph / Twitter tags give Slack (and anyone else) a title, a poster
 * and the video itself for the link preview.
 */
export function watchPageHtml(share: Share, origin: string): string {
  const base = `${origin}/watch/${share.token}`;
  const video = `${base}/video.mp4`, poster = `${base}/poster.jpg`;
  const tall = share.height > share.width;
  const title = esc(share.title);
  const mins = share.duration ? `${Math.floor(share.duration / 60)}:${String(Math.round(share.duration % 60)).padStart(2, "0")}` : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="video.other">
<meta property="og:title" content="${title}">
<meta property="og:url" content="${esc(base)}">
<meta property="og:image" content="${esc(poster)}">
<meta property="og:video" content="${esc(video)}">
<meta property="og:video:secure_url" content="${esc(video)}">
<meta property="og:video:type" content="video/mp4">
${share.width ? `<meta property="og:video:width" content="${share.width}">\n<meta property="og:video:height" content="${share.height}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:image" content="${esc(poster)}">
<style>
  html,body{margin:0;height:100%;background:#0b0b0c;color:#f5f6fa;font-family:Inter,system-ui,-apple-system,sans-serif}
  main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;box-sizing:border-box}
  video{display:block;background:#000;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);max-width:100%;${tall ? "height:min(86vh,calc((100vw - 32px) * 16 / 9));width:auto;" : "width:min(1280px,100%);height:auto;max-height:86vh;"}}
  .meta{display:flex;gap:12px;align-items:center;font-size:14px;color:#a9adb6;max-width:min(1280px,100%);width:100%;justify-content:space-between}
  .meta b{color:#f5f6fa;font-weight:600}
  a{color:#a9adb6}
</style>
</head><body><main>
<video controls playsinline preload="metadata" poster="${esc(poster)}" src="${esc(video)}"${share.width ? ` width="${share.width}" height="${share.height}"` : ""}></video>
<div class="meta"><span><b>${title}</b>${mins ? ` &middot; ${mins}` : ""}</span><a href="${esc(video)}" download>Download</a></div>
</main></body></html>`;
}
