import { spawn } from "node:child_process";
import type { MediaSegment } from "./types.js";

/**
 * "Compress the waiting": find stretches of a screen recording where nothing
 * meaningful happens (AI spinners, loading, reading) and build a source-map
 * that timelapses them. Deterministic, no LLM -- the 15-minutes-to-3 first
 * pass in one click.
 *
 * Detection is a motion profile, not ffmpeg freezedetect: freezedetect's
 * single dB threshold is a cliff on real screencasts (at -40dB a blinking
 * cursor defeats it; at -30dB an entire active demo reads as "frozen").
 * Instead we decode tiny grayscale frames, score per-frame motion as mean
 * absolute pixel difference, and classify seconds against an adaptive
 * threshold derived from the clip's own motion distribution -- real activity
 * (typing, scrolling, streaming text) scores 10-50x higher than a spinner.
 */

export interface IdleRange {
  start: number;
  end: number;
}

const W = 64;
const H = 36;
const FPS = 4;
const FRAME_BYTES = W * H;

/** Decode downscaled gray frames and return one motion score per frame gap. */
async function motionScores(
  videoPath: string,
  range?: { start: number; end: number },
): Promise<{ scores: number[]; duration: number }> {
  const args = [
    ...(range ? ["-ss", String(range.start), "-to", String(range.end)] : []),
    "-i", videoPath,
    "-vf", `scale=${W}:${H},format=gray`,
    "-r", String(FPS),
    "-f", "rawvideo",
    "-loglevel", "error",
    "-",
  ];
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let buf: Buffer = Buffer.alloc(0);
    let prev: Buffer | null = null;
    let frames = 0;
    const scores: number[] = [];
    ff.stdout.on("data", (c: Buffer) => {
      buf = Buffer.concat([buf, c]);
      while (buf.length >= FRAME_BYTES) {
        const frame = buf.subarray(0, FRAME_BYTES);
        buf = buf.subarray(FRAME_BYTES);
        if (prev) {
          let sum = 0;
          for (let p = 0; p < FRAME_BYTES; p++) sum += Math.abs(frame[p] - prev[p]);
          scores.push(sum / FRAME_BYTES);
        }
        prev = Buffer.from(frame);
        frames++;
      }
    });
    const errs: Buffer[] = [];
    ff.stderr.on("data", (c) => errs.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve({ scores, duration: frames / FPS });
      else reject(new Error(`ffmpeg motion decode failed (${code}): ${Buffer.concat(errs).toString().slice(-300)}`));
    });
  });
}

export async function detectIdleRanges(
  videoPath: string,
  minIdleSeconds = 2,
  _noiseDb = -40, // kept for API compatibility; superseded by the motion profile
  range?: { start: number; end: number },
): Promise<{ ranges: IdleRange[]; duration: number }> {
  const { scores, duration } = await motionScores(videoPath, range);
  const offset = range ? range.start : 0;
  const total = range ? range.end : duration;
  if (!scores.length) return { ranges: [], duration: total };

  // Adaptive idle threshold: a fraction of the clip's own busy level, with a
  // floor so a fully-static recording still reads idle and a ceiling so a
  // low-energy clip doesn't classify real activity away.
  const sorted = scores.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))];
  const threshold = Math.min(2.5, Math.max(0.7, p95 * 0.15));

  // A second is idle only if NOTHING moved in it (max of its samples): one
  // real flick -- a click, a keystroke -- marks the whole second active.
  const secCount = Math.ceil(scores.length / FPS);
  const ranges: IdleRange[] = [];
  let runStart: number | null = null;
  for (let s = 0; s <= secCount; s++) {
    let idle = false;
    if (s < secCount) {
      const chunk = scores.slice(s * FPS, (s + 1) * FPS);
      idle = chunk.length > 0 && Math.max(...chunk) < threshold;
    }
    if (idle && runStart === null) runStart = s;
    else if (!idle && runStart !== null) {
      if (s - runStart >= minIdleSeconds) {
        ranges.push({ start: runStart + offset, end: Math.min(s + offset, total) });
      }
      runStart = null;
    }
  }
  return { ranges, duration: total };
}

/** Idle ranges -> a full source-map: active stretches at 1x, idle at
 *  idleRate. Tiny active slivers (<0.4s) merge into the neighboring idle. */
export function buildCompressedSegments(
  duration: number,
  ranges: IdleRange[],
  idleRate = 8,
  startAt = 0,
): MediaSegment[] {
  const segs: MediaSegment[] = [];
  let cursor = startAt;
  const push = (a: number, b: number, rate: number) => {
    if (b - a < 0.05) return;
    const prev = segs[segs.length - 1];
    if (prev && prev.rate === rate && Math.abs(prev.src_end - a) < 0.001) prev.src_end = b;
    else segs.push({ src_start: Math.round(a * 10) / 10, src_end: Math.round(b * 10) / 10, rate });
  };
  for (const r of ranges) {
    if (r.start - cursor >= 0.4) push(cursor, r.start, 1);
    else if (r.start > cursor && segs.length) segs[segs.length - 1].src_end = Math.round(r.start * 10) / 10;
    push(Math.max(cursor, r.start), r.end, idleRate);
    cursor = Math.max(cursor, r.end);
  }
  if (duration - cursor >= 0.05) push(cursor, duration, 1);
  return segs;
}
