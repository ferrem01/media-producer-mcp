/**
 * Music selection for background tracks.
 *
 * Resolution order:
 *   1. Brand kit music assets (tenant-uploaded tracks with mood tags)
 *   2. Stock music library (bundled royalty-free tracks)
 *   3. Jamendo API (if JAMENDO_CLIENT_ID is set)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { BrandAsset, BrandKit } from "../core/types.js";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  path: string;          // local file path (ready to use)
  source: "brand-kit" | "stock" | "jamendo";
  license: string;
}

export interface MusicSelectOptions {
  mood: string;
  brandKit?: BrandKit | null;
  tenantId?: string;
  minDuration?: number;  // minimum track duration in seconds
}

interface StockManifest {
  attribution: string;
  attribution_url: string;
  tracks: Array<{
    id: string;
    file: string;
    title: string;
    artist: string;
    duration: number;
    moods: string[];
  }>;
}

const STOCK_MUSIC_DIR = path.join(config.dataDir, "_system", "stock-music");

/**
 * Select a background music track by mood.
 *
 * Checks brand kit first, then stock library, then Jamendo.
 * Returns null if no suitable track is found.
 */
export async function selectMusic(opts: MusicSelectOptions): Promise<MusicTrack | null> {
  const mood = opts.mood.toLowerCase();

  // 1. Brand kit music assets
  if (opts.brandKit?.assets) {
    const musicAssets = opts.brandKit.assets.filter(
      (a: BrandAsset) => a.type === "music"
    );

    if (musicAssets.length > 0) {
      // Try mood-matched first
      const moodMatched = musicAssets.find(
        (a: BrandAsset) => a.tags?.some((t: string) => t.toLowerCase() === mood)
      );
      const asset = moodMatched || musicAssets[0]; // fallback to first music asset

      // Resolve the file path
      const assetPath = asset.url.startsWith("/")
        ? asset.url
        : path.join(config.dataDir, opts.tenantId || "", "brand-kit", "assets", asset.url);

      try {
        await fs.access(assetPath);
        console.log(`  Music: using brand kit track "${asset.name}" (mood: ${mood})`);
        return {
          id: `brand-${asset.name}`,
          title: asset.name,
          artist: "Brand Kit",
          duration: asset.duration || 0,
          path: assetPath,
          source: "brand-kit",
          license: "Brand Kit asset",
        };
      } catch {
        console.warn(`  Music: brand kit asset "${asset.name}" not found at ${assetPath}`);
      }
    }
  }

  // 2. Stock music library
  const stockTrack = await selectStockMusic(mood, opts.minDuration);
  if (stockTrack) {
    return stockTrack;
  }

  // 3. Jamendo (if configured)
  const jamendoTrack = await searchJamendo(mood, opts.minDuration);
  if (jamendoTrack) {
    return jamendoTrack;
  }

  return null;
}

/**
 * Select from the bundled stock music library.
 */
async function selectStockMusic(mood: string, minDuration?: number): Promise<MusicTrack | null> {
  try {
    const manifestPath = path.join(STOCK_MUSIC_DIR, "manifest.json");
    const raw = await fs.readFile(manifestPath, "utf-8");
    const manifest: StockManifest = JSON.parse(raw);

    // Find tracks matching the mood
    let candidates = manifest.tracks.filter(t =>
      t.moods.some(m => m.toLowerCase() === mood)
    );

    // If no mood match, pick a default corporate track
    if (candidates.length === 0) {
      candidates = manifest.tracks.filter(t =>
        t.moods.includes("corporate")
      );
    }

    // Filter by minimum duration if specified
    if (minDuration && minDuration > 0) {
      const durationFiltered = candidates.filter(t => t.duration >= minDuration);
      if (durationFiltered.length > 0) {
        candidates = durationFiltered;
      }
      // If none meet min duration, still use candidates (they'll loop)
    }

    if (candidates.length === 0) {
      // Last resort: any track
      candidates = manifest.tracks;
    }

    if (candidates.length === 0) {
      return null;
    }

    // Pick a random track from candidates for variety
    const track = candidates[Math.floor(Math.random() * candidates.length)];
    const trackPath = path.join(STOCK_MUSIC_DIR, track.file);

    try {
      await fs.access(trackPath);
    } catch {
      console.warn(`  Music: stock track "${track.title}" file missing at ${trackPath}`);
      return null;
    }

    console.log(`  Music: using stock track "${track.title}" by ${track.artist} (mood: ${mood})`);

    return {
      id: `stock-${track.id}`,
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      path: trackPath,
      source: "stock",
      license: manifest.attribution,
    };
  } catch {
    // Manifest missing or unreadable
    return null;
  }
}

