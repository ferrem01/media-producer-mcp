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
 *     taller than the canvas is left alone (cropping a head off the top is
 *     worse than a pillarbox).
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
}

export interface TakeSanitizeResult {
  /** The rotation that was baked into the frames (0 = tag was identity). */
  rotation_baked: number;
  /** Upright dimensions of the take BEFORE any reframe. */
  oriented: { width: number; height: number };
  /** Set when the wide take was center-cropped to the canvas frame. */
  reframed?: { from: string; to: string };
  /** Integrated loudness before, and the target it was normalized to (absent
   *  when no audio or already within tolerance). */
  loudness?: { measured_lufs: number; normalized_to_lufs?: number };
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
  return {
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
export async function sanitizeTake(
  filePath: string,
  canvas?: { width: number; height: number },
): Promise<TakeSanitizeResult> {
  const probe = await probeTake(filePath);
  const rotation = ((probe.rotation % 360) + 360) % 360;
  const bake = rotation !== 0;
  const oriented = orientedDims(probe);
  const crop = canvas ? reframeCrop(oriented, canvas) : null;

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
  if (!bake && !crop && !normalize) return base;

  const ext = path.extname(filePath) || ".mp4";
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath, ext)}.sanitized${ext}`);
  // ffmpeg applies the rotation tag on decode (autorotate, every version),
  // so a re-encode stores the frames upright with an identity matrix.
  const args = ["-y", "-i", filePath, "-map", "0:v:0"];
  if (bake || crop) {
    const vf: string[] = [];
    if (crop && canvas) vf.push(`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, `scale=${canvas.width}:${canvas.height}`);
    if (vf.length) args.push("-vf", vf.join(","));
    args.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p");
  } else {
    args.push("-c:v", "copy");
  }
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
  try {
    await execFileAsync("ffmpeg", ["-hide_banner", ...args], { maxBuffer: 16 * 1024 * 1024 });
    await fs.rename(tmp, filePath);
  } catch (e: any) {
    await fs.unlink(tmp).catch(() => {});
    throw new Error(`take sanitize failed: ${String(e?.stderr || e?.message || e).slice(-400)}`);
  }

  return {
    ...base,
    reframed: crop && canvas ? { from: `${oriented.width}x${oriented.height}`, to: `${canvas.width}x${canvas.height}` } : undefined,
    loudness: measured === null ? undefined : { measured_lufs: round1(measured), normalized_to_lufs: normalizedTo },
    probe: await probeTake(filePath),
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
