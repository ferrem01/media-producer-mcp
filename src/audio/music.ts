/**
 * Jamendo music library integration.
 *
 * Search and download royalty-free music tracks via Jamendo API.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface MusicSearchResult {
  id: string;
  name: string;
  artist: string;
  duration: number;
  audioUrl: string;
  license: string;
}

export interface MusicSearchOptions {
  mood?: string;
  genre?: string;
  duration_min?: number;
  duration_max?: number;
  limit?: number;
}

/**
 * Search for music tracks on Jamendo.
 */
export async function searchMusic(
  query: string,
  opts?: MusicSearchOptions,
): Promise<MusicSearchResult[]> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    throw new Error("JAMENDO_CLIENT_ID not set");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    search: query,
    limit: String(opts?.limit || 5),
  });

  if (opts?.mood) params.set("tags", opts.mood);
  if (opts?.genre) params.set("fuzzytags", opts.genre);
  if (opts?.duration_min) params.set("durationbetween", `${opts.duration_min}_${opts.duration_max || 600}`);

  const url = `https://api.jamendo.com/v3.0/tracks?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Jamendo API error: ${res.status} ${res.statusText}`);
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

  return (data.results || []).map((track) => ({
    id: String(track.id),
    name: track.name,
    artist: track.artist_name,
    duration: track.duration,
    audioUrl: track.audio,
    license: track.license_ccurl || "CC",
  }));
}

/**
 * Download a track from Jamendo by ID to a local file path.
 */
export async function downloadTrack(
  trackId: string,
  outputPath: string,
): Promise<string> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    throw new Error("JAMENDO_CLIENT_ID not set");
  }

  // Get track info first to get the download URL
  const infoUrl = `https://api.jamendo.com/v3.0/tracks?client_id=${clientId}&format=json&id=${trackId}`;
  const infoRes = await fetch(infoUrl);
  if (!infoRes.ok) {
    throw new Error(`Jamendo API error: ${infoRes.status}`);
  }

  const info = (await infoRes.json()) as {
    results: Array<{ audiodownload: string; audio: string }>;
  };

  if (!info.results || info.results.length === 0) {
    throw new Error(`Track ${trackId} not found`);
  }

  const downloadUrl = info.results[0].audiodownload || info.results[0].audio;
  if (!downloadUrl) {
    throw new Error(`No download URL for track ${trackId}`);
  }

  // Download the audio file
  const audioRes = await fetch(downloadUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download track: ${audioRes.status}`);
  }

  const buffer = Buffer.from(await audioRes.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);

  return outputPath;
}
