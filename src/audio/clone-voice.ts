/**
 * A VOICEOVER IN A REAL VOICE: a film's narration read by an ElevenLabs
 * voice -- a cast actor's clone or any voice id -- instead of the stock TTS
 * voices (Marc, Oct 8: "voice six tabs with my clone"). The same model and
 * level as a performed scene's line (SCRIPT_VOICE_MODEL, -14 LUFS), with
 * the same read-speed control.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";

const run = promisify(execFile);

/** A read speed that still sounds like a person (as perform_scene clamps). */
export function cloneVoiceSpeed(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(0.8, Math.min(1.25, n)) : 1;
}

/** Resolve who reads: an explicit ElevenLabs voice id, else a cast actor's
 *  voice. Throws when neither gives one. */
export async function resolveCloneVoice(tenant: string | undefined, opts: { voice_id?: string; actor?: string }, getActor: (t: string, id: string) => Promise<{ voice_id?: string; name?: string } | null>): Promise<string> {
  if (opts.voice_id) return String(opts.voice_id);
  if (opts.actor) {
    const a = await getActor(String(tenant || ""), String(opts.actor));
    if (!a) throw new Error(`No cast actor "${opts.actor}"`);
    if (!a.voice_id) throw new Error(`${a.name || opts.actor} has no voice yet (cast update_actor voice_id)`);
    return a.voice_id;
  }
  throw new Error("Name the voice: voice_id or actor");
}

/** Speak `text` in an ElevenLabs voice into `out` (mp3): read, tempo, level. */
export async function speakInVoice(opts: {
  text: string; voiceId: string; out: string; speed?: number;
  speak?: (text: string, voiceId: string, out: string) => Promise<void>;
}): Promise<void> {
  const text = String(opts.text || "").trim();
  if (!text) throw new Error("Nothing to read (text)");
  const raw = `${opts.out}.raw.mp3`;
  const speak = opts.speak || (async (t: string, v: string, o: string) => {
    const { elevenSpeech } = await import("../core/generated-take.js");
    const { SCRIPT_VOICE_MODEL } = await import("../core/scene-performance.js");
    await elevenSpeech(t, v, o, SCRIPT_VOICE_MODEL);
  });
  await speak(text, opts.voiceId, raw);
  const speed = cloneVoiceSpeed(opts.speed);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", `${speed !== 1 ? `atempo=${speed},` : ""}loudnorm=I=-14:TP=-1.5:LRA=11`,
    "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", opts.out]);
  await fs.rm(raw, { force: true });
}
