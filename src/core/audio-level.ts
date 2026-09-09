/**
 * Does this media actually carry a VOICE?
 *
 * The narration guard upstream only ever asked "is it longer than half a
 * second", which a 54-second file of digital zeros answers with a confident
 * yes. Measured live: a recorder take whose mic was being null-processed by
 * Chrome's echo canceller produced a valid 48kHz mono Opus track, correct
 * duration, EVERY SAMPLE 0.0 -- and the pipeline built and shipped a mute
 * film without a word of warning. The operator found out by watching it.
 *
 * Silence is cheap to detect and catastrophic to miss, so we measure.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveVideoPath } from "./video-path.js";

const execFileAsync = promisify(execFile);

export interface AudioLevel {
  /** False when the container carries no audio stream at all. */
  hasAudio: boolean;
  /** Mean volume in dBFS (-91 is digital silence; speech sits near -25). */
  meanDb: number;
  /** Peak volume in dBFS (speech peaks above -30; zeros give -91). */
  maxDb: number;
  /** Digital silence, or so close to it that nothing is recoverable. */
  silent: boolean;
  /** Real signal, but low enough that the take is probably a mistake. */
  faint: boolean;
}

/**
 * A voice recording peaks well above -30dBFS and averages around -25. These
 * floors sit far below any usable take and far above the -73dB/-91dB that
 * measured on two real dead-mic takes, so a genuinely quiet-but-usable
 * narration is not swept up.
 */
const SILENT_MEAN_DB = -70;
const SILENT_MAX_DB = -45;
const FAINT_MEAN_DB = -55;

/** Measure a file's audio level with ffmpeg's volumedetect. Never throws:
 *  an unreadable file reports hasAudio:false and the caller decides. */
export async function probeAudioLevel(src: string, dataDir?: string): Promise<AudioLevel> {
  const dead: AudioLevel = { hasAudio: false, meanDb: -Infinity, maxDb: -Infinity, silent: true, faint: false };
  const filePath = resolveVideoPath(src, dataDir);
  let stderr = "";
  try {
    // volumedetect writes its summary to stderr and needs a null sink.
    const r = await execFileAsync("ffmpeg", ["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"], {
      maxBuffer: 8 * 1024 * 1024,
    }).catch((e: any) => e);
    stderr = String(r?.stderr || "");
  } catch {
    return dead;
  }
  if (!stderr) return dead;
  // No audio stream at all -> nothing to measure (a screen capture, say).
  if (!/Stream #\d+:\d+.*: Audio:/.test(stderr)) return dead;
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  const max = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  if (!mean || !max) return { ...dead, hasAudio: true };
  const meanDb = parseFloat(mean[1]);
  const maxDb = parseFloat(max[1]);
  return {
    hasAudio: true,
    meanDb,
    maxDb,
    silent: meanDb <= SILENT_MEAN_DB || maxDb <= SILENT_MAX_DB,
    faint: meanDb > SILENT_MEAN_DB && meanDb <= FAINT_MEAN_DB,
  };
}

/** One line an operator can act on, naming the numbers that decided it. */
export function describeLevel(l: AudioLevel): string {
  if (!l.hasAudio) return "no audio stream at all";
  if (!isFinite(l.meanDb)) return "unreadable audio";
  return `mean ${l.meanDb.toFixed(1)}dB, peak ${l.maxDb.toFixed(1)}dB`;
}
