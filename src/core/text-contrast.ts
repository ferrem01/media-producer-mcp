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
  contrast: number;   // measured ratio, e.g. 1.3 (0 for no-backing/clipped)
  threshold: number;  // ratio it needed to pass, e.g. 4.5
  /** Why it failed: low measured contrast, (for text over video) no legibility
   *  treatment behind it, or the text run is truncated by the canvas edge /
   *  an overflow-hidden container. */
  reason: "low-contrast" | "no-backing" | "clipped";
  /** For reason "clipped": fraction (0-1) of the text area that is cut off. */
  clippedFraction?: number;
  /** Mean relative luminance (0-1) of the backdrop actually sampled behind the
   *  text. A repair needs this to pick an ink: dark backdrop -> light text,
   *  light backdrop -> dark text. Only set for reason "low-contrast". */
  backdropLuminance?: number;
}

/** Text cut off by more than this fraction of its area is a defect. Small
 *  values are rounding/bleed; half-missing headlines and "xt" labels are not. */
const CLIP_FRACTION = 0.08;

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
  /** Times (seconds) to probe. Captions animate in/out, so a single probe can
   *  miss text that isn't at full opacity at that instant -- probe several. */
  atTimes: number[];
}): Promise<ContrastDefect[]> {
  const tmpDir = path.join(os.tmpdir(), `contrast_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`);
  await fs.mkdir(tmpDir, { recursive: true });

  // A caption only needs to be illegible at ONE moment it's on-screen to be a
  // defect, so probe multiple times and keep the worst (lowest-contrast) finding
  // per text run. The probe itself only collects fully-visible text (opacity
  // >= 0.85), so a caption mid-fade at one time is simply caught at another.
  const byText = new Map<string, ContrastDefect>();
  try {
    for (let i = 0; i < opts.atTimes.length; i++) {
      const backdropPath = path.join(tmpDir, `backdrop_${i}.png`);
      let textElements;
      let cameraActive: boolean | undefined;
      try {
        ({ textElements, cameraActive } = await captureSingleFrame({
          htmlPath: opts.htmlPath,
          outputPath: backdropPath,
          width: opts.width,
          height: opts.height,
          atTime: opts.atTimes[i],
          contrastProbe: true,
        }));
      } catch {
        continue; // a single bad probe shouldn't sink the whole gate
      }
      if (!textElements || textElements.length === 0) continue;

      for (const t of textElements) {
        const tc = parseRgb(t.color);
        if (!tc) continue;
        const threshold = t.fontSize >= 24 ? 3.0 : 4.5; // large vs body text

        // Truncated text: cut off by the canvas edge or an overflow-hidden
        // container ("xt", half a headline). Deterministic -- previously this
        // was left to the vision critic, which reads crops as art direction.
        // Only fully-opaque text counts (dim oversized backdrop words are a
        // deliberate design device), and only PARTIAL clips: text that is
        // essentially fully hidden (>= 98%, e.g. off-stage carousel items in an
        // overflow-hidden container) is not a visible artifact.
        // Mid-zoom/pan the camera transform is what carries text past the
        // frame edge -- that is the shot, not truncation. Contrast ratios are
        // scale-invariant and still measured; only the clip check skips.
        const clipped = cameraActive ? 0 : (t.clippedFraction ?? 0);
        if (clipped >= CLIP_FRACTION && clipped < 0.98 && (t.opacity ?? 1) >= 0.85) {
          const prev = byText.get(t.text);
          if (!prev || (prev.reason === "clipped" && clipped > (prev.clippedFraction ?? 0))) {
            byText.set(t.text, {
              text: t.text, fontSize: Math.round(t.fontSize),
              contrast: 0, threshold, reason: "clipped",
              clippedFraction: clipped,
            });
          }
          continue;
        }

        // Text-over-video without a backing: the footage moves, so static-frame
        // contrast can't guarantee legibility on every frame -- require the
        // protection treatment (scrim/panel) regardless of how this frame samples.
        if (t.overVideo && !t.hasBacking && !byText.has(t.text)) {
          byText.set(t.text, {
            text: t.text, fontSize: Math.round(t.fontSize),
            contrast: 0, threshold, reason: "no-backing",
          });
          continue;
        }

        // Grid-sample the backdrop behind the text and measure WORST-CASE local
        // contrast, not the average. Over busy footage the average hides washout;
        // a caption is illegible if a meaningful fraction of its run is low-contrast.
        const cells = await sampleRegionGrid(backdropPath, t.x, t.y, t.w, t.h, 12, 3);
        if (!cells || cells.length === 0) continue;
        // Dim text (opacity 0.5-0.85) renders alpha-composited over the
        // backdrop, so measure the contrast of the COMPOSITED color per cell --
        // a white caption at opacity 0.6 over a mid-gray bloom is exactly the
        // low-contrast case that skipping dim text used to hide.
        const op = Math.min(1, Math.max(0, t.opacity ?? 1));
        let worst = Infinity;
        let below = 0;
        for (const cell of cells) {
          const er = tc.r * op + cell.r * (1 - op);
          const eg = tc.g * op + cell.g * (1 - op);
          const eb = tc.b * op + cell.b * (1 - op);
          const ratio = contrastRatio(relLuminance(er, eg, eb), relLuminance(cell.r, cell.g, cell.b));
          if (ratio < worst) worst = ratio;
          if (ratio < threshold) below++;
        }
        const washFraction = below / cells.length;
        if (washFraction >= WASH_FRACTION) {
          const defect: ContrastDefect = {
            text: t.text, fontSize: Math.round(t.fontSize),
            contrast: Math.round(worst * 100) / 100, threshold, reason: "low-contrast",
            backdropLuminance:
              Math.round(
                (cells.reduce((a, c) => a + relLuminance(c.r, c.g, c.b), 0) / cells.length) * 1000,
              ) / 1000,
          };
          const prev = byText.get(t.text);
          if (!prev || prev.reason === "low-contrast" && defect.contrast < prev.contrast) byText.set(t.text, defect);
        }
      }
    }
    return [...byText.values()];
  } catch {
    return [...byText.values()];
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
