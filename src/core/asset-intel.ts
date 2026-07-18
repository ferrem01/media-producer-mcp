import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveVideoPath } from "./video-path.js";

/**
 * Asset intelligence: understand an uploaded video ONCE, at ingest, and save
 * what we learn as a sidecar (<file>.intel.json) every downstream consumer
 * can read -- codegen specs, the screencast-frame component's crop:"auto",
 * the layout tool, Studio.
 *
 * The headline detection is "does this recording contain its own window
 * chrome?" (a browser header, a title bar, letterbox bars). A screencast of a
 * full Safari window carries ~100px of the REAL address bar; drop that
 * footage into a mock browser-frame component and you get two headers
 * stacked. Knowing the content box up front is what makes the frame
 * treatment automatic instead of an hour of eyeballed percentages.
 *
 * Method: sample a handful of frames spread across the clip, downscale, and
 * classify each row/column by TEMPORAL activity. Content rows change between
 * frames taken minutes apart; chrome rows do not. A static edge band that is
 * also spatially flat and dark is a letterbox bar; a static band with visible
 * detail (buttons, URL text) is UI chrome. Everything is best-effort: when
 * detection is not confident we report no trim rather than a wrong one, and
 * the numbers are suggestions -- the source file is never modified.
 */

export type TrimReason = "static-chrome" | "letterbox";

export interface EdgeTrim {
  /** Suggested trim in SOURCE pixels (0 = nothing detected on this edge). */
  px: number;
  reason: TrimReason | null;
}

export interface AssetIntel {
  version: 1;
  kind: "video";
  width: number;
  height: number;
  duration: number;
  /** Suggested per-edge trims, in source pixels. */
  trims: { top: EdgeTrim; bottom: EdgeTrim; left: EdgeTrim; right: EdgeTrim };
  /** The real content region after applying the suggested trims. */
  content_box: { x: number; y: number; w: number; h: number };
  /** True when the top trim looks like the recording's own window/browser chrome. */
  has_own_chrome: boolean;
  /** Overall content luminance: drives scene background matching. */
  theme: "light" | "dark" | "mixed";
  /** Human-readable summary lines, ready to inject into a codegen prompt. */
  notes: string[];
  /** Cached "compress the waiting" scan: dead/static stretches (agent spinners,
   *  loading, reading) as source-time ranges, computed once at ingest so a
   *  scene that uses this recording can propose the time-lapse instantly
   *  without re-decoding the whole clip. */
  idle?: { ranges: Array<{ start: number; end: number }>; duration: number };
  /** Hard visual transitions (page changes) in source seconds -- snap points
   *  for chapter pins. Cached at ingest from the same motion profile. */
  transitions?: number[];
  /** Concentrated-activity stretches (typing in a field, clicking a button):
   *  callout/punch-in targets. Source seconds; box in frame fractions. */
  focus?: Array<{ start: number; end: number; x: number; y: number; w: number; h: number }>;
  /** Version of the motion-analysis algorithms that produced idle/transitions/
   *  focus. Bump MOTION_INTEL_V to invalidate cached sidecars when detection
   *  changes (e.g. v2: median focus boxes instead of runaway unions). */
  motion_v?: number;
  analyzed_at: string;
}

const ANALYSIS_W = 480; // downscale width for pixel analysis
const SAMPLE_COUNT = 7; // frames sampled across the clip
const MIN_CHROME_SRC_PX = 24; // below this a "chrome" band is noise
const MAX_BAND_FRACTION = 0.28; // a static band taller than this is a static scene, not chrome

function runFfmpeg(args: string[]): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    const outs: Buffer[] = [];
    const errs: Buffer[] = [];
    ff.stdout.on("data", (c) => outs.push(c));
    ff.stderr.on("data", (c) => errs.push(c));
    ff.on("error", reject);
    ff.on("close", (code) =>
      resolve({ code: code ?? -1, stdout: Buffer.concat(outs), stderr: Buffer.concat(errs).toString() }));
  });
}

