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
 * Three checks:
 *   - invisible_surface: a panel/card/window whose fill is within a few % lightness
 *     of the page background AND has no visible border or shadow -> a ghost panel.
 *   - dead_frame: content occupies very little of the canvas, or a tall band is
 *     empty, AND no rich full-bleed background fills that space -> a dead/empty frame.
 *   - edge_bleed: a decorative/photographic element positioned partially off-canvas
 *     (e.g. `bottom: -80px`) leaks a strip of foreign texture across a frame border.
 *     Detected by comparing each edge's outermost pixel strip against the strip just
 *     inboard of it: real edge content (a full-bleed photo/video, an intentional
 *     vignette) has SIMILAR texture at the edge and just inside it; a clipped stray
 *     element creates an ABRUPT noise spike confined to the outermost strip only.
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
  type: "invisible_surface" | "dead_frame" | "edge_bleed";
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
/** Thickness of the edge strip probed for bleed-through, as a fraction of the
 *  relevant dimension (height for top/bottom, width for left/right). */
const EDGE_STRIP_FRAC = 0.035;
/** The outermost strip's noise must exceed the strip just inboard of it by this
 *  multiple to count as an abrupt, localized texture spike (not a gradual trend). */
const EDGE_NOISE_RATIO = 2.5;
/** ...and clear this absolute floor, so near-zero-noise strips don't trigger on
 *  ratio alone (division noise near 0 is unstable). */
const EDGE_NOISE_FLOOR = 10;

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

/** Worst-channel RGB std-dev of a RAW (undownsampled) crop -- unlike
 *  stripColorSpread's area-averaged sampling (tuned to see broad gradient
 *  variation), this preserves per-pixel grain/dither texture, which is exactly
 *  the signal that separates a smooth intentional gradient from a leaked photo. */
async function rawRegionNoise(imagePath: string, cropW: number, cropH: number, cropX: number, cropY: number): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-i", imagePath, "-vf", `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      { encoding: "buffer", maxBuffer: 8 << 20 },
    );
    const buf = stdout as unknown as Buffer;
    if (Math.floor(buf.length / 3) < 16) return null;
    return Math.max(channelStdev(buf, 0), channelStdev(buf, 1), channelStdev(buf, 2));
  } catch {
    return null;
  }
}

/**
 * Edge-bleed defect: a foreign element (typically a decorative image/photo
 * positioned partially off-canvas) leaking a strip of texture across a frame
 * border. Checked on all four edges by comparing the outermost strip's noise
 * to the strip immediately inboard of it -- a real full-bleed background has
 * comparable texture on both; a clipped stray element spikes only at the edge.
 */
async function edgeBleedDefect(imagePath: string, w: number, h: number): Promise<LayoutDefect | null> {
  const edges: Array<{ name: string; strip: number; outer: [number, number, number, number]; inboard: [number, number, number, number] }> = [
    { name: "top", strip: Math.round(h * EDGE_STRIP_FRAC), outer: [0, 0, 0, 0], inboard: [0, 0, 0, 0] },
    { name: "bottom", strip: Math.round(h * EDGE_STRIP_FRAC), outer: [0, 0, 0, 0], inboard: [0, 0, 0, 0] },
    { name: "left", strip: Math.round(w * EDGE_STRIP_FRAC), outer: [0, 0, 0, 0], inboard: [0, 0, 0, 0] },
    { name: "right", strip: Math.round(w * EDGE_STRIP_FRAC), outer: [0, 0, 0, 0], inboard: [0, 0, 0, 0] },
  ];
  for (const e of edges) {
    const s = e.strip;
    if (s < 4) continue;
    if (e.name === "top") { e.outer = [w, s, 0, 0]; e.inboard = [w, s, 0, s]; }
    else if (e.name === "bottom") { e.outer = [w, s, 0, h - s]; e.inboard = [w, s, 0, h - 2 * s]; }
    else if (e.name === "left") { e.outer = [s, h, 0, 0]; e.inboard = [s, h, s, 0]; }
    else { e.outer = [s, h, w - s, 0]; e.inboard = [s, h, w - 2 * s, 0]; }
  }

  let worst: LayoutDefect | null = null;
  let worstRatio = 0;
  for (const e of edges) {
    if (e.strip < 4) continue;
    const [ow, oh, ox, oy] = e.outer;
    const [iw, ih, ix, iy] = e.inboard;
    if (oy < 0 || ox < 0 || iy < 0 || ix < 0) continue;
    const [outerNoise, inboardNoise] = await Promise.all([
      rawRegionNoise(imagePath, ow, oh, ox, oy),
      rawRegionNoise(imagePath, iw, ih, ix, iy),
    ]);
    if (outerNoise === null || inboardNoise === null) continue;
    const ratio = outerNoise / Math.max(inboardNoise, 0.5);
    if (outerNoise >= EDGE_NOISE_FLOOR && ratio >= EDGE_NOISE_RATIO && ratio > worstRatio) {
      worstRatio = ratio;
      worst = {
        type: "edge_bleed",
        detail: `Foreign texture bleeding across the ${e.name} edge of the frame -- a ${e.strip}px strip at the ${e.name} border has ${outerNoise.toFixed(1)} noise vs ${inboardNoise.toFixed(1)} just inboard (${ratio.toFixed(1)}x spike), consistent with a decorative image or photo positioned partially off-canvas. Move the element fully on-canvas or fully off (not straddling the border).`,
      };
    }
  }
  return worst;
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
  let edgeBleed: LayoutDefect | null = null;

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

    // Edge bleed: a static positioning bug (element straddling the canvas
    // border), so ONE hit across the probed moments is enough -- keep the first.
    if (!edgeBleed) {
      edgeBleed = await edgeBleedDefect(probePath, opts.width, opts.height);
    }
  }

  const defects: LayoutDefect[] = [];
  if (worstSurface) defects.push(worstSurface);
  if (sawAnyFrame && deadEveryFrame && lastDead) defects.push(lastDead);
  if (edgeBleed) defects.push(edgeBleed);
  return defects;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
