/**
 * Take sanitizer -- runs once when a booth recording is attached to a project
 * (POST /api/take). Makes the phone's file say the same thing to every
 * consumer, in place:
 *
 *  1. ORIENTATION IS BAKED. iOS Safari's MediaRecorder stores the sensor's
 *     frames sideways and writes a rotation matrix that players apply at
 *     display time. That tag is HONEST -- honoring it gives the upright
 *     picture (measured live on proj_c210e5e1: honored, upright landscape;
 *     stripped, the speaker on his side). But three consumers read it three
 *     ways (ffmpeg's autorotate, Chromium's <video>, the MP4 muxer on a
 *     stream copy), so the frames are re-encoded upright and the tag goes
 *     to identity: what is stored is what is shown.
 *
 *  2. THE FRAME THE BOOTH SHOWED. The phone's live preview is a cover-crop of
 *     the stream into the booth's portrait screen; the sensor frame behind
 *     it can be wider (iOS delivers the landscape sensor frame for a
 *     portrait request). When the upright take is WIDER than the film's
 *     canvas, the center column at the canvas aspect is cropped and scaled
 *     to the canvas -- the picture the speaker was looking at. A take
 *     TALLER than the canvas (a phone take on a 16:9 film) is PILLARBOXED:
 *     scaled to the canvas height and padded to its width on a dark field,
 *     so the film shows the whole portrait with side bars. Left alone it
 *     went through <video> as object-fit: cover and zoomed into the face
 *     (measured live, proj_179c8dfa).
 *
 *  2b. HDR BECOMES SDR. An iPhone shooting HDR writes HLG (bt2020, 10-bit);
 *     re-encoded as 8-bit yuv420p without a tone map and played as bt709 it
 *     comes out grey and washed out, and every later measure (the studio
 *     correction, the matte) reads the wrong numbers. The take is tone-mapped
 *     to SDR bt709 once, here (hdrToSdrFilter).
 *
 *  3. A QUIET VOICE. A phone at arm's length in a room lands around -35
 *     LUFS; dialogue that will carry a film wants about -16. Two-pass linear
 *     loudnorm so the take is not crushed.
 *
 * Everything done lands on the take's record in `project.takes[]`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { measureTake, studioGradeFilter, type FaceHint, type TakeStudioStats, type TakeStudioCorrection } from "./take-studio.js";

const execFileAsync = promisify(execFile);

/** Dialogue-only take target. The final MIX has its own target; this only
 *  makes the voice a usable stem. */
export const TAKE_LOUDNESS_TARGET_LUFS = -16;
/** Skip normalization when the take is already this close. */
const LOUDNESS_TOLERANCE_LU = 1;
/** Aspect ratios closer than this are the same frame (a 1078x1920 phone
 *  encode is 9:16). */
const ASPECT_TOLERANCE = 0.02;

export interface TakeProbe {
  /** Stored frame dimensions, before any rotation tag. */
  width: number;
  height: number;
  /** Display rotation from the container tag, degrees; 0 when untagged. */
  rotation: number;
  hasAudio: boolean;
  duration: number;
  /** HDR transfer read off the stream (iPhone HDR video is HLG; some
   *  cameras and screen tools write PQ). Absent for SDR. */
  hdr?: "hlg" | "pq";
  /** The stream says full range ("pc"); absent = limited ("tv") or untagged. */
  fullRange?: boolean;
}

export interface TakeSanitizeResult {
  /** The rotation that was baked into the frames (0 = tag was identity). */
  rotation_baked: number;
  /** Upright dimensions of the take BEFORE any reframe. */
  oriented: { width: number; height: number };
  /** Set when the wide take was center-cropped to the canvas frame. */
  reframed?: { from: string; to: string; mode?: "crop" | "pillarbox" };
  /** Integrated loudness before, and the target it was normalized to (absent
   *  when no audio or already within tolerance). */
  loudness?: { measured_lufs: number; normalized_to_lufs?: number };
  /** Set when an HDR take was tone-mapped to SDR bt709 (`fallback`: the
   *  ffmpeg build had no zscale; the approximate colorspace path ran). */
  tonemapped?: { from: "hlg" | "pq"; fallback?: boolean };
  probe: TakeProbe;
}

/** `ffmpeg -hide_banner -i file` exits non-zero (no output requested) but
 *  prints the stream table to stderr. One tool, every environment -- the
 *  static ffmpeg builds used in sandboxes ship no ffprobe. */