/** Parse dimensions + duration from `ffmpeg -i` stderr (no ffprobe dependency). */
export async function probeVideoMeta(filePath: string): Promise<{ width: number; height: number; duration: number } | null> {
  const { stderr } = await runFfmpeg(["-i", filePath]).catch(() => ({ code: -1, stdout: Buffer.alloc(0), stderr: "" }));
  const dim = stderr.match(/Stream[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
  const dur = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!dim) return null;
  const duration = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
  return { width: Number(dim[1]), height: Number(dim[2]), duration };
}

/** Decode one downscaled RGB frame at a timestamp. Returns null on failure. */
async function sampleFrame(filePath: string, at: number, aw: number, ah: number): Promise<Buffer | null> {
  const { code, stdout } = await runFfmpeg([
    "-ss", at.toFixed(2), "-i", filePath,
    "-frames:v", "1", "-vf", `scale=${aw}:${ah}`,
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-loglevel", "error", "-",
  ]).catch(() => ({ code: -1, stdout: Buffer.alloc(0), stderr: "" }));
  const expected = aw * ah * 3;
  if (code !== 0 || stdout.length < expected) return null;
  return stdout.subarray(0, expected);
}

/** Per-pixel luminance grid from an rgb24 frame. */
function toLuma(frame: Buffer, aw: number, ah: number): Float32Array {
  const luma = new Float32Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) {
    const o = i * 3;
    luma[i] = 0.2126 * frame[o] + 0.7152 * frame[o + 1] + 0.0722 * frame[o + 2];
  }
  return luma;
}

interface AxisProfile {
  /** Mean absolute temporal difference per line (row or column). */
  activity: Float32Array;
  /** Mean luminance per line (averaged over frames). */
  meanLuma: Float32Array;
  /** Mean spatial stddev per line (averaged over frames): flat bars score ~0. */
  spatialDev: Float32Array;
}

function profileAxis(frames: Float32Array[], aw: number, ah: number, axis: "rows" | "cols"): AxisProfile {
  const lines = axis === "rows" ? ah : aw;
  const perLine = axis === "rows" ? aw : ah;
  const activity = new Float32Array(lines);
  const meanLuma = new Float32Array(lines);
  const spatialDev = new Float32Array(lines);
  for (let l = 0; l < lines; l++) {
    let act = 0, lum = 0, dev = 0;
    for (let f = 0; f < frames.length; f++) {
      let sum = 0, sumSq = 0, diff = 0;
      for (let p = 0; p < perLine; p++) {
        const idx = axis === "rows" ? l * aw + p : p * aw + l;
        const v = frames[f][idx];
        sum += v; sumSq += v * v;
        if (f > 0) diff += Math.abs(v - frames[f - 1][idx]);
      }
      const mean = sum / perLine;
      lum += mean;
      dev += Math.sqrt(Math.max(0, sumSq / perLine - mean * mean));
      if (f > 0) act += diff / perLine;
    }
    activity[l] = frames.length > 1 ? act / (frames.length - 1) : 0;
    meanLuma[l] = lum / frames.length;
    spatialDev[l] = dev / frames.length;
  }
  return { activity, meanLuma, spatialDev };
}

/** Length (in analysis lines) of the static band starting from one edge, or 0. */
function staticBandFromEdge(prof: AxisProfile, fromEnd: boolean, threshold: number, maxBand: number): number {
  const n = prof.activity.length;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const idx = fromEnd ? n - 1 - i : i;
    if (prof.activity[idx] < threshold) run++;
    else break;
  }
  if (run === 0 || run > maxBand) return 0;
  // Require a clearly ACTIVE region right after the band -- a real boundary,
  // not a lull. Guards against calling a mostly-static recording "chrome".
  const probeLen = Math.min(20, n - run);
  if (probeLen <= 0) return 0;
  let after = 0;
  for (let i = 0; i < probeLen; i++) {
    const idx = fromEnd ? n - 1 - run - i : run + i;
    after += prof.activity[idx];
  }
  if (after / probeLen < threshold * 2) return 0;
  return run;
}

