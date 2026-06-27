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
}

/**
 * Search Pexels for a video clip matching the query and download it.
 * Returns null if no suitable clip found or API key not configured.
 */
export async function fetchStockFootage(opts: StockFootageOpts): Promise<StockFootageResult | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.log("  Stock footage: PEXELS_API_KEY not set, skipping");
    return null;
  }

  const minDur = opts.minDuration || 5;
  const maxDur = opts.maxDuration || 30;
  const targetWidth = opts.targetWidth || 1920;

  try {
    // Search for videos
    const params = new URLSearchParams({
      query: opts.query,
      per_page: "5",
      orientation: "landscape",
      size: "medium",
    });

    const res = await fetch(`${PEXELS_API_URL}?${params}`, {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      console.warn(`  Stock footage: Pexels API error ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    const videos = data.videos || [];

    if (videos.length === 0) {
      console.log(`  Stock footage: no results for "${opts.query}"`);
      return null;
    }

    // Filter by duration and find best match
    const suitable = videos.filter((v: any) => 
      v.duration >= minDur && v.duration <= maxDur
    );

    const video = suitable.length > 0 ? suitable[0] : videos[0];

    // Pick the best rendition by RESOLUTION, deterministically. Pexels returns
    // several renditions per video (e.g. 640x360, 1280x720, 1920x1080); the old
    // quality-string find-chain could fall through to files[0] and grab the tiny
    // 640x360 one. Sort by width and take the smallest rendition >= target (so we
    // downscale, never upscale); if none reach target, take the largest available.
    const files = (video.video_files || [])
      .filter((f: any) => f.link && f.width && f.height)
      .sort((a: any, b: any) => a.width - b.width);
    const hdFile = files.find((f: any) => f.width >= targetWidth) || files[files.length - 1];

    if (!hdFile?.link) {
      console.warn("  Stock footage: no downloadable file found");
      return null;
    }

    // Download the clip
    await fs.mkdir(opts.outputDir, { recursive: true });
    const filename = opts.filename || `stock_${video.id}.mp4`;
    const localPath = path.join(opts.outputDir, filename);

    console.log(`  Stock footage: downloading ${hdFile.width}x${hdFile.height} clip (${video.duration}s)...`);

    const videoRes = await fetch(hdFile.link);
    if (!videoRes.ok) {
      console.warn(`  Stock footage: download failed ${videoRes.status}`);
      return null;
    }

    const buffer = Buffer.from(await videoRes.arrayBuffer());
    await fs.writeFile(localPath, buffer);

    console.log(`  Stock footage: saved ${(buffer.length / 1024 / 1024).toFixed(1)}MB to ${localPath}`);

    return {
      localPath,
      sourceUrl: hdFile.link,
      duration: video.duration,
      width: hdFile.width,
      height: hdFile.height,
    };
  } catch (e: any) {
    console.warn(`  Stock footage: error - ${e.message}`);
    return null;
  }
}
