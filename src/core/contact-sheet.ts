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

/**
 * Capture multiple frames across a scene's timeline and stitch them
 * into a contact sheet grid for the critiquer.
 */
export async function generateContactSheet(opts: ContactSheetOpts): Promise<ContactSheetResult> {
  var frameCount = opts.frameCount || 6;
  var tmpDir = path.join(os.tmpdir(), `contact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  var timestamps: number[] = [];
  if (opts.timestamps && opts.timestamps.length >= 2) {
    // Explicit sampling (beat midpoints): clamp into the scene and sort.
    timestamps = opts.timestamps
      .map((t) => Math.round(Math.min(Math.max(t, 0.05), opts.duration * 0.98) * 100) / 100)
      .sort((a, b) => a - b);
    frameCount = timestamps.length;
  } else {
    // Calculate frame timestamps: evenly distributed, avoid 0s (empty) and very end
    for (var i = 0; i < frameCount; i++) {
      // Spread from 10% to 95% of duration
      var t = opts.duration * (0.1 + (0.85 * i / (frameCount - 1)));
      timestamps.push(Math.round(t * 100) / 100);
    }
  }

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

  // Use ffmpeg to create a contact sheet grid
  // For 6 frames: 3 columns x 2 rows
  // For 9 frames: 3 columns x 3 rows
  var cols = Math.min(3, frameCount);
  var rows = Math.ceil(frameCount / cols);

  // Scale each frame down to fit the grid
  var thumbWidth = Math.floor(opts.width / cols);
  var thumbHeight = Math.floor(opts.height / rows);

  // Build ffmpeg filter for contact sheet
  var inputs: string[] = [];
  var filterParts: string[] = [];

  for (var i = 0; i < framePaths.length; i++) {
    inputs.push("-i", framePaths[i]);
    filterParts.push(`[${i}]scale=${thumbWidth}:${thumbHeight}[s${i}]`);
  }

  // Pad to fill grid if needed
  var totalSlots = cols * rows;
  var padCount = totalSlots - framePaths.length;

  // Build xstack layout
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

  // Add timestamp labels using drawtext
  // (skipped for simplicity -- the critiquer gets timestamps in text)

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filterStr,
    "-map", "[out]",
    opts.outputPath,
  ], { timeout: 30000 });

  // Read the result
  var contactSheetData = await fs.readFile(opts.outputPath);
  var base64 = contactSheetData.toString("base64");

  // Cleanup temp frames
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  return {
    contactSheetPath: opts.outputPath,
    base64,
    timestamps,
  };
}
