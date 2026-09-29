/**
 * A VOICE ON ONE SIDE. Marc's lav receiver records mono into the LEFT
 * channel of a stereo track, the right one silent (measured on his Old Chimp
 * take: left -16.7 dB RMS, right -113 dB). Played as recorded, he talks from
 * the left in every film. A dead channel is a recording fault, never a mix
 * choice: the live channel goes to both sides, and the voice sits in the
 * center like every film mix. A take with two live channels is left alone.
 *
 * Used where a take arrives (core/take-sanitize.ts) and where the speaker's
 * voice enters a render (core/speaker-track.ts buildSpeakerBase), so takes
 * recorded before this fix come out centered on their next render.
 */
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Below this a channel carries nothing (digital silence reads ~-100 dB). */
const DEAD_DB = -60;
/** The live side must carry something -- a silent take is not "one-sided". */
const LIVE_DB = -50;

/** Per-channel RMS level in dB, from ffmpeg's astats (no ffprobe needed). */
export async function channelLevels(file: string): Promise<number[] | null> {
  let err = "";
  try {
    const r = await execFileAsync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", "astats", "-f", "null", "-"], { maxBuffer: 16 * 1024 * 1024 });
    err = String(r.stderr || "");
  } catch (e: any) {
    err = String(e?.stderr || "");
    if (!/Channel: 1/.test(err)) return null;
  }
  const levels: number[] = [];
  let ch = -1;
  for (const line of err.split("\n")) {
    if (/\] Overall/.test(line)) break;
    const c = line.match(/\] Channel: (\d+)/);
    if (c) { ch = Number(c[1]) - 1; continue; }
    const m = line.match(/\] RMS level dB: (-?inf|-?[\d.]+)/);
    if (m && ch >= 0 && levels[ch] === undefined) levels[ch] = /inf/.test(m[1]) ? -Infinity : Number(m[1]);
  }
  return levels.length ? levels : null;
}

/** The pan filter that puts a one-sided stereo take in the center, or null
 *  when both channels are live (or the file is mono, or silent). */
export function panForLevels(levels: number[] | null): string | null {
  if (!levels || levels.length !== 2) return null;
  const [l, r] = levels;
  if (l > LIVE_DB && r < DEAD_DB) return "pan=stereo|c0=c0|c1=c0";
  if (r > LIVE_DB && l < DEAD_DB) return "pan=stereo|c0=c1|c1=c1";
  return null;
}

export async function deadChannelPan(file: string): Promise<string | null> {
  return panForLevels(await channelLevels(file));
}

/** Rewrite a video's audio in place with the live channel on both sides
 *  (picture stream-copied). Returns true when it changed the file. */
export async function centerDeadChannel(file: string): Promise<boolean> {
  const pan = await deadChannelPan(file);
  if (!pan) return false;
  const tmp = file.replace(/(\.[^.]+)$/, ".centered$1");
  try {
    // The container decides the codec: a WebM take cannot carry AAC.
    const codec = /\.webm$/i.test(file) ? ["-c:a", "libopus", "-b:a", "128k"] : ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"];
    await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-map", "0:v?", "-map", "0:a:0", "-c:v", "copy",
      "-af", pan, ...codec, tmp], { maxBuffer: 16 * 1024 * 1024 });
    await fs.rename(tmp, file);
    return true;
  } catch (e: any) {
    await fs.unlink(tmp).catch(() => {});
    console.warn(`  channels: could not center ${file}: ${String(e?.stderr || e?.message || e).slice(-200)}`);
    return false;
  }
}

/** TAKES RECORDED BEFORE THE FIX. Studio plays the take file itself, so a
 *  one-sided take was still one-sided there: Marc's marketing lead heard
 *  the music and sound effects but not his voice (her audio came out of
 *  the right side only; the voice lived on the left). The asset route calls
 *  this before serving a take file: the first request centers it in place,
 *  every later one is a lookup. Concurrent first requests share one pass. */
const checked = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();
export async function ensureCenteredTake(file: string): Promise<void> {
  let st;
  try { st = await fs.stat(file); } catch { return; }
  if (checked.get(file) === st.mtimeMs) return;
  const running = inFlight.get(file);
  if (running) return running;
  const job = (async () => {
    try {
      if (await centerDeadChannel(file)) console.log(`  channels: centered a one-sided take (${file.split("/").pop()})`);
      const after = await fs.stat(file);
      checked.set(file, after.mtimeMs);
    } catch { /* serve it as it is */ }
  })().finally(() => inFlight.delete(file));
  inFlight.set(file, job);
  return job;
}

/** A take file or one of its copies (graded, blur, alpha) under a project's assets. */
export function isTakeAsset(subPath: string): boolean {
  return /^assets\/\.?take-[^/]+\.(mp4|mov|m4v|webm)$/i.test(subPath);
}
