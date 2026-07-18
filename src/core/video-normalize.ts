import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Upload normalization: every video asset must be PLAYABLE IN THE BROWSER,
 * because Studio previews the raw file. The render pipeline decodes with
 * ffmpeg and eats anything -- but a .mov carrying HEVC or ProRes previews as
 * a black rectangle in Chrome, which makes the editing surface useless.
 *
 * Policy:
 *  - h264 in .mp4/.m4v, or vp8/vp9/av1 in .webm  -> keep as-is
 *  - h264 in any other container (.mov, .mkv...) -> REMUX to .mp4 (stream
 *    copy: lossless, seconds even for GB files)
 *  - anything else (hevc, prores, dnxhd, mpeg4)  -> TRANSCODE to h264 .mp4
 * Audio: aac passes through; anything else is encoded to aac.
 * Output always gets +faststart so Range/streaming playback starts fast.
 */

export interface VideoProbe {
  videoCodec: string | null;
  audioCodec: string | null;
}

export interface NormalizeResult {
  /** 'kept' = already web-safe; 'remuxed' = container swap only; 'transcoded' = re-encoded. */
  action: "kept" | "remuxed" | "transcoded";
  /** Final absolute file path (may differ from input when the container changed). */
  filePath: string;
  videoCodec: string | null;
}

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    const errs: Buffer[] = [];
    ff.stderr.on("data", (c) => errs.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => resolve({ code: code ?? -1, stderr: Buffer.concat(errs).toString() }));
  });
}

/** MediaRecorder output (booth takes, extension recordings) streams straight
 *  into the blob with NO duration or seek cues in the container header --
 *  ffprobe reports N/A and every downstream duration probe sees an empty
 *  file. A stream-copy remux rewrites the container with real metadata in
 *  milliseconds. Rewrites in place; failure leaves the original untouched. */
export async function remuxMediaRecorderFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath) || ".webm";
  const tmp = filePath.slice(0, filePath.length - ext.length) + ".remux" + ext;
  const { code } = await runFfmpeg(["-y", "-i", filePath, "-c", "copy", tmp]).catch(() => ({ code: -1, stderr: "" }));
  if (code === 0) {
    await fs.rename(tmp, filePath);
    return true;
  }
  await fs.unlink(tmp).catch(() => {});
  return false;
}

export async function probeVideo(filePath: string): Promise<VideoProbe> {
  const { stderr } = await runFfmpeg(["-i", filePath]).catch(() => ({ code: -1, stderr: "" }));
  const v = stderr.match(/Stream[^\n]*Video:\s*([a-z0-9_]+)/i);
  const a = stderr.match(/Stream[^\n]*Audio:\s*([a-z0-9_]+)/i);
  return { videoCodec: v ? v[1].toLowerCase() : null, audioCodec: a ? a[1].toLowerCase() : null };
}

const WEB_SAFE_MP4 = new Set(["h264", "av1"]);
const WEB_SAFE_WEBM = new Set(["vp8", "vp9", "av1"]);

/** Normalize an uploaded video in place. Non-video files and probe failures
 *  are left untouched (action 'kept'). The input file is deleted when a new
 *  container/encode replaces it. */
export async function normalizeVideoForWeb(filePath: string): Promise<NormalizeResult> {
  const ext = path.extname(filePath).toLowerCase();
  if (![".mov", ".mp4", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg"].includes(ext)) {
    return { action: "kept", filePath, videoCodec: null };
  }
  const probe = await probeVideo(filePath);
  if (!probe.videoCodec) return { action: "kept", filePath, videoCodec: null };

  const safeInMp4 = (ext === ".mp4" || ext === ".m4v") && WEB_SAFE_MP4.has(probe.videoCodec);
  const safeInWebm = ext === ".webm" && WEB_SAFE_WEBM.has(probe.videoCodec);
  if (safeInMp4 || safeInWebm) return { action: "kept", filePath, videoCodec: probe.videoCodec };

  const outPath = filePath.slice(0, filePath.length - ext.length) + ".mp4";
  const tmpPath = outPath + `.norm-tmp.mp4`;
  const audioArgs = probe.audioCodec === "aac" ? ["-c:a", "copy"]
    : probe.audioCodec ? ["-c:a", "aac", "-b:a", "160k"] : ["-an"];

  if (probe.videoCodec === "h264") {
    // Right codec, wrong container: lossless remux.
    const { code, stderr } = await runFfmpeg([
      "-y", "-loglevel", "error", "-i", filePath,
      "-c:v", "copy", ...audioArgs, "-movflags", "+faststart", tmpPath,
    ]);
    if (code !== 0) {
      await fs.unlink(tmpPath).catch(() => {});
      console.warn(`  normalize: remux failed (${stderr.slice(-200)}) -- keeping original`);
      return { action: "kept", filePath, videoCodec: probe.videoCodec };
    }
    await fs.rename(tmpPath, outPath);
    if (outPath !== filePath) await fs.unlink(filePath).catch(() => {});
    return { action: "remuxed", filePath: outPath, videoCodec: "h264" };
  }

  // Browser-hostile codec (hevc/prores/...): full transcode.
  const { code, stderr } = await runFfmpeg([
    "-y", "-loglevel", "error", "-i", filePath,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
    ...audioArgs, "-movflags", "+faststart", tmpPath,
  ]);
  if (code !== 0) {
    await fs.unlink(tmpPath).catch(() => {});
    console.warn(`  normalize: transcode failed (${stderr.slice(-200)}) -- keeping original`);
    return { action: "kept", filePath, videoCodec: probe.videoCodec };
  }
  await fs.rename(tmpPath, outPath);
  if (outPath !== filePath) await fs.unlink(filePath).catch(() => {});
  return { action: "transcoded", filePath: outPath, videoCodec: probe.videoCodec };
}