async function ffmpegStderr(args: string[]): Promise<string> {
  try {
    const { stderr } = await execFileAsync("ffmpeg", ["-hide_banner", ...args], { maxBuffer: 16 * 1024 * 1024 });
    return String(stderr || "");
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new Error("ffmpeg not found on PATH");
    return String(e?.stderr || "");
  }
}

export async function probeTake(filePath: string): Promise<TakeProbe> {
  const table = await ffmpegStderr(["-i", filePath]);
  const video = table.match(/Stream #\d+:\d+.*: Video: .*?\s(\d{2,5})x(\d{2,5})/);
  if (!video) throw new Error(`no video stream in ${path.basename(filePath)}`);
  // Side data (ffmpeg >= 5) or the legacy metadata tag -- whichever the
  // container carries; the side-data line wins when both are present.
  const matrix = table.match(/displaymatrix: rotation of (-?[\d.]+) degrees/);
  const legacy = table.match(/^\s*rotate\s*:\s*(-?\d+)/m);
  const rotation = matrix ? Number(matrix[1]) : legacy ? Number(legacy[1]) : 0;
  const dur = table.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const duration = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
  // The pixel format's colour tuple: "yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67)".
  const vline = table.match(/Stream #\d+:\d+.*: Video: .*/)?.[0] || "";
  const hdr = /arib-std-b67/.test(vline) ? "hlg" as const : /smpte2084/.test(vline) ? "pq" as const : undefined;
  return {
    ...(hdr ? { hdr } : {}),
    ...(/\(pc[,)]/.test(vline) ? { fullRange: true } : {}),
    width: Number(video[1]),
    height: Number(video[2]),
    rotation: Number.isFinite(rotation) ? Math.round(rotation) : 0,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(table),
    duration,
  };
}

/** Dimensions of the take as a player honoring its tag shows it. */
export function orientedDims(p: Pick<TakeProbe, "width" | "height" | "rotation">): { width: number; height: number } {
  const quarter = Math.abs(((p.rotation % 360) + 360) % 360 - 180) === 90;
  return quarter ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
}

/** The crop that turns an upright take WIDER than the canvas into the
 *  canvas frame: the center column at the canvas aspect. Null when the take
 *  already fits (same aspect) or is taller than the canvas. */
/** The pad for a take taller than the canvas: its height fits the canvas,
 *  the width is filled with the field color either side. */
export const PILLARBOX_COLOR = "0x0c0d12";
export function reframePad(
  take: { width: number; height: number },
  canvas: { width: number; height: number },
): { w: number; h: number } | null {
  const takeAspect = take.width / take.height;
  const canvasAspect = canvas.width / canvas.height;
  if (Math.abs(takeAspect - canvasAspect) / canvasAspect <= ASPECT_TOLERANCE) return null;
  if (takeAspect >= canvasAspect) return null;
  const w = Math.round((canvas.height * takeAspect) / 2) * 2;
  return { w, h: canvas.height };
}

export function reframeCrop(
  take: { width: number; height: number },
  canvas: { width: number; height: number },
): { w: number; h: number; x: number; y: number } | null {
  const takeAspect = take.width / take.height;
  const canvasAspect = canvas.width / canvas.height;
  if (Math.abs(takeAspect - canvasAspect) / canvasAspect <= ASPECT_TOLERANCE) return null;
  if (takeAspect < canvasAspect) return null;
  // Even dimensions keep yuv420p happy.
  const w = Math.round((take.height * canvasAspect) / 2) * 2;
  return { w, h: take.height, x: Math.round((take.width - w) / 4) * 2, y: 0 };
}

/** HDR -> SDR bt709. zscale linearizes the HLG/PQ signal with diffuse white
 *  at 203 nits (ITU-R BT.2408's reference white, where an iPhone puts a
 *  white wall) as 1.0, converts bt2020 primaries to bt709, and mobius
 *  keeps everything up to that white linear while rolling the speculars
 *  above it off (hable and reinhard darkened the midtones: measured on an
 *  SDR clip taken to HLG and back, mean rgb 133.5 -> mobius 130.5, hable
 *  87, reinhard 122). Without zscale (an ffmpeg built without libzimg),
 *  `colorspace` converts the primaries treating the signal as bt2020
 *  gamma, and a curve lifts reference white (HLG 0.75) back toward 1:
 *  the same round trip measured 135.9 -- approximate, but not grey. */
export function hdrToSdrFilter(hdr: "hlg" | "pq", o: { fallback?: boolean; fullRange?: boolean } = {}): string {
  const tin = hdr === "hlg" ? "arib-std-b67" : "smpte2084";
  if (o.fallback) {
    // PQ's reference white sits at ~0.58 of the signal, HLG's at 0.75.
    const w = hdr === "hlg" ? 0.75 : 0.58;
    return `colorspace=all=bt709:iall=bt2020:itrc=bt2020-10:format=yuv420p,curves=all='0/0 ${w / 2}/0.42 ${w}/0.86 1/1'`;
  }
  // Every input property is stated: zscale finds "no path between
  // colorspaces" when one is missing from the stream (measured: an
  // untagged range fails), and HDR video is limited range unless it says.
  return `zscale=tin=${tin}:pin=bt2020:min=bt2020nc:rin=${o.fullRange ? "pc" : "tv"}:t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`;
}

/** Integrated loudness in LUFS (EBU R128), or null when unmeasurable. Read
 *  from loudnorm's own first pass -- the same numbers the normalizing pass
 *  uses -- because the ebur128 summary line differs across ffmpeg builds
 *  (the deployed 4.x reported 0 for every take). */
export async function measureLoudness(filePath: string): Promise<number | null> {
  const m = await loudnormMeasure(filePath);
  const v = m ? Number(m.input_i) : NaN;
  // loudnorm reports -70 (or -inf) for digital silence; treat it as unmeasurable.
  return Number.isFinite(v) && v > -69 ? v : null;
}

/** First loudnorm pass: the measured values the second pass needs. */
async function loudnormMeasure(filePath: string): Promise<Record<string, string> | null> {
  const out = await ffmpegStderr([
    "-i", filePath, "-vn",
    "-af", `loudnorm=I=${TAKE_LOUDNESS_TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json`,
    "-f", "null", "-",
  ]);
  const json = out.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!json) return null;
  try { return JSON.parse(json[0]); } catch { return null; }
}

/**
 * Sanitize a take IN PLACE. `canvas` is the film's frame; pass it so a wide
 * take is reframed to it. Never throws on a defect it cannot fix -- the
 * caller attaches the take regardless and the report says what was done.
 */
/** The "soft" look: a phone camera at arm's length is unflattering in a
 *  way a gentle grade fixes. Two parts:
 *  - the BASE, always on: temporal denoise, a touch of warmth and contrast
 *    (the whole look until 2026-09-25; Marc: "it doesn't entirely look like
 *    it was on");
 *  - SKIN SMOOTHING on a dial, `strength` 0-1: an edge-preserving bilateral
 *    blur that flattens skin texture and keeps eyes, hair and beard sharp.
 *    0 is the base alone; 0.5 is the level Marc picked on a side-by-side.
 *  `baseSoft`: the source already carries the base (a take graded before
 *  the dial existed, whose original was not kept) -- add the smoothing only. */
export const DEFAULT_SOFT_STRENGTH = 0.5;
const SOFT_BASE = "hqdn3d=4:3:6:4,eq=contrast=1.02:brightness=0.02:saturation=1.05,colorbalance=rm=0.02:bm=-0.02";
export function softLookFilter(strength: number = DEFAULT_SOFT_STRENGTH, opts: { baseSoft?: boolean; fallback?: boolean } = {}): string {
  const s = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : DEFAULT_SOFT_STRENGTH));
  const parts: string[] = opts.baseSoft ? [] : [SOFT_BASE];
  if (s > 0.001) {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    // An ffmpeg without `bilateral` (older than 4.4) gets smartblur, the
    // same idea (blur the flat areas, spare the outlines) and far older.
    parts.push(opts.fallback
      ? `smartblur=lr=${r(1 + 3 * s)}:ls=${r(0.35 + 0.55 * s)}:lt=${r(-2 - 6 * s)}`
      : `bilateral=sigmaS=${r(2 + 8 * s)}:sigmaR=${r(0.02 + 0.08 * s)}`);
  }
  return parts.length ? parts.join(",") : "null";
}
/** The base alone (strength 0). */
export const SOFT_LOOK_FILTER = softLookFilter(0);
export type TakeLook = "natural" | "soft";

