/**
 * Take sanitizer -- runs once when a booth recording is attached to a project
 * (POST /api/take). Two defects real phones ship that would otherwise reach
 * the speaker base untouched:
 *
 *  1. A SPURIOUS ROTATION TAG. iOS Safari's MediaRecorder stores the frames
 *     already upright (1080x1920) and STILL writes a +/-90 degree display
 *     matrix. Every honest player -- ffmpeg's autorotate, Chromium's <video>
 *     -- obeys the tag and shows the take on its side. A booth take is
 *     portrait by construction, so a portrait-stored file tagged sideways is
 *     the bug, never the intent: the tag is dropped, frames untouched. The
 *     tag lives in the MP4's `tkhd` matrix; it is reset to identity by a
 *     direct byte patch (ffmpeg's `-display_rotation` only exists from 6.0,
 *     and the deployed box runs older -- measured live: the first attach
 *     silently skipped).
 *
 *  2. A QUIET VOICE. A phone at arm's length in a room lands around -35 LUFS;
 *     dialogue that will carry a film wants about -16. The audio is
 *     normalized to a dialogue level with a two-pass loudnorm (measure, then
 *     apply the measured values linearly) so the take is not crushed. Video
 *     is stream-copied; only the audio is re-encoded.
 *
 * Everything reported back lands on `project.take` so the measurement is
 * visible next to the file it describes.
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

export interface TakeProbe {
  width: number;
  height: number;
  /** Display rotation from the container tag, degrees; 0 when untagged. */
  rotation: number;
  hasAudio: boolean;
  duration: number;
}

export interface TakeSanitizeResult {
  /** True when a spurious sideways tag was removed from a portrait file. */
  rotation_stripped: boolean;
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
    rotation: Number.isFinite(rotation) ? rotation : 0,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(table),
    duration,
  };
}

/** A portrait-stored file tagged a quarter turn: the tag is the defect. */
export function rotationIsSpurious(p: Pick<TakeProbe, "width" | "height" | "rotation">): boolean {
  const quarter = Math.abs(((p.rotation % 360) + 360) % 360 - 180) === 90;
  return quarter && p.height > p.width;
}

/** Integrated loudness in LUFS (EBU R128), or null when unmeasurable. */
export async function measureLoudness(filePath: string): Promise<number | null> {
  const out = await ffmpegStderr(["-i", filePath, "-vn", "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
  const m = out.match(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/);
  if (!m) return null;
  const v = Number(m[1]);
  // ebur128 reports -70 for digital silence; treat it as unmeasurable.
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

// ── tkhd matrix patch ──
// ISO BMFF: moov > trak > tkhd carries a 3x3 fixed-point display matrix.
// A quarter-turn tag is that matrix; identity is
// [0x00010000 0 0 / 0 0x00010000 0 / 0 0 0x40000000]. Version-independent
// and no remux: 36 bytes rewritten per track that carries a rotation.
const IDENTITY_MATRIX = Buffer.from([
  0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0x00, 0x00, 0x00,
]);

/** Walk the box tree and return the file offset of every tkhd matrix. */
async function tkhdMatrixOffsets(fh: fs.FileHandle, size: number): Promise<number[]> {
  const found: number[] = [];
  const header = Buffer.alloc(16);
  const walk = async (start: number, end: number, want: string[]): Promise<void> => {
    let pos = start;
    while (pos + 8 <= end) {
      await fh.read(header, 0, 16, pos);
      let boxSize = header.readUInt32BE(0);
      const type = header.toString("latin1", 4, 8);
      let hdr = 8;
      if (boxSize === 1) { boxSize = Number(header.readBigUInt64BE(8)); hdr = 16; }
      else if (boxSize === 0) boxSize = end - pos;
      if (boxSize < hdr) return;
      if (type === want[0]) {
        if (want.length === 1) {
          // tkhd: version byte decides the fixed-field widths before the matrix.
          const v = Buffer.alloc(1);
          await fh.read(v, 0, 1, pos + hdr);
          found.push(pos + hdr + (v[0] === 1 ? 52 : 40));
        } else {
          await walk(pos + hdr, pos + boxSize, want.slice(1));
        }
      }
      pos += boxSize;
    }
  };
  await walk(0, size, ["moov", "trak", "tkhd"]);
  return found;
}

/** Reset every non-identity tkhd matrix to identity, in place. Returns how
 *  many tracks were patched. */
export async function stripTkhdRotation(filePath: string): Promise<number> {
  const fh = await fs.open(filePath, "r+");
  try {
    const { size } = await fh.stat();
    const offsets = await tkhdMatrixOffsets(fh, size);
    let patched = 0;
    const cur = Buffer.alloc(36);
    for (const off of offsets) {
      await fh.read(cur, 0, 36, off);
      if (cur.equals(IDENTITY_MATRIX)) continue;
      await fh.write(IDENTITY_MATRIX, 0, 36, off);
      patched++;
    }
    return patched;
  } finally {
    await fh.close();
  }
}

/**
 * Sanitize a take IN PLACE. Returns what changed. Never throws on a
 * defect it cannot fix -- the caller attaches the take regardless and the
 * report says what was and was not done.
 */
export async function sanitizeTake(filePath: string): Promise<TakeSanitizeResult> {
  const probe = await probeTake(filePath);
  const stripRotation = rotationIsSpurious(probe);

  let measured: number | null = null;
  let normalize = false;
  if (probe.hasAudio) {
    measured = await measureLoudness(filePath);
    normalize = measured !== null && Math.abs(measured - TAKE_LOUDNESS_TARGET_LUFS) > LOUDNESS_TOLERANCE_LU;
  }

  if (!stripRotation && !normalize) {
    return {
      rotation_stripped: false,
      loudness: measured === null ? undefined : { measured_lufs: round1(measured) },
      probe,
    };
  }

  // Loudness first (a remux: the muxer copies the rotation through), then
  // the matrix patch on whatever file is final.
  let normalizedTo: number | undefined;
  if (normalize) {
    const ext = path.extname(filePath) || ".mp4";
    const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath, ext)}.sanitized${ext}`);
    const m = await loudnormMeasure(filePath);
    const filter = m
      ? `loudnorm=I=${TAKE_LOUDNESS_TARGET_LUFS}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_LRA=${m.input_lra}:measured_TP=${m.input_tp}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
      : `loudnorm=I=${TAKE_LOUDNESS_TARGET_LUFS}:TP=-1.5:LRA=11`;
    const args = [
      "-y", "-i", filePath, "-map", "0:v:0", "-c:v", "copy", "-map", "0:a:0",
      "-af", filter, "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
      "-movflags", "+faststart", tmp,
    ];
    try {
      await execFileAsync("ffmpeg", ["-hide_banner", ...args], { maxBuffer: 16 * 1024 * 1024 });
      await fs.rename(tmp, filePath);
    } catch (e: any) {
      await fs.unlink(tmp).catch(() => {});
      throw new Error(`take loudness normalize failed: ${String(e?.stderr || e?.message || e).slice(-400)}`);
    }
    normalizedTo = TAKE_LOUDNESS_TARGET_LUFS;
  }
  if (stripRotation) {
    const patched = await stripTkhdRotation(filePath);
    if (patched === 0) throw new Error("take rotation strip failed: no tkhd matrix carried the rotation");
  }

  return {
    rotation_stripped: stripRotation,
    loudness: measured === null ? undefined : { measured_lufs: round1(measured), normalized_to_lufs: normalizedTo },
    probe: await probeTake(filePath),
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