/**
 * A static band can overshoot real window chrome into the CONTENT's own
 * static region (an app's fixed header stays put across every frame too --
 * measured: a Safari recording read 157px "chrome" when the browser bar is
 * 108px, the extra 49px being the app header's padding). Real chrome ends
 * at a crisp horizontal seam (gray address bar -> white page); static page
 * padding does not. Cut the band back to its deepest visible seam; keep the
 * full band when there is none (uniform letterbox bars, gradient headers).
 */
function refineBandBySeam(prof: AxisProfile, fromEnd: boolean, band: number): number {
  const n = prof.activity.length;
  const at = (i: number) => (fromEnd ? n - 1 - i : i); // i-th line counted from this edge

  // Primary signal: browser/window chrome is DENSE with detail (tab strip,
  // URL text, buttons -- high spatial deviation); the page area right below
  // it is flat padding. The chrome boundary is the split that maximizes
  // (mean detail before) - (mean detail after) within the static band. A
  // plain luminance seam can be as small as 5 units (near-white Safari
  // toolbar on a near-white page) while an app header's own edges jump more,
  // so luma-seam-only refinement picks the wrong boundary on real footage.
  let bestSplit = -1, bestScore = 2.5; // minimum meaningful contrast in detail
  for (let i = 2; i < band - 3; i++) {
    let before = 0, after = 0;
    for (let k = 0; k <= i; k++) before += prof.spatialDev[at(k)];
    for (let k = i + 1; k < band; k++) after += prof.spatialDev[at(k)];
    const score = before / (i + 1) - after / (band - i - 1);
    if (score > bestScore) { bestScore = score; bestSplit = i + 1; }
  }
  if (bestSplit > 0) return bestSplit;

  // Fallback (flat-detail chrome, e.g. a plain title bar): deepest interior
  // luminance/detail seam. Stop 2 lines short of the band's end -- the
  // transition into the ACTIVE region is the band's own outer boundary (plus
  // a blended row), not the chrome's inner edge; counting it would always
  // return the full band.
  let best = -1;
  for (let i = 1; i < band - 2; i++) {
    const lumaJump = Math.abs(prof.meanLuma[at(i)] - prof.meanLuma[at(i - 1)]);
    const devJump = Math.abs(prof.spatialDev[at(i)] - prof.spatialDev[at(i - 1)]);
    if (lumaJump > 6 || devJump > 8) best = i;
  }
  return best > 0 ? best : band;
}

function classifyBand(prof: AxisProfile, fromEnd: boolean, band: number): TrimReason {
  // Flat + dark rows = letterbox bar; rows with visible detail = UI chrome.
  // Vote per row (majority) so a boundary row or two can't tip the class.
  const n = prof.activity.length;
  let flatDark = 0;
  for (let i = 0; i < band; i++) {
    const idx = fromEnd ? n - 1 - i : i;
    if (prof.spatialDev[idx] < 6 && prof.meanLuma[idx] < 48) flatDark++;
  }
  return flatDark >= band * 0.6 ? "letterbox" : "static-chrome";
}

/**
 * Fine pass for the top chrome boundary. The coarse pass works at ~5-7 source
 * px per analysis row -- enough to find "there is a static header band" but
 * not where the browser chrome actually ends when the app below has its own
 * static, detailed header (measured on real footage: coarse said 136px, the
 * Safari bar is 108px). What DOES mark the boundary in every real browser is
 * the full-width hairline divider drawn between toolbar and page. Re-decode
 * just the top region at native 1:1 row resolution and return the row of the
 * strongest full-width luminance dip inside the static band; null when no
 * hairline exists (step boundaries are the coarse pass's job).
 */
