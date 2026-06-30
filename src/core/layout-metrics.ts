/**
 * Layout/composition gate.
 *
 * The codegen prompt tells the model to keep panels distinct from the background
 * and to fill the frame, but those are QUANTITATIVE constraints ("shift lightness
 * >= 8%", "no empty band > 25%") that the model nods at and under-executes. This
 * gate MEASURES them from the rendered scene's geometry + computed styles and
 * emits a blocking defect with a specific corrective number when a threshold is
 * violated -- the same deterministic approach as the text-contrast gate, but for
 * surface separation and content coverage instead of text legibility.
 *
 * Two checks:
 *   - invisible_surface: a panel/card/window whose fill is within a few % lightness
 *     of the page background AND has no visible border or shadow -> a ghost panel.
 *   - dead_frame: content occupies very little of the canvas, or a tall band is
 *     empty, AND no rich full-bleed background fills that space -> a dead/empty frame.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { captureSingleFrame, type LayoutProbeResult, type SurfaceMetric } from "./capture.js";

const execFileAsync = promisify(execFile);

export interface LayoutDefect {
  type: "invisible_surface" | "dead_frame";
  detail: string;
}

// ── Tunables ────────────────────────────────────────────────────────────────
/** Min lightness separation (%) a panel fill needs from the page background to
 *  read as a distinct surface on its own (without relying on border/shadow). */
const MIN_SURFACE_LIGHTNESS_DELTA = 8;
/** A border this thick (px) with a distinct color counts as a visible edge. */
const MIN_VISIBLE_BORDER = 1.5;
/** Below this fraction of the canvas covered by content, the frame reads as empty. */
const MIN_CONTENT_COVERAGE = 0.16;
/** Worst-channel RGB std-dev (0..255) in the top/bottom strips below which the
 *  backdrop reads as FLAT -- a near-uniform field, not a rich gradient/photo.
 *  Measured per-COLOR-channel (a vibrant blue->magenta gradient varies hugely in
 *  R/B while staying flat in luminance, so luminance alone misses it). A flat
 *  dark/white field scores ~2-3; a vibrant brand gradient scores 20-30+. */
const FLAT_COLOR_SPREAD = 8;
/** Occupancy grid resolution. */
const COLS = 32, ROWS = 18;

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function parseRgba(s: string): { r: number; g: number; b: number; a: number } | null {
  const m = s.match(/-?\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  return { r: +m[0], g: +m[1], b: +m[2], a: m.length >= 4 ? +m[3] : 1 };
}
/** Perceptual-ish lightness 0..100 from relative luminance. */
function lightnessPct(r: number, g: number, b: number): number {
  return relLuminance(r, g, b) * 100;
}

function surfaceDefect(s: SurfaceMetric, pageBg: { r: number; g: number; b: number }): LayoutDefect | null {
  const bg = parseRgba(s.bg);
  // A transparent panel has no fill of its own -> zero separation.
  const fillL = bg && bg.a >= 0.5 ? lightnessPct(bg.r, bg.g, bg.b) : lightnessPct(pageBg.r, pageBg.g, pageBg.b);
  const pageL = lightnessPct(pageBg.r, pageBg.g, pageBg.b);
  const deltaL = Math.abs(fillL - pageL);

  const border = parseRgba(s.borderColor);
  const borderSep = border && border.a >= 0.4
    ? Math.abs(lightnessPct(border.r, border.g, border.b) - pageL) : 0;
  const visibleBorder = s.borderWidth >= MIN_VISIBLE_BORDER && borderSep >= 6;

  if (deltaL < MIN_SURFACE_LIGHTNESS_DELTA && !visibleBorder && !s.hasShadow) {
    return {
      type: "invisible_surface",
      detail: `Panel ${s.label} fills at only ${deltaL.toFixed(1)}% lightness separation from the page background ` +
        `(needs >= ${MIN_SURFACE_LIGHTNESS_DELTA}%) with no visible border or shadow -- its edges vanish into the backdrop. ` +
        `Raise the fill separation to >= ${MIN_SURFACE_LIGHTNESS_DELTA}% (pull from the brand surface token) AND add a ` +
        `>= ${MIN_VISIBLE_BORDER}px mid-value border + a real drop shadow.`,
    };
  }
  return null;
}

function channelStdev(buf: Buffer, ch: 0 | 1 | 2): number {
  const n = Math.floor(buf.length / 3);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf[i * 3 + ch];
  const mean = sum / n;
  let v = 0;
  for (let i = 0; i < n; i++) { const d = buf[i * 3 + ch] - mean; v += d * d; }
  return Math.sqrt(v / n);
}

/** Worst-channel RGB std-dev within one horizontal strip (cropped + area-scaled). */
async function stripColorSpread(imagePath: string, w: number, h: number, yFrac: number, hFrac: number): Promise<number | null> {
  const cy = Math.round(h * yFrac), ch = Math.round(h * hFrac);
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-i", imagePath, "-vf",
        `crop=${w}:${ch}:0:${cy},scale=64:8:flags=area`,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      { encoding: "buffer", maxBuffer: 1 << 20 },
    );
    const buf = stdout as unknown as Buffer;
    if (Math.floor(buf.length / 3) < 16) return null;
    return Math.max(channelStdev(buf, 0), channelStdev(buf, 1), channelStdev(buf, 2));
  } catch {
    return null;
  }
}

