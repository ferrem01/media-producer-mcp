/**
 * THE ROOM: puts a generated actor's voice back in the room the picture
 * shows. Marc on the Dana replica (Oct 5): the voice sounds "so forward ...
 * layered on top", "a disconnect between the video and the audio". Seedance
 * performs to the ElevenLabs read it is handed -- a dry, close-mic studio
 * voice -- and copies that character, while the picture is a person across a
 * living room, walking, on a couch. Nothing between the words either: a
 * phone in a real room always hears the room.
 *
 * The treatment, on the take's own audio (the lips stay where they are):
 *   1. a phone/lav mic: rumble and the too-clean top trimmed, the 3 kHz
 *      presence that pushes a voice "forward" eased, a little body added,
 *      gentle compression in place of a hard loudness push;
 *   2. a small room: the voice convolved with a short decaying noise
 *      impulse (a living room is ~0.4 s), mixed under the dry voice;
 *   3. room tone: a faint, low noise floor under the whole take, so it
 *      never drops to digital silence;
 *   4. one linear loudness pass (two-pass loudnorm), so the level lands
 *      without pumping the room tone up in the pauses.
 *
 * Only filters the deployed ffmpeg 4.x has: the mixes are amerge + pan, not
 * amix's newer `normalize`.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

/** Where the treated voice lands: a little under the bare take's -16, the
 *  voice reads as in the room rather than in your ear. */
export const ROOM_LOUDNESS_LUFS = -17;

export interface RoomSettings {
  /** 0-1: how much room. 0.5 is a living room at a couple of metres. */
  amount: number;
  /** The reverb's length (s). */
  decay: number;
  /** Reverb mixed under the dry voice (linear gain). */
  wet: number;
  /** Room tone amplitude (linear, before the loudness pass). */
  tone: number;
}

export function roomSettings(amount = 0.5): RoomSettings {
  const a = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0.5));
  return {
    amount: a,
    decay: Math.round((0.3 + 0.25 * a) * 100) / 100,
    wet: Math.round((0.08 + 0.3 * a) * 1000) / 1000,
    tone: Math.round((0.0015 + 0.004 * a) * 10000) / 10000,
  };
}

/** The filter graph: input 0's audio in, [room] out (mono, 48 kHz). */
export function roomFilter(amount = 0.5, seconds = 30): string {
  const s = roomSettings(amount);
  const dur = Math.max(1, Math.ceil(seconds + 1));
  return [
    // 1. the mic
    "[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono," +
      "highpass=f=95,lowpass=f=10500," +
      "equalizer=f=3200:width_type=o:width=1.4:g=-3," +
      "equalizer=f=220:width_type=o:width=1.2:g=1.5," +
      "acompressor=threshold=0.08:ratio=2.2:attack=12:release=220," +
      "asplit=2[dry][send]",
    // 2. the room: a short decaying noise burst as the impulse
    `anoisesrc=d=${s.decay}:c=pink:r=48000:a=0.5:seed=7,` +
      "highpass=f=250,lowpass=f=5500," +
      `afade=t=out:st=0:d=${s.decay}:curve=exp,` +
      "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono[ir]",
    "[send][ir]afir[verb]",
    `[dry][verb]amerge=inputs=2,pan=mono|c0=c0+${s.wet}*c1[voiced]`,
    // 3. room tone
    `anoisesrc=d=${dur}:c=brown:r=48000:a=1:seed=11,` +
      "highpass=f=70,lowpass=f=1600," +
      "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono[tone]",
    `[voiced][tone]amerge=inputs=2,pan=mono|c0=c0+${s.tone}*c1[room]`,
  ].join(";");
}

async function ffmpeg(args: string[]): Promise<string> {
  const { stderr } = await execFileAsync("ffmpeg", ["-hide_banner", "-y", ...args], { maxBuffer: 64 * 1024 * 1024 });
  return String(stderr || "");
}

async function durationOf(file: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    return parseFloat(stdout.trim()) || 0;
  } catch { return 0; }
}

/** The treated voice as a 48 kHz mono wav, at ROOM_LOUDNESS_LUFS (one
 *  linear pass): the room's sound, without a container. */
async function treat(input: string, wavOut: string, amount: number, seconds: number): Promise<number | null> {
  const raw = `${wavOut}.raw.wav`;
  try {
    await ffmpeg(["-i", input, "-filter_complex", roomFilter(amount, seconds) + `;[room]atrim=0:${seconds.toFixed(3)}[out]`,
      "-map", "[out]", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", raw]);
    const target = `I=${ROOM_LOUDNESS_LUFS}:TP=-1.5:LRA=11`;
    const err = await ffmpeg(["-i", raw, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"]);
    const json = err.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    let m: Record<string, string> | null = null;
    try { m = json ? JSON.parse(json[0]) : null; } catch { m = null; }
    const filter = m
      ? `loudnorm=${target}:measured_I=${m.input_i}:measured_LRA=${m.input_lra}:measured_TP=${m.input_tp}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
      : `loudnorm=${target}`;
    await ffmpeg(["-i", raw, "-af", filter, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", wavOut]);
    const loud = m ? Number(m.input_i) : NaN;
    return Number.isFinite(loud) ? loud : null;
  } finally {
    await fs.rm(raw, { force: true }).catch(() => {});
  }
}

/** Write a copy of `videoIn` whose sound is in the room. The picture is
 *  copied as it is; the voice keeps its timing to the sample. */
export async function roomVoiceCopy(videoIn: string, videoOut: string, opts: { amount?: number; work: string }): Promise<{ settings: RoomSettings; loudness: number | null }> {
  const settings = roomSettings(opts.amount);
  const seconds = (await durationOf(videoIn)) || 30;
  await fs.mkdir(opts.work, { recursive: true });
  const wav = path.join(opts.work, `room-${process.pid}-${Date.now()}.wav`);
  try {
    const loudness = await treat(videoIn, wav, settings.amount, seconds);
    await ffmpeg(["-i", videoIn, "-i", wav, "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", seconds.toFixed(3), "-movflags", "+faststart", videoOut]);
    return { settings, loudness };
  } finally {
    await fs.rm(wav, { force: true }).catch(() => {});
  }
}

/** The same room on a voice file (an mp3): the reference Seedance performs
 *  to, so the sound it makes starts in the room (`performance.sound_reference`). */
export async function roomAudioCopy(audioIn: string, audioOut: string, opts: { amount?: number; work: string }): Promise<RoomSettings> {
  const settings = roomSettings(opts.amount);
  const seconds = (await durationOf(audioIn)) || 30;
  await fs.mkdir(opts.work, { recursive: true });
  const wav = path.join(opts.work, `room-ref-${process.pid}-${Date.now()}.wav`);
  try {
    await treat(audioIn, wav, settings.amount, seconds);
    await ffmpeg(["-i", wav, "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "48000", "-ac", "1", audioOut]);
    return settings;
  } finally {
    await fs.rm(wav, { force: true }).catch(() => {});
  }
}