async function refineTopChromeFine(
  filePath: string, duration: number, height: number, coarseBandPx: number,
): Promise<number | null> {
  const R = Math.min(height, Math.max(160, Math.round(coarseBandPx * 1.6 + 60)));
  const aw = 480;
  const span = Math.max(duration, 0.5);
  const rowMeans: Float32Array[] = [];
  for (const f of [0.15, 0.35, 0.55, 0.75, 0.9]) {
    const t = Math.max(0, Math.min(span * f, span - 0.3));
    const { code, stdout } = await runFfmpeg([
      "-ss", t.toFixed(2), "-i", filePath,
      "-frames:v", "1", "-vf", `crop=iw:${R}:0:0,scale=${aw}:${R}`,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-loglevel", "error", "-",
    ]).catch(() => ({ code: -1, stdout: Buffer.alloc(0) }));
    if (code !== 0 || stdout.length < aw * R * 3) continue;
    const rm = new Float32Array(R);
    for (let r = 0; r < R; r++) {
      let sum = 0;
      for (let p = 0; p < aw; p++) {
        const o = (r * aw + p) * 3;
        sum += 0.2126 * stdout[o] + 0.7152 * stdout[o + 1] + 0.0722 * stdout[o + 2];
      }
      rm[r] = sum / aw;
    }
    rowMeans.push(rm);
  }
  if (rowMeans.length < 3) return null;

  const meanLuma = new Float32Array(R);
  const activity = new Float32Array(R);
  for (let r = 0; r < R; r++) {
    let lum = 0, act = 0;
    for (let f = 0; f < rowMeans.length; f++) {
      lum += rowMeans[f][r];
      if (f > 0) act += Math.abs(rowMeans[f][r] - rowMeans[f - 1][r]);
    }
    meanLuma[r] = lum / rowMeans.length;
    activity[r] = act / (rowMeans.length - 1);
  }

  const cap = Math.min(R - 5, coarseBandPx + 24);
  let best: number | null = null;
  let bestDip = 8; // a real divider dips well past noise
  for (let r = 6; r <= cap; r++) {
    if (activity[r] > 1.5) continue; // boundary rows are static
    // A hairline deviates from BOTH sides in the same direction; a step
    // boundary deviates from one side only (and would false-positive if
    // compared against averaged neighbors that span the step).
    const left = (meanLuma[r - 4] + meanLuma[r - 3] + meanLuma[r - 2]) / 3;
    const right = (meanLuma[r + 2] + meanLuma[r + 3] + meanLuma[r + 4]) / 3;
    const dl = left - meanLuma[r], dr = right - meanLuma[r];
    const dip = dl > 0 && dr > 0 ? Math.min(dl, dr) : dl < 0 && dr < 0 ? Math.min(-dl, -dr) : 0;
    if (dip > bestDip) { bestDip = dip; best = r; }
  }
  return best != null ? best + 2 : null; // crop just past the divider line
}

/**
 * Analyze a video file. Returns null when the file is not a decodable video
 * or too short/degenerate to say anything useful.
 */