/**
 * Backdrop color richness: worst-channel RGB spread in the top + bottom strips
 * (which are pure background when content is center-pooled -- the only time the
 * dead-frame check fires). Returns the MAX across both strips, so a scene is
 * "flat" only if BOTH strips are near-uniform. Per-channel (not luminance)
 * because a vibrant gradient can be luminance-flat yet hugely color-varied.
 */
async function backdropColorSpread(imagePath: string, w: number, h: number): Promise<number | null> {
  const top = await stripColorSpread(imagePath, w, h, 0, 0.25);
  const bot = await stripColorSpread(imagePath, w, h, 0.75, 0.25);
  if (top === null && bot === null) return null;
  return Math.max(top ?? 0, bot ?? 0);
}

/** Compute content coverage (fraction of an occupancy grid filled). */
function contentCoverage(layout: LayoutProbeResult): number {
  if (layout.contentBoxes.length === 0) return 0;
  const grid = new Array(ROWS).fill(0).map(() => new Array(COLS).fill(false));
  const cw = layout.vw / COLS, ch = layout.vh / ROWS;
  for (const b of layout.contentBoxes) {
    const c0 = Math.max(0, Math.floor(b.x / cw)), c1 = Math.min(COLS - 1, Math.floor((b.x + b.w) / cw));
    const r0 = Math.max(0, Math.floor(b.y / ch)), r1 = Math.min(ROWS - 1, Math.floor((b.y + b.h) / ch));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r][c] = true;
  }
  let occupied = 0;
  for (const row of grid) occupied += row.filter(Boolean).length;
  return occupied / (ROWS * COLS);
}

/**
 * Dead-frame defect: content covers very little of the canvas AND the backdrop
 * is FLAT (measured from pixels, not geometry -- a vibrant gradient is fine, a
 * flat dark/white field is not).
 */
function deadFrameDefect(coverage: number, colorSpread: number | null): LayoutDefect | null {
  if (coverage >= MIN_CONTENT_COVERAGE) return null;
  // Can't measure flatness -> don't risk a false positive.
  if (colorSpread === null) return null;
  if (colorSpread >= FLAT_COLOR_SPREAD) return null; // rich backdrop fills the space
  return {
    type: "dead_frame",
    detail: `Content covers only ${(coverage * 100).toFixed(0)}% of the frame (needs >= ${(MIN_CONTENT_COVERAGE * 100).toFixed(0)}%) ` +
      `over a flat backdrop (color spread ${colorSpread.toFixed(1)}, flat < ${FLAT_COLOR_SPREAD}) -- the scene reads as a little text on empty space. ` +
      `Either distribute supporting elements across the canvas OR give the background real depth (a vibrant brand gradient / layered backdrop), not a flat fill.`,
  };
}

/**
 * Measure surface separation + content coverage across several moments and return
 * the blocking layout defects found. Probes multiple times (elements animate in)
 * and keeps the WORST finding per type so a transient full-frame moment doesn't
 * mask a scene that's empty or ghosted for most of its run.
 */
export async function measureLayout(opts: {
  htmlPath: string;
  width: number;
  height: number;
  atTimes: number[];
}): Promise<LayoutDefect[]> {
  let worstSurface: LayoutDefect | null = null;
  let worstSurfaceDelta = Infinity;
  let deadEveryFrame = true;
  let sawAnyFrame = false;
  let lastDead: LayoutDefect | null = null;

  const tmpDir = path.join(os.tmpdir(), `layout_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`);
  await fs.mkdir(tmpDir, { recursive: true }).catch(() => {});
  try {
  for (const t of opts.atTimes) {
    let layout: LayoutProbeResult | undefined;
    const probePath = path.join(tmpDir, `probe.png`);
    try {
      ({ layout } = await captureSingleFrame({
        htmlPath: opts.htmlPath, outputPath: probePath,
        width: opts.width, height: opts.height, atTime: t, layoutProbe: true,
      }));
    } catch {
      continue;
    }
    if (!layout) continue;
    sawAnyFrame = true;

    const pageBg = parseRgba(layout.pageBg) || { r: 255, g: 255, b: 255, a: 1 };

    // Ghost panels: keep the single worst (lowest-separation) panel across frames.
    for (const s of layout.surfaces) {
      const d = surfaceDefect(s, pageBg);
      if (d) {
        const m = d.detail.match(/only ([\d.]+)% lightness/);
        const delta = m ? parseFloat(m[1]) : 0;
        if (delta < worstSurfaceDelta) { worstSurfaceDelta = delta; worstSurface = d; }
      }
    }

    // Dead frame: low content coverage over a flat backdrop. Only a defect if
    // EVERY probed moment is dead (so an intentional empty beat that fills in
    // later isn't flagged on its sparse instant). Flatness is measured from the
    // probe screenshot's pixel luminance variation.
    const coverage = contentCoverage(layout);
    const colorSpread = coverage < MIN_CONTENT_COVERAGE ? await backdropColorSpread(probePath, opts.width, opts.height) : null;
    if (process.env.MP_LAYOUT_DEBUG) console.log(`  [layout-dbg] t=${t} coverage=${(coverage*100).toFixed(1)}% colorSpread=${colorSpread?.toFixed(2)} surfaces=${layout.surfaces.length} contentBoxes=${layout.contentBoxes.length} pageBg=${layout.pageBg}`);
    const dead = deadFrameDefect(coverage, colorSpread);
    if (dead) lastDead = dead; else deadEveryFrame = false;
  }

  const defects: LayoutDefect[] = [];
  if (worstSurface) defects.push(worstSurface);
  if (sawAnyFrame && deadEveryFrame && lastDead) defects.push(lastDead);
  return defects;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
