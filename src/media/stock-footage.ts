/**
 * Stock Footage Integration (Pexels API)
 * 
 * Searches Pexels for short video clips to use as scene backgrounds.
 * Adds cinematic depth by replacing static gradients with real footage.
 */

import fs from "node:fs/promises";
import path from "node:path";

const PEXELS_API_URL = "https://api.pexels.com/videos/search";

export interface StockFootageResult {
  /** Local path to downloaded video */
  localPath: string;
  /** Original Pexels URL */
  sourceUrl: string;
  /** Duration in seconds */
  duration: number;
  /** Width */
  width: number;
  /** Height */
  height: number;
}

export interface StockFootageOpts {
  /** Search query derived from scene description */
  query: string;
  /** Minimum duration in seconds (should match scene duration) */
  minDuration?: number;
  /** Maximum duration in seconds */
  maxDuration?: number;
  /** Desired resolution width */
  targetWidth?: number;
  /** Output directory for downloaded clips */
  outputDir: string;
  /** Filename for the downloaded clip */
  filename?: string;
  /** Frame orientation to search for (default landscape; tall frames ask for portrait) */
  orientation?: "landscape" | "portrait";
}

/** One Pexels result a human can pick from (SPEC-briefs.md, the sources). */
export interface StockCandidate {
  id: number;
  /** Poster frame. */
  image: string;
  duration: number;
  width: number;
  height: number;
  /** A small playable rendition for the picker's hover preview. */
  preview: string;
  /** The Pexels page (credit). */
  url: string;
}

const pexelsKey = (): string | null => process.env.PEXELS_API_KEY || null;

/** Search Pexels; the candidates, not a download. Empty when the key is
 *  missing or nothing matches. */
export async function searchStockFootage(opts: { query: string; orientation?: "landscape" | "portrait"; perPage?: number; minDuration?: number; maxDuration?: number }): Promise<StockCandidate[]> {
  const apiKey = pexelsKey();
  if (!apiKey || !opts.query.trim()) return [];
  const params = new URLSearchParams({
    query: opts.query.trim(),
    per_page: String(opts.perPage || 12),
    orientation: opts.orientation || "landscape",
    size: "medium",
  });
  const res = await fetch(`${PEXELS_API_URL}?${params}`, { headers: { Authorization: apiKey } });
  if (!res.ok) { console.warn(`  Stock footage: Pexels API error ${res.status}`); return []; }
  const data = await res.json() as any;
  return ((data.videos || []) as any[]).map(toCandidate).filter((c): c is StockCandidate => !!c);
}

function toCandidate(v: any): StockCandidate | null {
  if (!v || !v.id) return null;
  const files = ((v.video_files || []) as any[]).filter((f) => f.link && f.width && f.height).sort((a, b) => a.width - b.width);
  const small = files.find((f) => f.width >= 640) || files[0];
  return { id: Number(v.id), image: String(v.image || ""), duration: Number(v.duration) || 0, width: Number(v.width) || 0, height: Number(v.height) || 0, preview: small ? String(small.link) : "", url: String(v.url || "") };
}

/** Download the best rendition of one Pexels video (by id) into outputDir. */
export async function downloadStockFootage(opts: { id: number; outputDir: string; filename: string; targetWidth?: number }): Promise<StockFootageResult | null> {
  const apiKey = pexelsKey();
  if (!apiKey) return null;
  const res = await fetch(`https://api.pexels.com/videos/videos/${opts.id}`, { headers: { Authorization: apiKey } });
  if (!res.ok) { console.warn(`  Stock footage: Pexels video ${opts.id} -> ${res.status}`); return null; }
  return downloadVideo(await res.json(), opts.outputDir, opts.filename, opts.targetWidth || 1920);
}

async function downloadVideo(video: any, outputDir: string, filename: string, targetWidth: number): Promise<StockFootageResult | null> {
  // Pick the best rendition by RESOLUTION, deterministically. Pexels returns
  // several renditions per video (e.g. 640x360, 1280x720, 1920x1080); sort by
  // width and take the smallest rendition >= target (so we downscale, never
  // upscale); if none reach target, take the largest available.
  const files = (video.video_files || [])
    .filter((f: any) => f.link && f.width && f.height)
    .sort((a: any, b: any) => a.width - b.width);
  const hdFile = files.find((f: any) => f.width >= targetWidth) || files[files.length - 1];
  if (!hdFile?.link) { console.warn("  Stock footage: no downloadable file found"); return null; }
  await fs.mkdir(outputDir, { recursive: true });
  const localPath = path.join(outputDir, filename);
  console.log(`  Stock footage: downloading ${hdFile.width}x${hdFile.height} clip (${video.duration}s)...`);
  const videoRes = await fetch(hdFile.link);
  if (!videoRes.ok) { console.warn(`  Stock footage: download failed ${videoRes.status}`); return null; }
  const buffer = Buffer.from(await videoRes.arrayBuffer());
  await fs.writeFile(localPath, buffer);
  return { localPath, sourceUrl: video.url || "", duration: Number(video.duration) || 0, width: Number(hdFile.width), height: Number(hdFile.height) };
}

/**
 * Search Pexels for a video clip matching the query and download it.
 * Returns null if no suitable clip found or API key not configured.
 */
export async function fetchStockFootage(opts: StockFootageOpts): Promise<StockFootageResult | null> {
  const apiKey = pexelsKey();
  if (!apiKey) {
    console.log("  Stock footage: PEXELS_API_KEY not set, skipping");
    return null;
  }
  const minDur = opts.minDuration || 5;
  const maxDur = opts.maxDuration || 30;
  try {
    const params = new URLSearchParams({ query: opts.query, per_page: "5", orientation: opts.orientation || "landscape", size: "medium" });
    const res = await fetch(`${PEXELS_API_URL}?${params}`, { headers: { Authorization: apiKey } });
    if (!res.ok) { console.warn(`  Stock footage: Pexels API error ${res.status}`); return null; }
    const data = await res.json() as any;
    const videos = data.videos || [];
    if (videos.length === 0) { console.log(`  Stock footage: no results for "${opts.query}"`); return null; }
    const suitable = videos.filter((v: any) => v.duration >= minDur && v.duration <= maxDur);
    const video = suitable.length > 0 ? suitable[0] : videos[0];
    return await downloadVideo(video, opts.outputDir, opts.filename || `stock_${video.id}.mp4`, opts.targetWidth || 1920);
  } catch (e: any) {
    console.warn(`  Stock footage: ${e?.message || e}`);
    return null;
  }
}