export async function analyzeVideoAsset(filePath: string): Promise<AssetIntel | null> {
  const meta = await probeVideoMeta(filePath);
  if (!meta || meta.width < 64 || meta.height < 64) return null;
  const { width, height, duration } = meta;

  const aw = ANALYSIS_W;
  const ah = Math.max(2, Math.round((height * aw) / width / 2) * 2);
  const span = Math.max(duration, 0.5);
  const times: number[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    times.push(Math.min(span * (0.05 + (0.9 * i) / (SAMPLE_COUNT - 1)), Math.max(0, span - 0.3)));
  }
  const frames: Float32Array[] = [];
  for (const t of times) {
    const f = await sampleFrame(filePath, t, aw, ah);
    if (f) frames.push(toLuma(f, aw, ah));
  }
  if (frames.length < 3) return null;

  const rows = profileAxis(frames, aw, ah, "rows");
  const cols = profileAxis(frames, aw, ah, "cols");

  // Adaptive "static" threshold from the clip's own activity distribution.
  const allAct = Array.from(rows.activity).sort((a, b) => a - b);
  const median = allAct[Math.floor(allAct.length / 2)];
  const threshold = Math.max(0.8, median * 0.12);

  const srcPerRow = height / ah;
  const srcPerCol = width / aw;

  const measure = (prof: AxisProfile, fromEnd: boolean, srcPerLine: number, minSrcPx: number): EdgeTrim & { rawPx?: number } => {
    const maxBand = Math.floor(prof.activity.length * MAX_BAND_FRACTION);
    const rawBand = staticBandFromEdge(prof, fromEnd, threshold, maxBand);
    if (rawBand === 0) return { px: 0, reason: null };
    const reason = classifyBand(prof, fromEnd, rawBand);
    const band = reason === "static-chrome" ? refineBandBySeam(prof, fromEnd, rawBand) : rawBand;
    const px = Math.round(band * srcPerLine);
    if (px < minSrcPx) return { px: 0, reason: null };
    return { px, reason, rawPx: Math.round(rawBand * srcPerLine) };
  };

  // Letterbox bars can be thin; chrome must clear MIN_CHROME_SRC_PX. Apply the
  // stricter floor only when the band classifies as chrome.
  const finalize = (t: EdgeTrim): EdgeTrim =>
    t.reason === "static-chrome" && t.px < MIN_CHROME_SRC_PX ? { px: 0, reason: null } : t;

  const topMeasured = measure(rows, false, srcPerRow, 4);
  const trims = {
    top: finalize({ px: topMeasured.px, reason: topMeasured.reason }),
    bottom: finalize(measure(rows, true, srcPerRow, 4)),
    left: finalize(measure(cols, false, srcPerCol, 4)),
    right: finalize(measure(cols, true, srcPerCol, 4)),
  };

  // Fine pass: a real browser draws a full-width hairline divider between
  // its toolbar and the page; find it at native row resolution and let it
  // override the coarse boundary. Skipped when no line exists (step
  // boundaries) or the coarse pass found no chrome at all.
  if (trims.top.reason === "static-chrome" && topMeasured.rawPx) {
    try {
      const fine = await refineTopChromeFine(filePath, duration, height, topMeasured.rawPx);
      if (fine != null && fine >= MIN_CHROME_SRC_PX) trims.top = { px: fine, reason: "static-chrome" };
    } catch { /* fine pass is best-effort */ }
  }

  const content_box = {
    x: trims.left.px,
    y: trims.top.px,
    w: Math.max(0, width - trims.left.px - trims.right.px),
    h: Math.max(0, height - trims.top.px - trims.bottom.px),
  };

  // Theme from the content region's luminance.
  const y0 = Math.floor(content_box.y / srcPerRow), y1 = Math.ceil((content_box.y + content_box.h) / srcPerRow);
  let lum = 0, count = 0;
  for (let y = y0; y < Math.min(y1, ah); y++) { lum += rows.meanLuma[y]; count++; }
  const meanLum = count ? lum / count : 128;
  const theme: AssetIntel["theme"] = meanLum > 150 ? "light" : meanLum < 90 ? "dark" : "mixed";

  const has_own_chrome = trims.top.reason === "static-chrome";
  const notes: string[] = [
    `${width}x${height}, ${duration.toFixed(1)}s, ${theme} theme`,
  ];
  if (has_own_chrome) {
    notes.push(`Recording contains its OWN window/browser chrome: top ${trims.top.px}px of the source is a static header (address bar / title bar). Adding a mock browser frame on top will show TWO headers unless the source's top ${trims.top.px}px is cropped.`);
  }
  for (const [edge, t] of Object.entries(trims) as [string, EdgeTrim][]) {
    if (t.reason === "letterbox") notes.push(`${edge} edge has a ${t.px}px letterbox bar.`);
    else if (t.reason === "static-chrome" && edge !== "top") notes.push(`${edge} edge has a ${t.px}px static band (dock/taskbar or UI chrome).`);
  }
  if (!has_own_chrome && !Object.values(trims).some((t) => t.px > 0)) {
    notes.push("No embedded window chrome or letterboxing detected; the full frame is content.");
  }

  return {
    version: 1, kind: "video", width, height, duration,
    trims, content_box, has_own_chrome, theme, notes,
    analyzed_at: new Date().toISOString(),
  };
}

const sidecarPath = (filePath: string) => filePath + ".intel.json";

