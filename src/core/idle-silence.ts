/**
 * Mode A (SPEC-recorder.md): the demo was narrated LIVE, so compression must
 * never touch a moment where the narrator is speaking. The cut list is the
 * intersection of two ground truths -- the sidecar's idle spans (no input, no
 * DOM mutations) and the audio's silent spans (ffmpeg silencedetect) -- and
 * it is applied as HARD CUTS to both streams, keeping A/V sync by
 * construction. (Timelapse would chipmunk or desync the embedded voice;
 * jump-cutting the dead air is the honest v1.)
 */

import { spawn } from "node:child_process";

export interface Range {
  from: number;
  to: number;
}

/** Overlap of two range sets (both assumed sorted, non-overlapping). */
export function intersectRanges(a: Range[], b: Range[]): Range[] {
  const out: Range[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const from = Math.max(a[i].from, b[j].from);
    const to = Math.min(a[i].to, b[j].to);
    if (to > from) out.push({ from, to });
    if (a[i].to < b[j].to) i++;
    else j++;
  }
  return out;
}

/** The gaps a range set leaves over [0, total]. */
export function complementRanges(ranges: Range[], total: number): Range[] {
  const out: Range[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.from > cursor) out.push({ from: cursor, to: r.from });
    cursor = Math.max(cursor, r.to);
  }
  if (total > cursor) out.push({ from: cursor, to: total });
  return out;
}

/** Pull each range's edges inward (breathing room around a cut) and drop
 *  what ends up shorter than minLen. */
export function shrinkRanges(ranges: Range[], margin: number, minLen: number): Range[] {
  return ranges
    .map((r) => ({ from: r.from + margin, to: r.to - margin }))
    .filter((r) => r.to - r.from >= minLen);
}

/** Silent spans in an audio/video file via ffmpeg silencedetect. Returns []
 *  on any failure -- Mode A then simply cuts nothing (safe: a long film, not
 *  a broken one). */
export async function detectSilence(
  mediaPath: string,
  opts: { noiseDb?: number; minSeconds?: number } = {},
): Promise<Range[]> {
  const noise = opts.noiseDb ?? -35;
  const minS = opts.minSeconds ?? 1.2;
  const stderr = await new Promise<string>((resolve) => {
    const ff = spawn("ffmpeg", [
      "-i", mediaPath,
      "-af", `silencedetect=noise=${noise}dB:d=${minS}`,
      "-f", "null", "-",
    ]);
    const chunks: Buffer[] = [];
    ff.stderr.on("data", (c) => chunks.push(c));
    ff.on("error", () => resolve(""));
    ff.on("close", () => resolve(Buffer.concat(chunks).toString()));
  });
  const out: Range[] = [];
  let start: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    if (s) { start = parseFloat(s[1]); continue; }
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && start !== null) {
      out.push({ from: start, to: parseFloat(e[1]) });
      start = null;
    }
  }
  // A silence still open at EOF (trailing dead air) has no silence_end line.
  if (start !== null) out.push({ from: start, to: Number.POSITIVE_INFINITY });
  return out;
}

/** Concatenate the KEPT spans of a media file's audio into a standalone AAC
 *  narration file (the Mode A narration track). Throws on ffmpeg failure. */
export async function cutAudioTo(
  mediaPath: string,
  keptSpans: Range[],
  outPath: string,
): Promise<void> {
  if (!keptSpans.length) throw new Error("no audio spans to keep");
  const parts = keptSpans
    .map((r, i) => `[0:a]atrim=start=${r.from.toFixed(3)}:end=${r.to.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`)
    .join(";");
  const concat = keptSpans.map((_, i) => `[a${i}]`).join("") + `concat=n=${keptSpans.length}:v=0:a=1[out]`;
  await new Promise<void>((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y", "-i", mediaPath,
      "-filter_complex", `${parts};${concat}`,
      "-map", "[out]", "-c:a", "aac", "-b:a", "160k",
      outPath,
    ]);
    const errs: Buffer[] = [];
    ff.stderr.on("data", (c) => errs.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`audio cut failed: ${Buffer.concat(errs).toString().split("\n").slice(-4).join(" ")}`));
    });
  });
}
