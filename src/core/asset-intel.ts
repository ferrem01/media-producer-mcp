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

  const measure = (prof: AxisProfile, fromEnd: boolean, srcPerLine: number, minSrcPx: number): EdgeTrim => {
    const maxBand = Math.floor(prof.activity.length * MAX_BAND_FRACTION);
    const band = staticBandFromEdge(prof, fromEnd, threshold, maxBand);
    const px = Math.round(band * srcPerLine);
    if (px < minSrcPx) return { px: 0, reason: null };
    return { px, reason: classifyBand(prof, fromEnd, band) };
  };

  // Letterbox bars can be thin; chrome must clear MIN_CHROME_SRC_PX. Apply the
  // stricter floor only when the band classifies as chrome.
  const finalize = (t: EdgeTrim): EdgeTrim =>
    t.reason === "static-chrome" && t.px < MIN_CHROME_SRC_PX ? { px: 0, reason: null } : t;

  const trims = {
    top: finalize(measure(rows, false, srcPerRow, 4)),
    bottom: finalize(measure(rows, true, srcPerRow, 4)),
    left: finalize(measure(cols, false, srcPerCol, 4)),
    right: finalize(measure(cols, true, srcPerCol, 4)),
  };

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
export async function analyzeAndSaveIntel(filePath: string): Promise<AssetIntel | null> {
  const intel = await analyzeVideoAsset(filePath);
  if (intel) await fs.writeFile(sidecarPath(filePath), JSON.stringify(intel, null, 2)).catch(() => {});
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
