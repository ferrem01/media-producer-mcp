/**
 * Speaker Track Pipeline
 *
 * Implements the continuous speaker base layer architecture.
 *
 * Architecture:
 *   - Speaker track: one or more clips concatenated into a single continuous video
 *   - Content overlay: transparent PNG sequence composited on top in a single pass
 *   - No per-scene seeks or re-encoding of speaker video (preserves audio sync)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import type { SpeakerTrack } from "./types.js";

const execFileAsync = promisify(execFile);

// ── Helpers ──

/**
 * Check whether a media file has an audio stream.
 */
async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      filePath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the duration of a media file in seconds via ffprobe.
 */
async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    filePath,
  ]);
  return parseFloat(stdout.trim()) || 0;
}

// ── Speaker Base Builder ──

/**
 * Build a single continuous speaker base video from one or more clips.
 *
 * Rules:
 *  - Clips are played end-to-end in order.
 *  - Each clip honours start/trim_start/trim_end to skip dead air.
 *  - The result is scaled to the canvas dimensions.
 *  - If the clips run shorter than totalDuration, the last frame freezes.
 *  - If the clips run longer, the output is truncated to totalDuration.
 *
 * @returns Path to the output mp4 (= opts.outputPath)
 */
export async function buildSpeakerBase(opts: {
  speakerTrack: SpeakerTrack;
  totalDuration: number;
  width: number;
  height: number;
  outputPath: string;
  /** Working directory for intermediate concat files */
  workDir?: string;
}): Promise<string> {
  const { speakerTrack, totalDuration, width, height, outputPath } = opts;
  const workDir = opts.workDir ?? path.dirname(outputPath);

  await fs.mkdir(workDir, { recursive: true });

  const { clips } = speakerTrack;
  if (clips.length === 0) {
    throw new Error("speaker_track.clips must have at least one entry");
  }

  console.log(`  [speaker-track] Building speaker base: ${clips.length} clip(s), totalDuration=${totalDuration}s`);

  // ── Single clip, simple case ──
  if (clips.length === 1) {
    const clip = clips[0];
    const args = buildSingleClipArgs(clip, width, height, totalDuration, outputPath);
    console.log(`  [speaker-track] ffmpeg single-clip: ${args.filter(a => !a.startsWith('-')).join(' ')}`);
    await execFileAsync("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
    return outputPath;
  }

  // ── Multiple clips: concat + scale + trim ──
  // Step 1: prepare each clip individually (apply start/trim, scale)
  const clipPaths: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipOut = path.join(workDir, `speaker_clip_${i}.mp4`);
    const args = buildSingleClipArgs(clip, width, height, undefined, clipOut);
    console.log(`  [speaker-track] Preparing clip ${i + 1}/${clips.length}`);
    await execFileAsync("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
    clipPaths.push(clipOut);
  }

  // Step 2: concat all prepared clips
  const concatListPath = path.join(workDir, "speaker_concat.txt");
  const concatList = clipPaths.map(p => `file '${p}'`).join("\n");
  await fs.writeFile(concatListPath, concatList);

  const speakerHasAudio = await hasAudioStream(clipPaths[0]);

  const concatArgs: string[] = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
  ];

  if (speakerHasAudio) {
    concatArgs.push(
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "192k",
      "-t", String(totalDuration),
      outputPath,
    );
  } else {
    concatArgs.push(
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      "-t", String(totalDuration),
      outputPath,
    );
  }

  console.log(`  [speaker-track] Concatenating ${clipPaths.length} speaker clips`);
  await execFileAsync("ffmpeg", concatArgs, { maxBuffer: 50 * 1024 * 1024 });

  // Clean up intermediate clips
  for (const p of clipPaths) {
    await fs.unlink(p).catch(() => {});
  }
  await fs.unlink(concatListPath).catch(() => {});

  return outputPath;
}

/**
 * Build ffmpeg args for a single clip with optional trimming and scaling.
 * If totalDuration is provided the output will be truncated/padded to that length.
 */
function buildSingleClipArgs(
  clip: { source: string; start?: number; trim_start?: number; trim_end?: number },
  width: number,
  height: number,
  totalDuration: number | undefined,
  outputPath: string,
): string[] {
  const trimStart = clip.trim_start ?? clip.start ?? 0;
  const trimEnd = clip.trim_end;

  const args: string[] = ["-y"];

  // Seek before input for fast seek (less accurate but much faster for long files)
  if (trimStart > 0) {
    args.push("-ss", String(trimStart));
  }

  args.push("-i", clip.source);

  // Duration from trim_start to trim_end
  if (trimEnd !== undefined) {
    const clipDuration = trimEnd - trimStart;
    if (clipDuration > 0) {
      args.push("-t", String(clipDuration));
    }
  } else if (totalDuration !== undefined) {
    args.push("-t", String(totalDuration));
  }

  // Scale to canvas dimensions, preserve aspect ratio with letterbox/pillarbox black
  args.push(
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "192k",
    outputPath,
  );

  return args;
}

// ── Content Overlay Compositor ──

/**
 * Composite a continuous PNG frame sequence (with alpha) on top of the speaker base video.
 *
 * This is the single-pass final composite:
 *   - Input 0: speaker video (base layer, provides audio)
 *   - Input 1: PNG sequence frames (content with alpha transparency)
 *   - Output: speaker plays through with content overlaid
 *
 * For v1, PiP is not supported in the speaker track path. If pip_segments exist
 * they are silently ignored here (handled by the old overlay system if needed).
 *
 * @returns Path to the output mp4 (= opts.outputPath)
 */
export async function compositeContentOverlay(opts: {
  speakerVideoPath: string;
  contentFramesDir: string;
  fps: number;
  outputPath: string;
  pipSegments?: SpeakerTrack["pip_segments"];
  width: number;
  height: number;
}): Promise<string> {
  const { speakerVideoPath, contentFramesDir, fps, outputPath, width, height } = opts;

  const speakerHasAudio = await hasAudioStream(speakerVideoPath);

  console.log(`  [speaker-track] Compositing content overlay onto speaker base`);
  console.log(`    speaker: ${speakerVideoPath}`);
  console.log(`    frames:  ${contentFramesDir}/frame-%06d.png`);
  console.log(`    output:  ${outputPath}`);

  // Simple overlay: speaker is base, PNG sequence (with alpha) renders on top
  const filterComplex = [
    `[0:v]scale=${width}:${height}[speaker_base]`,
    `[speaker_base][1:v]overlay=0:0:shortest=1[out]`,
  ].join("; ");

  const args: string[] = [
    "-y",
    // Input 0: speaker base video
    "-i", speakerVideoPath,
    // Input 1: content PNG sequence with alpha
    "-framerate", String(fps),
    "-i", path.join(contentFramesDir, "frame-%06d.png"),
    "-filter_complex", filterComplex,
    "-map", "[out]",
  ];

  // Speaker audio is the canonical audio track
  if (speakerHasAudio) {
    args.push("-map", "0:a", "-c:a", "aac", "-b:a", "192k");
  }

  args.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-shortest",
    outputPath,
  );

  await execFileAsync("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });

  return outputPath;
}
