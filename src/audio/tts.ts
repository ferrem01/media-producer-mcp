/**
 * NARRATION: every voice the system speaks with is an ElevenLabs voice.
 *
 * The OpenAI TTS voices (alloy, echo, fable, onyx, nova, shimmer) are gone
 * (Marc, Oct 8: "OpenAI's voice sucks ... we should be using one of the many
 * 11 labs voices ... remove any of that OpenAI voice code"). One path reads a
 * line: `speak` -- the voice resolved, read on the performed-scene model,
 * tempo-changed with pitch kept, levelled to -14 LUFS (measured, then one
 * gain -- see `levelLine`).
 *
 * A voice setting is one of:
 *  - a stock ElevenLabs voice by name ("brian", "sarah" -- STOCK_VOICES);
 *  - a cast actor's id ("marc"): their ElevenLabs voice, a clone;
 *  - an ElevenLabs voice id.
 * Unset, it is DEFAULT_VOICE. A saved film or brand kit that still names an
 * OpenAI voice reads as the stock voice it maps to (LEGACY_VOICES), so old
 * data plays; nothing writes those names any more.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { measureLoudness } from "../core/take-sanitize.js";

const run = promisify(execFile);

/** ElevenLabs' premade voices (stable ids on every account). */
export const STOCK_VOICES: Record<string, { id: string; what: string }> = {
  brian: { id: "nPczCjzI2devNBz1zQrb", what: "deep, resonant American man -- narration" },
  roger: { id: "CwhRBWXzGAHq8TQ4Fs17", what: "laid-back, casual American man" },
  george: { id: "JBFqnCBsd6RMkjVDRZzb", what: "warm British man -- storytelling" },
  daniel: { id: "onwK4e9ZLuTAKqWW03F9", what: "steady British man -- broadcast" },
  liam: { id: "TX3LPaxmHKxFdv7VOQHJ", what: "energetic young American man" },
  sarah: { id: "EXAVITQu4vr4xnSDxMaL", what: "confident, warm American woman" },
  jessica: { id: "cgSgspJ2msm6clMCkdW9", what: "bright, expressive American woman" },
  laura: { id: "FGY2WhTYpPnrIDTdsKH5", what: "upbeat young American woman" },
  charlotte: { id: "XB0fDUnXU5powFXDhCwa", what: "relaxed Swedish-English woman" },
  rachel: { id: "21m00Tcm4TlvDq8ikWAM", what: "calm American woman -- narration" },
};

/** The narrator when nobody picks one. */
export const DEFAULT_VOICE = "brian";

/** Old OpenAI voice names still in saved data -> the stock voice they read as. */
export const LEGACY_VOICES: Record<string, string> = {
  alloy: "roger", echo: "daniel", fable: "george", onyx: "brian", nova: "sarah", shimmer: "jessica",
};

/** One line for a tool description: the stock names and the other forms. */
export const VOICE_DESCRIBE = `An ElevenLabs voice: a stock name (${Object.keys(STOCK_VOICES).join(", ")}; default ${DEFAULT_VOICE}), a cast actor id (their own voice, e.g. a clone), or an ElevenLabs voice id.`;

type ActorLookup = (tenant: string, id: string) => Promise<{ voice_id?: string; name?: string } | null>;

/** The ElevenLabs voice id a setting names. */
export async function resolveVoice(voice: unknown, ctx: { tenant?: string; getActor?: ActorLookup } = {}): Promise<string> {
  let v = String(voice ?? "").trim();
  if (!v) v = DEFAULT_VOICE;
  const key = v.toLowerCase();
  const stock = STOCK_VOICES[LEGACY_VOICES[key] || key];
  if (stock) return stock.id;
  if (ctx.getActor && ctx.tenant) {
    const a = await ctx.getActor(ctx.tenant, v).catch(() => null);
    if (a) {
      if (!a.voice_id) throw new Error(`${a.name || v} has no voice yet (cast update_actor voice_id)`);
      return a.voice_id;
    }
  }
  if (/^[A-Za-z0-9]{16,32}$/.test(v)) return v;
  throw new Error(`Unknown voice "${v}". ${VOICE_DESCRIBE}`);
}

/** A read speed that still sounds like a person. */
export function voiceSpeed(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(0.8, Math.min(1.25, n)) : 1;
}

async function elevenRead(text: string, voiceId: string, out: string): Promise<void> {
  const { elevenSpeech } = await import("../core/generated-take.js");
  const { SCRIPT_VOICE_MODEL } = await import("../core/scene-performance.js");
  await elevenSpeech(text, voiceId, out, SCRIPT_VOICE_MODEL);
}

/** The level every line is read at (integrated LUFS). */
export const LINE_LOUDNESS_LUFS = -14;

/** dB that brings a line measured at `measured` LUFS to LINE_LOUDNESS_LUFS;
 *  0 when it could not be measured (silence, a probe failure). */
export function levelGain(measured: number | null): number {
  return measured == null ? 0 : Math.round((LINE_LOUDNESS_LUFS - measured) * 100) / 100;
}

/** The line's filter: tempo, ONE gain for the whole line, a peak limiter
 *  (-1.5 dBTP). Not a single-pass loudnorm: that one rides its gain on a 3 s
 *  window, so a 2 s line ("It's free. Click to save your spot.") came out
 *  quieter than the lines around it -- the voice dropped in the last scene
 *  (Marc, Oct 8, proj_f5c104bb). Measured first, every line lands level
 *  whatever its length. */
export function levelFilter(speed: number, gainDb: number): string {
  return [speed !== 1 ? `atempo=${speed}` : "", `volume=${gainDb}dB`, "alimiter=limit=0.84:level=false"].filter(Boolean).join(",");
}

/** Read `text` in `voice` into `out` (an mp3). */
export async function speak(opts: {
  text: string; out: string; voice?: unknown; speed?: number; tenant?: string;
  getActor?: ActorLookup;
  /** The reader (tests inject one); default ElevenLabs. */
  read?: (text: string, voiceId: string, out: string) => Promise<void>;
}): Promise<string> {
  const text = String(opts.text || "").trim();
  if (!text) throw new Error("Nothing to read (text)");
  const getActor = opts.getActor || (opts.tenant ? (await import("../core/cast.js")).getActor : undefined);
  const voiceId = await resolveVoice(opts.voice, { tenant: opts.tenant, getActor });
  await fs.mkdir(path.dirname(opts.out), { recursive: true });
  const raw = `${opts.out}.raw.mp3`;
  await (opts.read || elevenRead)(text, voiceId, raw);
  const speed = voiceSpeed(opts.speed);
  const gain = levelGain(await measureLoudness(raw));
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", levelFilter(speed, gain),
    "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", opts.out]);
  await fs.rm(raw, { force: true });
  console.log(`  Voice: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}" in ${String(opts.voice || DEFAULT_VOICE)} -> ${path.basename(opts.out)}`);
  return opts.out;
}
