/**
 * GENERATED MUSIC: ElevenLabs' music model, a bed from a sentence ("driving
 * electronic, 120 BPM, punchy drums, builds at 15 s, no vocals").
 *
 * The Jamendo search hands back the same few songs for every film (Marc,
 * Oct 8: "it's the same fucking song. Every time"). The ElevenLabs key is
 * already on the server (voices, sound effects) and generated music is
 * cleared for commercial use on a paid plan, so each film can get its own
 * track cut to its own length.
 *
 * A generated bed belongs to the film: it is written into the project's
 * audio folder (not a shared shelf) and placed as the film's music track.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const MUSIC_MIN_SECONDS = 3;
export const MUSIC_MAX_SECONDS = 600;

export interface GeneratedMusic {
  file: string;
  prompt: string;
  seconds: number;
  model: string;
  instrumental: boolean;
  song_id?: string;
}

/** The request body: the prompt, the length in ms (clamped to what the
 *  API takes), instrumental unless asked otherwise. */
export function musicRequestBody(opts: { prompt: string; seconds?: number; instrumental?: boolean; model?: string }): Record<string, unknown> {
  const prompt = String(opts.prompt || "").trim().slice(0, 2000);
  if (!prompt) throw new Error("Describe the music (prompt)");
  const body: Record<string, unknown> = {
    prompt,
    model_id: opts.model || process.env.MP_ELEVENLABS_MUSIC_MODEL || "music_v1",
    force_instrumental: opts.instrumental !== false,
  };
  const s = Number(opts.seconds);
  if (opts.seconds != null && Number.isFinite(s)) {
    body.music_length_ms = Math.round(Math.max(MUSIC_MIN_SECONDS, Math.min(MUSIC_MAX_SECONDS, s)) * 1000);
  }
  return body;
}

/** "music-driving-electronic-1a2b3c.mp3" */
export function musicFileName(name: string, prompt: string, salt = ""): string {
  const slug = String(name || prompt).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "bed";
  const h = crypto.createHash("sha1").update(prompt + "|" + salt).digest("hex").slice(0, 6);
  return `music-${slug}-${h}.mp3`;
}

/** Make one track from a prompt into `outDir`. */
export async function generateMusic(opts: {
  prompt: string; seconds?: number; instrumental?: boolean; name?: string; model?: string; outDir: string;
  fetchImpl?: typeof fetch;
}): Promise<GeneratedMusic> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not set up on this server (ELEVENLABS_API_KEY)");
  const body = musicRequestBody(opts);
  const r = await (opts.fetchImpl || fetch)("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`ElevenLabs music: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  await fs.mkdir(opts.outDir, { recursive: true });
  const file = path.join(opts.outDir, musicFileName(opts.name || "", String(body.prompt), new Date().toISOString()));
  await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
  const songId = r.headers.get("song-id") || undefined;
  return {
    file,
    prompt: String(body.prompt),
    seconds: body.music_length_ms ? Number(body.music_length_ms) / 1000 : 0,
    model: String(body.model_id),
    instrumental: body.force_instrumental === true,
    ...(songId ? { song_id: songId } : {}),
  };
}
