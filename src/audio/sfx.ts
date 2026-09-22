/**
 * THE SOUND-EFFECT LIBRARY.
 *
 * Two shelves, same as music:
 *  - the HOUSE set (audio/foley.ts): synthesized here, no licence, no key,
 *    minted into `_system/sfx` on first use. Always available.
 *  - FREESOUND, filtered to Creative Commons 0 -- public domain, safe in a
 *    paid ad with no attribution. It needs a free API key
 *    (FREESOUND_API_KEY); without one the shelf is simply absent and the
 *    house set stands alone.
 *
 * A pick lands the same way a music pick does: the file is copied (or
 * downloaded once) into the project's assets and placed on the audio track
 * at a time, where the mixer treats it like any other track.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { ensureFoleyLibrary, FOLEY_SET } from "./foley.js";

export const SFX_DIR = path.join(config.dataDir, "_system", "sfx");
const FREESOUND_CACHE = path.join(config.dataDir, "_system", "cache", "freesound");

export interface SfxOption {
  id: string;
  title: string;
  /** Seconds. */
  duration: number;
  source: "house" | "freesound";
  license: string;
  tags: string[];
  /** A URL Studio can play. */
  preview_url?: string;
}

/** The house shelf, minted if this server has not made it yet. */
export async function listHouseSfx(): Promise<SfxOption[]> {
  const entries = await ensureFoleyLibrary(SFX_DIR).catch(() => []);
  return entries.map((e) => ({
    id: `house-${e.id}`,
    title: e.label,
    duration: e.duration,
    source: "house" as const,
    license: "House set -- made here, yours to use",
    tags: e.tags,
    preview_url: `/assets/_system/sfx/${encodeURIComponent(e.file)}`,
  }));
}

interface FreesoundHit {
  id: number;
  name: string;
  duration: number;
  license: string;
  tags?: string[];
  previews?: { "preview-hq-mp3"?: string; "preview-lq-mp3"?: string };
}

/**
 * Freesound, CC0 ONLY. The filter is part of the query, not a post-pass:
 * anything needing attribution or barring commercial use never enters the
 * library. Returns [] when there is no key.
 */
export async function searchFreesound(query: string, opts: { limit?: number; maxDuration?: number } = {}): Promise<SfxOption[]> {
  const key = process.env.FREESOUND_API_KEY;
  if (!key || !query.trim()) return [];
  const filter = `license:"Creative Commons 0" duration:[0.05 TO ${opts.maxDuration || 8}]`;
  const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}`
    + `&fields=id,name,duration,license,tags,previews&page_size=${Math.min(30, opts.limit || 12)}&token=${encodeURIComponent(key)}`;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return [];
  const body = await res.json().catch(() => null) as { results?: FreesoundHit[] } | null;
  return (body?.results || []).map((h) => ({
    id: `freesound-${h.id}`,
    title: h.name.replace(/\.[a-z0-9]+$/i, ""),
    duration: Math.round((h.duration || 0) * 100) / 100,
    source: "freesound" as const,
    license: "CC0 (public domain)",
    tags: (h.tags || []).slice(0, 8),
    preview_url: h.previews?.["preview-hq-mp3"] || h.previews?.["preview-lq-mp3"],
  }));
}

/** Both shelves for a picker. `freesound_configured` tells Studio whether to
 *  offer the search or explain the missing key. */
export async function listSfxOptions(opts: { query?: string } = {}): Promise<{ house: SfxOption[]; freesound: SfxOption[]; freesound_configured: boolean }> {
  const all = await listHouseSfx();
  const q = String(opts.query || "").toLowerCase().trim();
  const words = q.split(/[^a-z0-9]+/).filter(Boolean);
  const house = !words.length ? all : all.filter((o) =>
    words.some((w) => o.title.toLowerCase().includes(w) || o.tags.some((t) => t.includes(w))));
  const freesound_configured = !!process.env.FREESOUND_API_KEY;
  const freesound = q && freesound_configured ? await searchFreesound(q, { limit: 12 }).catch(() => []) : [];
  return { house: house.length ? house : all, freesound, freesound_configured };
}

/**
 * The picked effect as a file inside the project's assets, ready to be a
 * track's source. A house effect is copied; a Freesound pick is downloaded
 * once into the system cache and then copied. Returns the /assets URL.
 */
export async function resolveSfxChoice(id: string, projectAssetsDir: string): Promise<{ url: string; localPath: string; title: string; license: string; duration: number }> {
  const assetUrl = (local: string) => {
    const rel = path.relative(config.dataDir, local).split(path.sep).map(encodeURIComponent).join("/");
    return `/assets/${rel}`;
  };
  if (id.startsWith("house-")) {
    const fid = id.slice("house-".length);
    const spec = FOLEY_SET.find((f) => f.id === fid);
    if (!spec) throw new Error(`Unknown house effect: ${fid}`);
    await ensureFoleyLibrary(SFX_DIR);
    const src = path.join(SFX_DIR, `${fid}.wav`);
    await fs.mkdir(projectAssetsDir, { recursive: true });
    const dest = path.join(projectAssetsDir, `sfx-${fid}.wav`);
    await fs.copyFile(src, dest);
    return { url: assetUrl(dest), localPath: dest, title: spec.label, license: "House set", duration: spec.duration };
  }
  if (id.startsWith("freesound-")) {
    const key = process.env.FREESOUND_API_KEY;
    if (!key) throw new Error("Freesound needs a free API key (FREESOUND_API_KEY) -- the house set needs none");
    const fid = id.slice("freesound-".length);
    await fs.mkdir(FREESOUND_CACHE, { recursive: true });
    const cached = path.join(FREESOUND_CACHE, `${fid}.mp3`);
    try { await fs.access(cached); }
    catch {
      const metaRes = await fetch(`https://freesound.org/apiv2/sounds/${encodeURIComponent(fid)}/?fields=previews,license,name,duration&token=${encodeURIComponent(key)}`);
      if (!metaRes.ok) throw new Error(`Freesound ${fid}: ${metaRes.status}`);
      const meta = await metaRes.json() as FreesoundHit;
      if (!/CC0|Creative Commons 0/i.test(String(meta.license))) throw new Error(`Freesound ${fid} is not CC0 -- the library takes CC0 only`);
      const prev = meta.previews?.["preview-hq-mp3"] || meta.previews?.["preview-lq-mp3"];
      if (!prev) throw new Error(`Freesound ${fid} has no preview to fetch`);
      const audio = await fetch(prev);
      if (!audio.ok) throw new Error(`Freesound ${fid} download: ${audio.status}`);
      await fs.writeFile(cached, Buffer.from(await audio.arrayBuffer()));
    }
    await fs.mkdir(projectAssetsDir, { recursive: true });
    const dest = path.join(projectAssetsDir, `sfx-freesound-${fid}.mp3`);
    await fs.copyFile(cached, dest);
    return { url: assetUrl(dest), localPath: dest, title: `Freesound ${fid}`, license: "CC0 (public domain)", duration: 0 };
  }
  throw new Error(`Unknown effect id: ${id} (expected house-... or freesound-...)`);
}
