/**
 * GENERATED SOUND EFFECTS: ElevenLabs' sound-effects model, a sound from a
 * sentence ("a man yelling FAHHH, loud, meme style").
 *
 * The house set is made here or found free (audio/foley.ts), and that
 * covers most moves -- but some sounds are someone's recording with no free
 * copy (the FAHHH meme, the Vine boom) and a synthesizer only gets near a
 * human voice. Marc: "What about eleven labs" -- the key is already on the
 * server (the voice), and generated effects are licensed for commercial use
 * on a paid plan.
 *
 * A generated sound joins the library as `gen-<name>-<hash>`: made once,
 * kept in `_system/sfx/generated` (a 48 kHz mono WAV, peak-matched to the
 * house set), listed beside the house shelf and placed like any other.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";

const run = promisify(execFile);
export const GEN_SFX_DIR = path.join(config.dataDir, "_system", "sfx", "generated");
const MANIFEST = () => path.join(GEN_SFX_DIR, "manifest.json");

export interface GeneratedSfx {
  id: string;
  label: string;
  prompt: string;
  duration: number;
  file: string;
  source: "elevenlabs";
  created: string;
}

export async function listGeneratedSfx(): Promise<GeneratedSfx[]> {
  try {
    const j = JSON.parse(await fs.readFile(MANIFEST(), "utf8"));
    return Array.isArray(j?.effects) ? j.effects : [];
  } catch { return []; }
}

/** The id a name and prompt get: "gen-fahhh-1a2b3c". */
export function generatedSfxId(name: string, prompt: string, salt = ""): string {
  const slug = String(name || prompt).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "sound";
  const h = crypto.createHash("sha1").update(prompt + "|" + salt).digest("hex").slice(0, 6);
  return `gen-${slug}-${h}`;
}

/**
 * Make one sound from a prompt and add it to the generated shelf.
 * `seconds` 0.5-22 (omitted: the model picks); `influence` 0-1 (how
 * literally the prompt is followed; default 0.4).
 */
export async function generateSfx(opts: { prompt: string; seconds?: number; influence?: number; name?: string }): Promise<GeneratedSfx> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not set up on this server (ELEVENLABS_API_KEY)");
  const prompt = String(opts.prompt || "").trim().slice(0, 450);
  if (!prompt) throw new Error("Describe the sound (prompt)");
  const body: Record<string, unknown> = { text: prompt, prompt_influence: Math.max(0, Math.min(1, opts.influence ?? 0.4)) };
  if (opts.seconds != null && Number.isFinite(Number(opts.seconds))) body.duration_seconds = Math.max(0.5, Math.min(22, Number(opts.seconds)));
  const r = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`ElevenLabs sound effects: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  await fs.mkdir(GEN_SFX_DIR, { recursive: true });
  const id = generatedSfxId(opts.name || "", prompt, new Date().toISOString());
  const mp3 = path.join(GEN_SFX_DIR, `${id}.mp3`);
  await fs.writeFile(mp3, Buffer.from(await r.arrayBuffer()));
  // Into the house format: 48 kHz mono 16-bit, peak at -1.5 dBFS like
  // every house sound, so a palette swap never changes the level.
  const file = `${id}.wav`;
  const wav = path.join(GEN_SFX_DIR, file);
  const probe = await run("ffmpeg", ["-hide_banner", "-i", mp3, "-af", "volumedetect", "-f", "null", "-"]).catch((e) => e);
  const peak = Number((/max_volume: (-?[\d.]+) dB/.exec(String(probe.stderr || "")) || [])[1] ?? 0);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", mp3, "-af", `volume=${(-1.5 - peak).toFixed(2)}dB`,
    "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", wav]);
  await fs.rm(mp3, { force: true });
  const dur = await run("ffmpeg", ["-hide_banner", "-i", wav], { encoding: "utf8" }).catch((e) => e);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(dur.stderr || ""));
  const duration = m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 100) / 100 : Number(body.duration_seconds) || 0;
  const entry: GeneratedSfx = { id, label: opts.name ? `${opts.name} (generated)` : prompt.slice(0, 60), prompt, duration, file, source: "elevenlabs", created: new Date().toISOString() };
  const all = await listGeneratedSfx();
  all.push(entry);
  await fs.writeFile(MANIFEST(), JSON.stringify({ version: 1, effects: all }, null, 2));
  return entry;
}