/**
 * Search and download from Jamendo (requires JAMENDO_CLIENT_ID).
 */
async function searchJamendo(mood: string, minDuration?: number): Promise<MusicTrack | null> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    return null; // Jamendo not configured, silently skip
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      format: "json",
      tags: mood,
      limit: "3",
      order: "popularity_total",
    });

    if (minDuration) {
      params.set("durationbetween", `${Math.max(30, Math.floor(minDuration * 0.8))}_600`);
    }

    const url = `https://api.jamendo.com/v3.0/tracks?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  Music: Jamendo API error ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        name: string;
        artist_name: string;
        duration: number;
        audio: string;
        audiodownload: string;
        license_ccurl: string;
      }>;
    };

    if (!data.results || data.results.length === 0) {
      return null;
    }

    const track = data.results[0];
    const downloadUrl = track.audiodownload || track.audio;
    if (!downloadUrl) return null;

    // Download to a temp location
    const tmpDir = path.join(config.dataDir, "_system", "cache", "jamendo");
    await fs.mkdir(tmpDir, { recursive: true });
    const trackPath = path.join(tmpDir, `${track.id}.mp3`);

    // Check if already cached
    try {
      await fs.access(trackPath);
    } catch {
      const audioRes = await fetch(downloadUrl);
      if (!audioRes.ok) return null;
      const buffer = Buffer.from(await audioRes.arrayBuffer());
      await fs.writeFile(trackPath, buffer);
    }

    console.log(`  Music: using Jamendo track "${track.name}" by ${track.artist_name}`);

    return {
      id: `jamendo-${track.id}`,
      title: track.name,
      artist: track.artist_name,
      duration: track.duration,
      path: trackPath,
      source: "jamendo",
      license: track.license_ccurl || "CC",
    };
  } catch (e: any) {
    console.warn(`  Music: Jamendo search failed: ${e.message}`);
    return null;
  }
}

// ── Legacy exports for backwards compat ──

export type MusicSearchResult = MusicTrack;

export interface MusicSearchOptions {
  mood?: string;
  genre?: string;
  duration_min?: number;
  duration_max?: number;
  limit?: number;
}

/**
 * @deprecated Use selectMusic() instead.
 */
export async function searchMusic(
  query: string,
  opts?: MusicSearchOptions,
): Promise<MusicSearchResult[]> {
  const track = await selectMusic({
    mood: opts?.mood || query,
    minDuration: opts?.duration_min,
  });
  return track ? [track] : [];
}

/**
 * @deprecated Use selectMusic() instead - it handles downloading.
 */
export async function downloadTrack(
  trackId: string,
  outputPath: string,
): Promise<string> {
  // For stock tracks, just copy
  try {
    const manifestPath = path.join(STOCK_MUSIC_DIR, "manifest.json");
    const raw = await fs.readFile(manifestPath, "utf-8");
    const manifest: StockManifest = JSON.parse(raw);
    const id = trackId.replace("stock-", "");
    const track = manifest.tracks.find(t => t.id === id);
    if (track) {
      const src = path.join(STOCK_MUSIC_DIR, track.file);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.copyFile(src, outputPath);
      return outputPath;
    }
  } catch { /* fall through */ }

  // For Jamendo tracks, download
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    throw new Error("Cannot download track: JAMENDO_CLIENT_ID not set and track not in stock library");
  }

  const infoUrl = `https://api.jamendo.com/v3.0/tracks?client_id=${clientId}&format=json&id=${trackId.replace("jamendo-", "")}`;
  const infoRes = await fetch(infoUrl);
  if (!infoRes.ok) throw new Error(`Jamendo API error: ${infoRes.status}`);

  const info = (await infoRes.json()) as {
    results: Array<{ audiodownload: string; audio: string }>;
  };
  if (!info.results?.length) throw new Error(`Track ${trackId} not found`);

  const downloadUrl = info.results[0].audiodownload || info.results[0].audio;
  if (!downloadUrl) throw new Error(`No download URL for track ${trackId}`);

  const audioRes = await fetch(downloadUrl);
  if (!audioRes.ok) throw new Error(`Failed to download: ${audioRes.status}`);

  const buffer = Buffer.from(await audioRes.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}