/** Where a take's ungraded original is kept, beside it (dot-file: never a
 *  listed asset). Every grade starts from it, so the dial goes both ways. */
export function ungradedPathOf(filePath: string): string {
  const ext = path.extname(filePath) || ".mp4";
  return path.join(path.dirname(filePath), `.${path.basename(filePath, ext)}.ungraded${ext}`);
}

export interface TakeGradeResult {
  look: TakeLook;
  strength?: number;
  /** The kept original. */
  ungraded: string;
  /** The kept original already carries the base grade. */
  baseSoft: boolean;
  /** The studio correction was asked for (core/take-studio.ts). */
  correct: boolean;
  /** What the studio correction measured and applied (absent when not
   *  asked for, or when the take could not be measured). */
  studio?: { measured: TakeStudioStats; applied: TakeStudioCorrection };
  ms: number;
}

/**
 * Grade a take IN PLACE from its kept original (made on first use: a copy
 * of the file as it stands -- `currentLook` says whether that copy already
 * carries the base). Two passes stacked in one encode, in this order:
 *  - the STUDIO CORRECTION (`correct: true`; core/take-studio.ts): white
 *    balance, a warm key pulled off the skin, exposure, a shadow curve --
 *    measured off the kept original (or `stats`, measured before: the
 *    original never changes, so neither do they);
 *  - the LOOK: 'soft' adds the soft grade on its dial; 'natural' adds
 *    nothing.
 * 'natural' without a correction (or with one that measured nothing worth
 * doing) puts the original back byte for byte.
 */