/** Analyze and persist the sidecar next to the asset. Best-effort. */
/**
 * Ground-truth letterbox measurement via ffmpeg cropdetect (majority vote
 * over a sampled window, strict luma threshold so dark app themes never read
 * as bars). Returns per-edge bar sizes, or null when nothing confident.
 */
export async function detectLetterboxBars(
  filePath: string,
  width: number,
  height: number,
  duration: number,
): Promise<{ top: number; bottom: number; left: number; right: number } | null> {
  if (!(width > 0 && height > 0)) return null;
  const start = Math.min(8, Math.max(0, duration * 0.15));
  const span = Math.max(6, Math.min(30, duration - start - 1));
  const stderr = await new Promise<string>((resolve) => {
    const ff = spawn("ffmpeg", [
      "-ss", start.toFixed(1), "-i", filePath, "-t", span.toFixed(1),
      "-vf", "cropdetect=limit=12:round=2:reset=0", "-f", "null", "-",
    ]);
    const chunks: Buffer[] = [];
    ff.stderr.on("data", (c) => chunks.push(c));
    ff.on("error", () => resolve(""));
    ff.on("close", () => resolve(Buffer.concat(chunks).toString()));
  });
  const counts = new Map<string, number>();
  for (const m of stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)) {
    const key = m.slice(1, 5).join(":");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  let total = 0;
  for (const [k, n] of counts) { total += n; if (n > bestN) { best = k; bestN = n; } }
  if (!best || total < 10 || bestN / total < 0.8) return null; // unstable -> don't trust
  const [w, h, x, y] = best.split(":").map(Number);
  const bars = { top: y, bottom: height - y - h, left: x, right: width - x - w };
  if (Object.values(bars).some((v) => v < 0)) return null;
  if (Object.values(bars).every((v) => v < 8)) return null; // no real bars
  // A "bar" spanning over a third of an axis is content going dark, not matte.
  if (bars.top + bars.bottom > height * 0.38 || bars.left + bars.right > width * 0.38) return null;
  return bars;
}

export async function analyzeAndSaveIntel(filePath: string): Promise<AssetIntel | null> {
  const intel = await analyzeVideoAsset(filePath);
  if (intel) {
    // Recorder footage (events sidecar present) is a TAB capture: OS chrome
    // (dock, menu bar) is impossible by construction, so any static band is
    // the app's own UI -- content, never trimmable. Chrome DOES letterbox the
    // tab into the stream when aspects mismatch, so bars are measured with
    // cropdetect ground truth instead of the static-band heuristics.
    try {
      const { loadRecorderEvents } = await import("./recorder-events.js");
      if (await loadRecorderEvents(filePath)) {
        const zero = { px: 0, reason: null as null };
        intel.trims = { top: { ...zero }, bottom: { ...zero }, left: { ...zero }, right: { ...zero } };
        intel.has_own_chrome = false;
        const bars = await detectLetterboxBars(filePath, intel.width, intel.height, intel.duration);
        if (bars) {
          for (const edge of ["top", "bottom", "left", "right"] as const) {
            if (bars[edge] >= 8) intel.trims[edge] = { px: bars[edge], reason: "letterbox", rawPx: bars[edge] } as any;
          }
          intel.notes.push(
            `tab capture letterbox (cropdetect): top ${bars.top}px, bottom ${bars.bottom}px, left ${bars.left}px, right ${bars.right}px.`,
          );
        }
        intel.content_box = {
          x: intel.trims.left.px,
          y: intel.trims.top.px,
          w: intel.width - intel.trims.left.px - intel.trims.right.px,
          h: intel.height - intel.trims.top.px - intel.trims.bottom.px,
        };
      }
    } catch { /* recorder refinement is best-effort */ }
    // Cache the "compress the waiting" scan at ingest so placing this recording
    // in a scene can propose the time-lapse instantly (no re-decode). Best-effort.
    try {
      const { analyzeMotion } = await import("./compress-waiting.js");
      const det = await analyzeMotion(filePath, 2);
      intel.idle = { ranges: det.ranges.map((r) => ({ start: r.start, end: r.end })), duration: det.duration };
      if (det.ranges.length) {
        intel.notes.push(`compress-the-waiting: ${det.ranges.length} idle stretch(es) totalling ${Math.round(det.ranges.reduce((t, r) => t + (r.end - r.start), 0))}s (cached).`);
      }
      // Always set (even empty) so ensureMotionIntel can trust the sidecar
      // and never re-decode a clip that genuinely has no seams/focus.
      intel.transitions = det.transitions;
      intel.focus = det.focus;
      intel.motion_v = MOTION_INTEL_V;
      if (det.transitions.length) {
        intel.notes.push(`${det.transitions.length} hard visual transition(s) (chapter-pin snap points, cached).`);
      }
    } catch { /* motion scan is optional -- never block the sidecar on it */ }
    await fs.writeFile(sidecarPath(filePath), JSON.stringify(intel, null, 2)).catch(() => {});
  }
  return intel;
}

