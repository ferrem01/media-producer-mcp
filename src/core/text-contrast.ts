/**
 * Text legibility gate.
 *
 * Measures the REAL contrast ratio of each significant text element against the
 * actual pixels rendered behind it (footage, scrim, gradient -- whatever). This
 * makes the critique's "is the text readable?" check deterministic instead of
 * relying on a vision model to perceive subtle low-contrast text (dark-on-dark
 * captions over b-roll, light-on-light headlines, faded copy, etc.).
 *
 * How: capture the scene with the text glyphs hidden (the backdrop), then for
 * each text element sample the average backdrop color in its box and compute the
 * WCAG contrast ratio against the text's own color. General -- any scene, any
 * background.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { captureSingleFrame } from "./capture.js";

const execFileAsync = promisify(execFile);

export interface ContrastDefect {
  text: string;
  fontSize: number;
  contrast: number;   // measured ratio, e.g. 1.3
  threshold: number;  // ratio it needed to pass, e.g. 4.5
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
function parseRgb(s: string): { r: number; g: number; b: number } | null {
  const m = s.match(/-?\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  return { r: +m[0], g: +m[1], b: +m[2] };
}

/** Average RGB of a rectangular region of an image, via ffmpeg crop -> 1x1. */
async function avgRegionColor(
  imagePath: string, x: number, y: number, w: number, h: number,
): Promise<{ r: number; g: number; b: number } | null> {
  if (w < 1 || h < 1) return null;
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-i", imagePath, "-vf",
        `crop=${w}:${h}:${x}:${y},scale=1:1:flags=area`,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      { encoding: "buffer", maxBuffer: 1 << 20 },
    );
    const buf = stdout as unknown as Buffer;
    if (buf.length < 3) return null;
    return { r: buf[0], g: buf[1], b: buf[2] };
  } catch {
    return null;
  }
}

/**
 * Return a list of text elements whose contrast against their rendered backdrop
 * is below the WCAG-style threshold (3:1 for large text, 4.5:1 otherwise).
 * Empty list = all text is legible (or no significant text / probe failed).
 */
export async function measureTextContrast(opts: {
  htmlPath: string;
  width: number;
  height: number;
  atTime: number;
}): Promise<ContrastDefect[]> {
  const tmpDir = path.join(os.tmpdir(), `contrast_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const backdropPath = path.join(tmpDir, "backdrop.png");

  try {
    const { textElements } = await captureSingleFrame({
      htmlPath: opts.htmlPath,
      outputPath: backdropPath,
      width: opts.width,
      height: opts.height,
      atTime: opts.atTime,
      contrastProbe: true,
    });
    if (!textElements || textElements.length === 0) return [];

    const defects: ContrastDefect[] = [];
    for (const t of textElements) {
      const tc = parseRgb(t.color);
      if (!tc) continue;
      const bg = await avgRegionColor(backdropPath, t.x, t.y, t.w, t.h);
      if (!bg) continue;
      const ratio = contrastRatio(relLuminance(tc.r, tc.g, tc.b), relLuminance(bg.r, bg.g, bg.b));
      const threshold = t.fontSize >= 24 ? 3.0 : 4.5; // large vs body text
      if (ratio < threshold) {
        defects.push({ text: t.text, fontSize: Math.round(t.fontSize), contrast: Math.round(ratio * 100) / 100, threshold });
      }
    }
    return defects;
  } catch {
    return [];
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
