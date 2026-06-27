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

/**
 * Sample a rectangular region of an image as a grid of cell-average colors, via
 * ffmpeg crop -> scale to cols x rows (area averaging). Returns one {r,g,b} per
 * cell. A grid (rather than a single 1x1 average) lets the caller measure
 * WORST-CASE local contrast: a caption can average "fine" while big chunks of it
 * are washed out over busy footage (bright windows + mid table + dark chairs).
 */
async function sampleRegionGrid(
  imagePath: string, x: number, y: number, w: number, h: number, cols: number, rows: number,
): Promise<Array<{ r: number; g: number; b: number }> | null> {
  if (w < 1 || h < 1) return null;
  const c = Math.max(1, Math.min(cols, Math.floor(w)));
  const r = Math.max(1, Math.min(rows, Math.floor(h)));
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-i", imagePath, "-vf",
        `crop=${w}:${h}:${x}:${y},scale=${c}:${r}:flags=area`,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      { encoding: "buffer", maxBuffer: 1 << 20 },
    );
    const buf = stdout as unknown as Buffer;
    if (buf.length < c * r * 3) return null;
    const cells: Array<{ r: number; g: number; b: number }> = [];
    for (let i = 0; i < c * r; i++) {
      cells.push({ r: buf[i * 3], g: buf[i * 3 + 1], b: buf[i * 3 + 2] });
    }
    return cells;
  } catch {
    return null;
  }
}

/** Fraction of the text box that must be below contrast for the text to count
 *  as illegible. Tolerates a stray dark/bright patch (e.g. behind a space) while
 *  catching text that's washed across a meaningful portion of its run. */
const WASH_FRACTION = 0.3;

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
      // Grid-sample the backdrop behind the text and measure WORST-CASE local
      // contrast, not the average. Over busy footage the average hides washout;
      // a caption is illegible if a meaningful fraction of its run is low-contrast.
      const cells = await sampleRegionGrid(backdropPath, t.x, t.y, t.w, t.h, 12, 3);
      if (!cells || cells.length === 0) continue;
      const tl = relLuminance(tc.r, tc.g, tc.b);
      const threshold = t.fontSize >= 24 ? 3.0 : 4.5; // large vs body text
      let worst = Infinity;
      let below = 0;
      for (const cell of cells) {
        const ratio = contrastRatio(tl, relLuminance(cell.r, cell.g, cell.b));
        if (ratio < worst) worst = ratio;
        if (ratio < threshold) below++;
      }
      const washFraction = below / cells.length;
      if (washFraction >= WASH_FRACTION) {
        defects.push({ text: t.text, fontSize: Math.round(t.fontSize), contrast: Math.round(worst * 100) / 100, threshold });
      }
    }
    return defects;
  } catch {
    return [];
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