/** Load a previously saved sidecar for an asset file path. */
export async function loadAssetIntel(filePath: string): Promise<AssetIntel | null> {
  try {
    const raw = await fs.readFile(sidecarPath(filePath), "utf8");
    const intel = JSON.parse(raw);
    return intel && intel.version === 1 ? (intel as AssetIntel) : null;
  } catch {
    return null;
  }
}

/** Bump when idle/transition/focus detection changes shape or semantics. */
export const MOTION_INTEL_V = 2;

const motionIntelInflight = new Map<string, Promise<{
  idle: { ranges: Array<{ start: number; end: number }>; duration: number } | null;
  transitions: number[];
  focus: Array<{ start: number; end: number; x: number; y: number; w: number; h: number }>;
  duration: number;
}>>();

/** Drop the in-process motion-intel memo for a path (e.g. when a recorder
 *  events sidecar lands after the intel was first computed). */
export function invalidateMotionIntel(filePath: string): void {
  motionIntelInflight.delete(filePath);
}

/** Motion intel for an asset -- idle ranges, transitions, focus events --
 *  loaded from the sidecar when present, computed ONCE and written back when
 *  the sidecar predates a signal (so older uploads upgrade in place and the
 *  decode never runs twice). Concurrent callers share one computation. */
export function ensureMotionIntel(filePath: string): Promise<{
  idle: { ranges: Array<{ start: number; end: number }>; duration: number } | null;
  transitions: number[];
  focus: Array<{ start: number; end: number; x: number; y: number; w: number; h: number }>;
  duration: number;
}> {
  const existing = motionIntelInflight.get(filePath);
  if (existing) return existing;
  const job = ensureMotionIntelUncached(filePath);
  motionIntelInflight.set(filePath, job);
  // Keep successful results memoized for the process lifetime (the sidecar
  // is the durable cache); forget failures so a retry can succeed.
  job.catch(() => motionIntelInflight.delete(filePath));
  return job;
}

