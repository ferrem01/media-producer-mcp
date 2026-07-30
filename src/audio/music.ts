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
  /** Instrumental tracks only. DEFAULT TRUE: these films carry their story
   *  in on-screen type or narration, and lyrics fight both -- vocals never
   *  belong under a marketing film unless someone deliberately asks. Pass
   *  `false` explicitly to allow vocal tracks. (Tenant brand-kit uploads
   *  are exempt: an uploaded track is a deliberate choice.) */
  instrumental?: boolean;
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
    /** Track carries vocals/lyrics. Absent = assumed instrumental (the
     *  bundled corporate beds are); true = skipped under the default
     *  instrumental-only selection. */
    vocals?: boolean;
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
  const instrumental = opts.instrumental !== false; // default: no vocals, ever

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
  const stockTrack = await selectStockMusic(mood, opts.minDuration, instrumental);
  if (stockTrack) {
    return stockTrack;
  }

  // 3. Jamendo (if configured)
  const jamendoTrack = await searchJamendo(mood, opts.minDuration, instrumental);
  if (jamendoTrack) {
    return jamendoTrack;
  }

  return null;
}

/**
 * Select from the bundled stock music library.
 */
async function selectStockMusic(mood: string, minDuration?: number, instrumental?: boolean): Promise<MusicTrack | null> {
  try {
    const manifestPath = path.join(STOCK_MUSIC_DIR, "manifest.json");
    const raw = await fs.readFile(manifestPath, "utf-8");
    const manifest: StockManifest = JSON.parse(raw);

    // No vocals under the film unless the caller opted out of instrumental.
    const pool = instrumental ? manifest.tracks.filter(t => t.vocals !== true) : manifest.tracks;

    // Find tracks matching the mood
    let candidates = pool.filter(t =>
      t.moods.some(m => m.toLowerCase() === mood)
    );

    // If no mood match, pick a default corporate track
    if (candidates.length === 0) {
      candidates = pool.filter(t =>
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
      // Last resort: any track (still excluding vocals under the default)
      candidates = pool;
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
async function searchJamendo(mood: string, minDuration?: number, instrumental?: boolean): Promise<MusicTrack | null> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    return null; // Jamendo not configured, silently skip
  }

  // Jamendo's tag search is flaky: exact `tags=` frequently returns 0 for a
  // valid tag, and even a good query intermittently comes back empty (cache /
  // rate-limit). Treating one empty as "give up" shipped mute films silently.
  // So: use FUZZY tags, and walk a chain of reliably-populated fallback tags
  // (each retried once) before giving up -- always keeping the commercial-safe
  // license filter (these ship as marketing). Log every empty so it is never
  // silent again.
  const dur = minDuration ? `${Math.max(30, Math.floor(minDuration * 0.8))}_600` : undefined;
  // Primary mood first, then broad tags that consistently return CC-BY/BY-SA
  // tracks, so the default "corporate" (which flakes) still lands something.
  const FALLBACKS = ["electronic", "pop", "happy", "chill", "rock", "calm"];
  const tagChain = [mood, ...FALLBACKS.filter((t) => t !== mood)];

  const queryOnce = async (tag: string, withDuration: boolean) => {
    const params = new URLSearchParams({
      client_id: clientId,
      format: "json",
      fuzzytags: tag,          // fuzzy: exact `tags=` is brittle and often empty
      limit: "5",
      order: "popularity_total",
      ccnc: "false",           // commercial-safe: exclude NonCommercial
      ccnd: "false",           // and NoDerivs (syncing into video is a derivative)
    });
    // A bed under narration must not carry lyrics that fight the speaker.
    if (instrumental) params.set("vocalinstrumental", "instrumental");
    if (withDuration && dur) params.set("durationbetween", dur);
    const res = await fetch(`https://api.jamendo.com/v3.0/tracks?${params.toString()}`);
    if (!res.ok) { console.warn(`  Music: Jamendo API error ${res.status} (tag "${tag}")`); return null; }
    const data = (await res.json()) as {
      headers?: { status?: string; error_message?: string };
      results?: Array<{ id: string; name: string; artist_name: string; duration: number; audio: string; audiodownload: string; license_ccurl: string }>;
    };
    // Jamendo returns HTTP 200 even on auth failure -- the real status is in the body.
    if (data.headers?.status && data.headers.status !== "success") {
      console.warn(`  Music: Jamendo auth/query failed: ${data.headers.error_message || data.headers.status}`);
      return "AUTH_FAIL" as const;
    }
    const results = data.results || [];
    if (!results.length) return null;
    return results.find((t) => t.audiodownload || t.audio) || null;
  };

  try {
    // Two passes: with the duration window, then without it (relax on empty).
    for (const withDuration of [true, false]) {
      for (const tag of tagChain) {
        for (let attempt = 0; attempt < 2; attempt++) { // retry the flaky empty
          const hit = await queryOnce(tag, withDuration);
          if (hit === "AUTH_FAIL") return null; // credentials bad -- no point retrying
          if (hit) {
            const track = hit;
            const downloadUrl = track.audiodownload || track.audio;
            const tmpDir = path.join(config.dataDir, "_system", "cache", "jamendo");
            await fs.mkdir(tmpDir, { recursive: true });
            const trackPath = path.join(tmpDir, `${track.id}.mp3`);
            try {
              await fs.access(trackPath);
            } catch {
              const audioRes = await fetch(downloadUrl);
              if (!audioRes.ok) { console.warn(`  Music: Jamendo download failed ${audioRes.status} for "${track.name}"`); continue; }
              await fs.writeFile(trackPath, Buffer.from(await audioRes.arrayBuffer()));
            }
            console.log(`  Music: using Jamendo track "${track.name}" by ${track.artist_name} (tag "${tag}"${withDuration ? "" : ", no duration filter"})`);
            return {
              id: `jamendo-${track.id}`,
              title: track.name,
              artist: track.artist_name,
              duration: track.duration,
              path: trackPath,
              source: "jamendo",
              license: track.license_ccurl || "CC",
            };
          }
        }
      }
    }
    console.warn(`  Music: Jamendo returned no usable track for "${mood}" after fuzzy + ${tagChain.length}-tag fallback (film will be mute)`);
    return null;
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
