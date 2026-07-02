/**
 * Dead-beat gate — deterministic Layer-0 check for the beat timeline.
 *
 * A beat is "one thought": the storyboard promises that something VISIBLY
 * happens during it. The codegen's most common failure on long continuous
 * takes is front-loading all the motion and letting later beats sit static —
 * which reads as a stalled frame, exactly the slideshow feel beats exist to
 * kill. This gate MEASURES it: capture one frame at each beat's midpoint,
 * downscale, and compare consecutive beats. Two adjacent beats whose midpoint
 * frames are nearly pixel-identical mean the later beat produced no visible
 * change — a blocking `dead_beat` defect naming the exact beat, which feeds
 * the regen prompt.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { captureSingleFrame } from "./capture.js";
import { beatTimeline, beatMidpoints } from "./beats.js";
import type { SceneBeat } from "./types.js";

const execFileAsync = promisify(execFile);

export interface BeatDefect {
  type: "dead_beat";
  detail: string;
}

/** A pixel counts as CHANGED when its worst channel differs by more than this
 *  (0..255). Ambient drift (breathing gradients, slow camera) shifts pixels by
 *  1-5; real content arriving/moving shifts its pixels by 50-150+. */
const CHANGED_PIXEL_DIFF = 32;
/** A beat is ALIVE when at least this fraction of the frame changed strongly.
 *  A small-but-real element (a 220x80 badge on 1080p is ~0.9% of the frame)
 *  clears it; ambient drift's strong-change fraction is ~0. */
const ALIVE_FRACTION = 0.0015;
/** Comparison resolution: fine enough that a caption-sized element still
 *  covers dozens of pixels, coarse enough to ignore sub-pixel jitter. */
const CMP_W = 160, CMP_H = 90;

async function frameRgb(imagePath: string): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-i", imagePath, "-vf", `scale=${CMP_W}:${CMP_H}:flags=area`,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      { encoding: "buffer", maxBuffer: 1 << 20 },
    );
    const buf = stdout as unknown as Buffer;
    return buf.length >= CMP_W * CMP_H * 3 ? buf : null;
  } catch {
    return null;
  }
}

/** Fraction of pixels whose worst channel changed by > CHANGED_PIXEL_DIFF. */
function changedFraction(a: Buffer, b: Buffer): number {
  const n = Math.floor(Math.min(a.length, b.length) / 3);
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.max(
      Math.abs(a[i * 3] - b[i * 3]),
      Math.abs(a[i * 3 + 1] - b[i * 3 + 1]),
      Math.abs(a[i * 3 + 2] - b[i * 3 + 2]),
    );
    if (d > CHANGED_PIXEL_DIFF) changed++;
  }
  return n > 0 ? changed / n : 0;
}

/**
 * Measure visual activity across the scene's beats. Returns one defect per
 * dead beat (capped at 2 -- past that the regen message is "the scene is
 * static", not a per-beat list).
 */
export async function measureBeatActivity(opts: {
  htmlPath: string;
  width: number;
  height: number;
  beats: SceneBeat[];
}): Promise<BeatDefect[]> {
  if (opts.beats.length < 2) return [];
  const timed = beatTimeline(opts.beats);
  const mids = beatMidpoints(opts.beats);

  const tmpDir = path.join(os.tmpdir(), `beatgate_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`);
  await fs.mkdir(tmpDir, { recursive: true }).catch(() => {});
  try {
    const frames: (Buffer | null)[] = [];
    for (let i = 0; i < mids.length; i++) {
      const framePath = path.join(tmpDir, `beat_${i}.png`);
      try {
        await captureSingleFrame({
          htmlPath: opts.htmlPath, outputPath: framePath,
          width: opts.width, height: opts.height, atTime: mids[i],
        });
        frames.push(await frameRgb(framePath));
      } catch {
        frames.push(null);
      }
    }

    const defects: BeatDefect[] = [];
    for (let i = 1; i < frames.length && defects.length < 2; i++) {
      const prev = frames[i - 1], cur = frames[i];
      if (!prev || !cur) continue; // can't measure -> don't risk a false positive
      const frac = changedFraction(prev, cur);
      if (frac < ALIVE_FRACTION) {
        const b = timed[i];
        defects.push({
          type: "dead_beat",
          detail: `BEAT ${i + 1} "${b.label}" (${b.start_seconds.toFixed(1)}s-${b.end_seconds.toFixed(1)}s) produced no visible change -- ` +
            `only ${(frac * 100).toFixed(2)}% of the frame changed vs the previous beat's midpoint (needs >= ${(ALIVE_FRACTION * 100).toFixed(2)}%). ` +
            `The beat sheet says this beat should: "${b.action.slice(0, 160)}". Make that visibly HAPPEN on the master timeline during this beat's window.`,
        });
      }
    }
    return defects;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