export async function gradeTake(filePath: string, o: {
  look: TakeLook; strength?: number; currentLook?: TakeLook;
  correct?: boolean; stats?: TakeStudioStats; face?: FaceHint | null;
}): Promise<TakeGradeResult> {
  const t0 = Date.now();
  const ungraded = ungradedPathOf(filePath);
  const markerPath = `${ungraded}.soft`;
  const exists = async (f: string) => fs.stat(f).then(() => true, () => false);
  if (!(await exists(ungraded))) {
    await fs.copyFile(filePath, ungraded);
    if (o.currentLook === "soft") await fs.writeFile(markerPath, "the kept original already carries the soft base\n");
  }
  const baseSoft = await exists(markerPath);
  const correct = o.correct === true;
  let studio: TakeGradeResult["studio"];
  if (correct) {
    // A take that cannot be measured is graded without the correction --
    // never held back by it.
    try {
      const measured = o.stats?.v === 1 ? o.stats : await measureTake(ungraded, { duration: (await probeTake(ungraded)).duration, face: o.face });
      studio = { measured, applied: studioGradeFilter(measured) };
    } catch (e: any) {
      console.warn(`  take grade: studio correction skipped for ${path.basename(filePath)}: ${e?.message || e}`);
    }
  }
  const studioVf = studio && studio.applied.filter !== "null" ? studio.applied.filter : "";
  const ext = path.extname(filePath) || ".mp4";
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath, ext)}.grading${ext}`);
  if (o.look === "natural" && !studioVf) {
    await fs.copyFile(ungraded, tmp);
    await fs.rename(tmp, filePath);
    return { look: "natural", ungraded, baseSoft, correct, studio, ms: Date.now() - t0 };
  }
  const strength = Math.max(0, Math.min(1, o.strength ?? DEFAULT_SOFT_STRENGTH));
  const chain = (fallback: boolean) => [studioVf, o.look === "soft" ? softLookFilter(strength, { baseSoft, fallback }) : ""].filter((x) => x && x !== "null").join(",") || "null";
  const encode = (vf: string) => execFileAsync("ffmpeg", ["-hide_banner", "-y", "-i", ungraded, "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy",
    ...(ext.toLowerCase() !== ".webm" ? ["-movflags", "+faststart"] : []), tmp], { maxBuffer: 16 * 1024 * 1024 });
  try {
    try { await encode(chain(false)); }
    catch (e: any) {
      if (o.look !== "soft" || !/No such filter|bilateral/i.test(String(e?.stderr || e?.message || ""))) throw e;
      await encode(chain(true));
    }
    await fs.rename(tmp, filePath);
  } catch (e: any) {
    await fs.unlink(tmp).catch(() => {});
    throw new Error(`take grade failed: ${String(e?.stderr || e?.message || e).slice(-400)}`);
  }
  return o.look === "soft"
    ? { look: "soft", strength, ungraded, baseSoft, correct, studio, ms: Date.now() - t0 }
    : { look: "natural", ungraded, baseSoft, correct, studio, ms: Date.now() - t0 };
}

export async function sanitizeTake(
  filePath: string,
  canvas?: { width: number; height: number },
): Promise<TakeSanitizeResult> {
  const probe = await probeTake(filePath);
  const rotation = ((probe.rotation % 360) + 360) % 360;
  const bake = rotation !== 0;
  const oriented = orientedDims(probe);
  const crop = canvas ? reframeCrop(oriented, canvas) : null;
  const pad = canvas && !crop ? reframePad(oriented, canvas) : null;

  let measured: number | null = null;
  let normalize = false;
  if (probe.hasAudio) {
    measured = await measureLoudness(filePath);
    normalize = measured !== null && Math.abs(measured - TAKE_LOUDNESS_TARGET_LUFS) > LOUDNESS_TOLERANCE_LU;
  }

  const base: TakeSanitizeResult = {
    rotation_baked: bake ? probe.rotation : 0,
    oriented,
    loudness: measured === null ? undefined : { measured_lufs: round1(measured) },
    probe,
  };
  const hdr = probe.hdr;
  if (!bake && !crop && !pad && !normalize && !hdr) return base;

  const ext = path.extname(filePath) || ".mp4";
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath, ext)}.sanitized${ext}`);
  // ffmpeg applies the rotation tag on decode (autorotate, every version),
  // so a re-encode stores the frames upright with an identity matrix.
  // The video half is built per tone-map path: an ffmpeg without zscale
  // retries on the approximate one.
  const videoArgs = (tmFallback: boolean): string[] => {
    if (!(bake || crop || pad || hdr)) return ["-c:v", "copy"];
    const out: string[] = [];
    const vf: string[] = [];
    // Tone map FIRST, on the decoded HDR frames, before any scale.
    if (hdr) vf.push(hdrToSdrFilter(hdr, { fallback: tmFallback, fullRange: probe.fullRange }));
    if (crop && canvas) vf.push(`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, `scale=${canvas.width}:${canvas.height}`);
    if (pad && canvas) vf.push(`scale=${pad.w}:${pad.h}`, `pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:color=${PILLARBOX_COLOR}`);
    if (vf.length) out.push("-vf", vf.join(","));
    out.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p");
    if (hdr) out.push("-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709");
    return out;
  };
  const args = ["-y", "-i", filePath, "-map", "0:v:0", "@VIDEO@"];
  let normalizedTo: number | undefined;
  if (probe.hasAudio) {
    args.push("-map", "0:a:0");
    if (normalize) {
      const m = await loudnormMeasure(filePath);
      const filter = m
        ? `loudnorm=I=${TAKE_LOUDNESS_TARGET_LUFS}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_LRA=${m.input_lra}:measured_TP=${m.input_tp}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
        : `loudnorm=I=${TAKE_LOUDNESS_TARGET_LUFS}:TP=-1.5:LRA=11`;
      // The container decides the codec: a WebM take (Chrome, Firefox) cannot carry AAC.
      const audioCodec = ext.toLowerCase() === ".webm" ? ["-c:a", "libopus", "-b:a", "128k"] : ["-c:a", "aac", "-b:a", "160k"];
      args.push("-af", filter, ...audioCodec, "-ar", "48000");
      normalizedTo = TAKE_LOUDNESS_TARGET_LUFS;
    } else {
      args.push("-c:a", "copy");
    }
  }
  if (ext.toLowerCase() !== ".webm") args.push("-movflags", "+faststart");
  args.push(tmp);
  const run = (tmFallback: boolean) => execFileAsync("ffmpeg", ["-hide_banner", ...args.flatMap((a) => (a === "@VIDEO@" ? videoArgs(tmFallback) : [a]))], { maxBuffer: 16 * 1024 * 1024 });
  let tmFallback = false;
  try {
    try { await run(false); }
    catch (e: any) {
      if (!hdr || !/No such filter|zscale|tonemap/i.test(String(e?.stderr || e?.message || ""))) throw e;
      tmFallback = true;
      await run(true);
    }
    await fs.rename(tmp, filePath);
  } catch (e: any) {
    await fs.unlink(tmp).catch(() => {});
    throw new Error(`take sanitize failed: ${String(e?.stderr || e?.message || e).slice(-400)}`);
  }

  return {
    ...base,
    reframed: (crop || pad) && canvas ? { from: `${oriented.width}x${oriented.height}`, to: `${canvas.width}x${canvas.height}`, ...(pad ? { mode: "pillarbox" as const } : {}) } : undefined,
    loudness: measured === null ? undefined : { measured_lufs: round1(measured), normalized_to_lufs: normalizedTo },
    ...(hdr ? { tonemapped: { from: hdr, ...(tmFallback ? { fallback: true } : {}) } } : {}),
    probe: await probeTake(filePath),
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