async function ensureMotionIntelUncached(filePath: string): Promise<{
  idle: { ranges: Array<{ start: number; end: number }>; duration: number } | null;
  transitions: number[];
  focus: Array<{ start: number; end: number; x: number; y: number; w: number; h: number }>;
  duration: number;
}> {
  const cached = await loadAssetIntel(filePath).catch(() => null);
  // Recorder-instrumented footage: the events sidecar is GROUND TRUTH
  // (SPEC-recorder.md) -- idle spans, page navigations, clicked-element
  // boxes recorded by the browser itself. Prefer it over every pixel
  // heuristic and skip the decode entirely.
  try {
    const { loadRecorderEvents, eventsToMotionIntel } = await import("./recorder-events.js");
    const events = await loadRecorderEvents(filePath);
    if (events) {
      const dur = cached?.duration || cached?.idle?.duration ||
        (await probeVideoMeta(filePath))?.duration || 0;
      const truth = eventsToMotionIntel(events, dur);
      if (cached) {
        cached.idle = truth.idle;
        cached.transitions = truth.transitions;
        cached.focus = truth.focus;
        cached.motion_v = MOTION_INTEL_V;
        await fs.writeFile(sidecarPath(filePath), JSON.stringify(cached, null, 2)).catch(() => {});
      }
      return { idle: truth.idle, transitions: truth.transitions, focus: truth.focus, duration: truth.idle.duration };
    }
  } catch { /* fall through to heuristics */ }
  if (cached?.idle && cached.transitions !== undefined && cached.focus !== undefined && cached.motion_v === MOTION_INTEL_V) {
    return {
      idle: cached.idle,
      transitions: cached.transitions || [],
      focus: cached.focus || [],
      duration: cached.idle.duration,
    };
  }
  const { analyzeMotion } = await import("./compress-waiting.js");
  const det = await analyzeMotion(filePath, 2);
  const idle = { ranges: det.ranges.map((r) => ({ start: r.start, end: r.end })), duration: det.duration };
  // Write back into the sidecar (best-effort) so the next assemble is instant.
  if (cached) {
    cached.idle = idle;
    cached.transitions = det.transitions;
    cached.focus = det.focus;
    cached.motion_v = MOTION_INTEL_V;
    await fs.writeFile(sidecarPath(filePath), JSON.stringify(cached, null, 2)).catch(() => {});
  }
  return { idle, transitions: det.transitions, focus: det.focus, duration: det.duration };
}

/** True for file extensions analyzeVideoAsset can handle. */
export function isAnalyzableVideo(filePath: string): boolean {
  return [".mp4", ".m4v", ".webm", ".mov", ".mkv"].includes(path.extname(filePath).toLowerCase());
}

// ── crop:"auto" resolution (screencast-frame component) ──
// The component declares crop:"auto"; at assembly time we swap in the real
// per-edge trims from the asset's ingest analysis so the browser never has
// to know about sidecars. Left as "auto" (component falls back to an HTTP
// sidecar fetch, then to no crop) when no analysis exists.

/** Resolve crop:"auto" in a screencast-frame data object. */
export async function resolveAutoCropData(data: Record<string, any>): Promise<Record<string, any>> {
  if (data?.crop !== "auto" || typeof data.video_url !== "string") return data;
  const intel = await loadAssetIntel(resolveVideoPath(data.video_url));
  if (!intel) return data;
  return {
    ...data,
    crop: {
      top: intel.trims.top.px,
      bottom: intel.trims.bottom.px,
      left: intel.trims.left.px,
      right: intel.trims.right.px,
    },
  };
}

/** Rewrite crop:"auto" inside <component type="screencast-frame"> tags in raw HTML. */
export async function resolveScreencastAutoCrops(html: string): Promise<string> {
  if (!html.includes("screencast-frame")) return html;
  const tagRe = /<component\b[^>]*>/gi;
  const tags = html.match(tagRe);
  if (!tags) return html;
  let out = html;
  for (const tag of tags) {
    if (!/type\s*=\s*["']screencast-frame["']/i.test(tag)) continue;
    const dataMatch = tag.match(/data\s*=\s*(?:'([\s\S]*?)'|"([\s\S]*?)")/i);
    if (!dataMatch) continue;
    let data: Record<string, any>;
    try {
      data = JSON.parse(dataMatch[1] !== undefined ? dataMatch[1] : dataMatch[2].replace(/&quot;/g, '"'));
    } catch {
      continue;
    }
    if (data?.crop !== "auto") continue;
    const resolved = await resolveAutoCropData(data);
    if (resolved === data) continue; // no sidecar -- leave "auto" for the runtime fallback
    const json = JSON.stringify(resolved);
    // Single-quoted attr unless the JSON itself contains a single quote.
    const newAttr = json.includes("'")
      ? `data="${json.replace(/"/g, "&quot;")}"`
      : `data='${json}'`;
    const newTag = tag.replace(/data\s*=\s*(?:'[\s\S]*?'|"[\s\S]*?")/i, newAttr);
    out = out.replace(tag, newTag);
  }
  return out;
}
