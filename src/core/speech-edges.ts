import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Where speech starts and stops in a recording, from its loudness in 10 ms
 * frames. Whisper's word times drift at the two ends of a take even with
 * DTW alignment: on Marc's lead-scoring takes (Oct 12) the last word ran to
 * the end of the file, 0.15-0.63 s past where his voice had decayed, and
 * one first word sat 0.31 s after a sharp onset. Captions popped late and
 * de-air trims kept a sliver of dead air. snapToSpeechEdges
 * (transcribe.ts) moves the first and last word onto these edges.
 */

export interface SpeechEdges {
  /** Seconds where the first stretch of speech begins. */
  onset: number;
  /** Seconds where the last stretch of speech ends. */
  offset: number;
}

const FRAMES_PER_SECOND = 100;
/** Loud enough to be speech: 15 dB over the room, and within 30 dB of the
 *  loudest frame (a breath or a lip smack sits further down). */
const OVER_FLOOR_DB = 15;
const UNDER_PEAK_DB = 30;
/** A run this long (frames) counts as speech; a click does not. */
const MIN_RUN_FRAMES = 5;
/** Quieter than this at its loudest, the file has no speech to measure. */
const SILENT_PEAK_DB = -50;

/** The edges from per-frame levels (dBFS). Null when nothing is loud
 *  enough to call speech. */
export function edgesFromLevels(levels: number[], fps = FRAMES_PER_SECOND): SpeechEdges | null {
  if (!levels.length) return null;
  const sorted = [...levels].sort((a, b) => a - b);
  // The room: the quietest 5% of frames (a take is mostly voice; its
  // quietest stretches are the lead-in, the tail and the pauses).
  const floor = sorted[Math.floor(sorted.length * 0.05)];
  const peak = sorted[sorted.length - 1];
  if (peak < SILENT_PEAK_DB) return null;
  const threshold = Math.max(floor + OVER_FLOOR_DB, peak - UNDER_PEAK_DB);
  let first = -1, last = -1, runStart = -1;
  for (let i = 0; i <= levels.length; i++) {
    const loud = i < levels.length && levels[i] > threshold;
    if (loud && runStart < 0) runStart = i;
    if (!loud && runStart >= 0) {
      if (i - runStart >= MIN_RUN_FRAMES) { if (first < 0) first = runStart; last = i; }
      runStart = -1;
    }
  }
  if (first < 0) return null;
  return { onset: first / fps, offset: last / fps };
}

/** Per-frame levels (dBFS) of a file's audio: 16 kHz mono, 10 ms frames. */
export async function speechLevels(mediaPath: string): Promise<number[]> {
  const rate = 16000;
  const raw: Buffer = await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-loglevel", "error", "-i", mediaPath, "-map", "0:a:0", "-ac", "1", "-ar", String(rate), "-c:a", "pcm_s16le", "-f", "s16le", "-"]);
    const chunks: Buffer[] = [];
    const errs: Buffer[] = [];
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.stderr.on("data", (c) => errs.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => code === 0 ? resolve(Buffer.concat(chunks))
      : reject(new Error(`ffmpeg level decode failed (${code}): ${Buffer.concat(errs).toString().slice(0, 300)}`)));
  });
  const per = rate / FRAMES_PER_SECOND;
  const n = Math.floor(raw.length / 2);
  const levels: number[] = [];
  for (let f = 0; f * per < n; f++) {
    let sum = 0;
    const end = Math.min(n, (f + 1) * per);
    for (let i = f * per; i < end; i++) { const v = raw.readInt16LE(i * 2) / 32768; sum += v * v; }
    levels.push(Math.round(10 * Math.log10(sum / (end - f * per) + 1e-10) * 10) / 10);
  }
  return levels;
}

/** The file's speech edges, kept beside its transcript and keyed to its
 *  size and mtime. */
export async function getSpeechEdges(mediaPath: string, cacheDir: string): Promise<SpeechEdges | null> {
  const st = await fs.stat(mediaPath);
  const key = `${st.size}:${Math.round(st.mtimeMs)}`;
  const memo = path.join(cacheDir, "speech-edges.json");
  try {
    const m = JSON.parse(await fs.readFile(memo, "utf8"));
    if (m && m.key === key) return m.edges ?? null;
  } catch { /* none yet */ }
  const edges = edgesFromLevels(await speechLevels(mediaPath));
  try { await fs.mkdir(cacheDir, { recursive: true }); await fs.writeFile(memo, JSON.stringify({ key, edges })); } catch { /* best effort */ }
  return edges;
}
