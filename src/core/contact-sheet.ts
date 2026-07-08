/**
 * Contact Sheet Generator
 *
 * Captures multiple frames across a scene's timeline and composites
 * them into a single "contact sheet" image. Used by the motion-aware
 * critiquer to evaluate pacing, choreography, and animation quality
 * instead of judging from a single still frame.
 */

import { captureSingleFrame } from "./capture.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

export interface ContactSheetOpts {
  htmlPath: string;
  width: number;
  height: number;
  duration: number;
  /** Number of frames to capture (default: 6) */
  frameCount?: number;
  /** Explicit capture timestamps (seconds). Overrides the even spread AND
   *  frameCount -- used to sample beat midpoints on scenes with a beat
   *  timeline, so the critique sees each beat's content fully on screen. */
  timestamps?: number[];
  /** Output path for the contact sheet (PNG) */
  outputPath: string;
}

export interface ContactSheetResult {
  /** Path to the contact sheet image */
  contactSheetPath: string;
  /** Base64-encoded contact sheet */
  base64: string;
  /** Timestamps of captured frames */
  timestamps: number[];
}

/** Resolve the capture timestamps for a sheet: explicit beat samples
 *  (clamped + sorted) or an even 10%-95% spread. */
export function resolveContactTimestamps(duration: number, frameCount = 6, explicit?: number[]): number[] {
  if (explicit && explicit.length >= 2) {
    return explicit
      .map((t) => Math.round(Math.min(Math.max(t, 0.05), duration * 0.98) * 100) / 100)
      .sort((a, b) => a - b);
  }
  const timestamps: number[] = [];
  for (let i = 0; i < frameCount; i++) {
    const t = duration * (0.1 + (0.85 * i) / (frameCount - 1));
    timestamps.push(Math.round(t * 100) / 100);
  }
  return timestamps;
}

/** Stitch pre-captured frame PNGs into the contact-sheet grid. */
export async function stitchFramesToSheet(
  framePaths: string[], width: number, height: number, outputPath: string,
): Promise<{ base64: string }> {
  var frameCount = framePaths.length;
  var cols = Math.min(3, frameCount);
  var rows = Math.ceil(frameCount / cols);
  var thumbWidth = Math.floor(width / cols);
  var thumbHeight = Math.floor(height / rows);

  var inputs: string[] = [];
  var filterParts: string[] = [];
  for (var i = 0; i < framePaths.length; i++) {
    inputs.push("-i", framePaths[i]);
    filterParts.push(`[${i}]scale=${thumbWidth}:${thumbHeight}[s${i}]`);
  }
  var layoutParts: string[] = [];
  var xstackInputs: string[] = [];
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var idx = r * cols + c;
      if (idx < framePaths.length) {
        xstackInputs.push(`[s${idx}]`);
        layoutParts.push(`${c * thumbWidth}_${r * thumbHeight}`);
      }
    }
  }
  var filterStr = filterParts.join(";") + ";" +
    xstackInputs.join("") +
    `xstack=inputs=${xstackInputs.length}:layout=${layoutParts.join("|")}[out]`;

  await execFileAsync("ffmpeg", [
    "-y", ...inputs, "-filter_complex", filterStr, "-map", "[out]", outputPath,
  ], { timeout: 30000 });
  var data = await fs.readFile(outputPath);
  return { base64: data.toString("base64") };
}

/**
 * Capture multiple frames across a scene's timeline and stitch them
 * into a contact sheet grid for the critiquer.
 */
export async function generateContactSheet(opts: ContactSheetOpts): Promise<ContactSheetResult> {
  var tmpDir = path.join(os.tmpdir(), `contact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  var timestamps = resolveContactTimestamps(opts.duration, opts.frameCount || 6, opts.timestamps);

  // Capture each frame
  var framePaths: string[] = [];
  for (var i = 0; i < timestamps.length; i++) {
    var framePath = path.join(tmpDir, `frame_${i}.png`);
    await captureSingleFrame({
      htmlPath: opts.htmlPath,
      outputPath: framePath,
      width: opts.width,
      height: opts.height,
      atTime: timestamps[i],
    });
    framePaths.push(framePath);
  }

  // Stitch into the grid
  var { base64 } = await stitchFramesToSheet(framePaths, opts.width, opts.height, opts.outputPath);

  // Cleanup temp frames
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  return {
    contactSheetPath: opts.outputPath,
    base64,
    timestamps,
  };
}
