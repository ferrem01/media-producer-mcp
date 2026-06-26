/**
 * Video Encoder
 *
 * Uses ffmpeg to encode frame sequences into video files
 * and compose multiple scenes with transitions and audio.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

/** Standard web-compatible encoding args used everywhere. */
const WEB_ENCODE_ARGS = [
  "-c:v", "libx264",
  "-profile:v", "high",
  "-level", "4.0",
  "-preset", "medium",
  "-crf", "18",
  "-maxrate", "16M",
  "-bufsize", "32M",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
] as const;

export interface EncodeSceneOptions {
  /** Directory containing frame-XXXXXX.png files */
  framesDir: string;
  /** Output MP4 path */
  outputPath: string;
  /** Frames per second */
  fps: number;
  /** Frame image format */
  format?: "png" | "jpeg";
}

export interface ConcatOptions {
  /** Ordered list of scene MP4 paths */
  scenes: string[];
  /** Output MP4 path */
  outputPath: string;
  /** Transitions between scenes (index i = transition between scene i and i+1) */
  transitions?: Array<{
    type: string;
    duration_seconds: number;
  }>;
}

/**
 * Encode a frame sequence into an MP4 video.
 */
export async function encodeScene(options: EncodeSceneOptions): Promise<string> {
  const { framesDir, outputPath, fps, format = "png" } = options;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const args = [
    "-y",
    "-framerate", String(fps),
    "-i", path.join(framesDir, `frame-%06d.${format}`),
    ...WEB_ENCODE_ARGS,
    outputPath,
  ];

  console.log(`  Encoding: ${framesDir} -> ${outputPath}`);
  const { stderr } = await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });

  // Check output file exists
  try {
    const stat = await fs.stat(outputPath);
    console.log(`  Encoded: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } catch {
    throw new Error(`ffmpeg encoding failed. stderr: ${stderr}`);
  }

  return outputPath;
}

/**
 * Concatenate multiple scene videos into a single video.
 * Supports transitions between scenes using ffmpeg xfade filter.
 */
export async function concatScenes(options: ConcatOptions): Promise<string> {
  const { scenes, outputPath, transitions } = options;

  if (scenes.length === 0) {
    throw new Error("No scenes to concatenate");
  }

  if (scenes.length === 1) {
    // Just copy the single scene
    await fs.copyFile(scenes[0], outputPath);
    return outputPath;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // If no transitions, use simple concat demuxer
  if (!transitions || transitions.every((t) => t.type === "none")) {
    return concatSimple(scenes, outputPath);
  }

  // Use xfade filter for transitions
  return concatWithTransitions(scenes, outputPath, transitions);
}

/**
 * Concatenate video segments using simple concat demuxer.
 * Used for the new GSAP-transition pipeline where transitions
 * are already rendered as their own video segments.
 */
export async function concatSegments(segments: string[], outputPath: string): Promise<string> {
  if (segments.length === 0) throw new Error("No segments to concatenate");
  if (segments.length === 1) {
    await fs.copyFile(segments[0], outputPath);
    return outputPath;
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  return concatSimple(segments, outputPath);
}

/**
 * Simple concat without transitions.
 */
async function concatSimple(scenes: string[], outputPath: string): Promise<string> {
  // Create concat list file
  const listPath = outputPath + ".concat.txt";
  const listContent = scenes.map((s) => `file '${path.resolve(s)}'`).join("\n");
  await fs.writeFile(listPath, listContent);

  const args = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    outputPath,
  ];

  try {
    await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });
    return outputPath;
  } finally {
    await fs.unlink(listPath).catch(() => {});
  }
}

/**
 * Concat with xfade transitions between scenes.
 */
async function concatWithTransitions(
  scenes: string[],
  outputPath: string,
  transitions: Array<{ type: string; duration_seconds: number }>,
): Promise<string> {
  // Build ffmpeg filter graph for xfade
  const inputs: string[] = [];
  const filterParts: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    inputs.push("-i", scenes[i]);
  }

  // Chain xfade filters
  // scene0 xfade scene1 -> tmp1, tmp1 xfade scene2 -> tmp2, etc.
  let prevLabel = "[0:v]";
  let offset = 0;

  for (let i = 0; i < scenes.length - 1; i++) {
    const transition = transitions[i] || { type: "fade", duration_seconds: 0.5 };
    const xfadeType = mapTransitionType(transition.type);
    const dur = transition.duration_seconds;

    // Get duration of current scene to compute offset
    const sceneDur = await getVideoDuration(scenes[i]);
    if (i === 0) {
      offset = sceneDur - dur;
    } else {
      offset = offset + (await getVideoDuration(scenes[i])) - dur;
    }

    const nextLabel = i === scenes.length - 2 ? "[vout]" : `[v${i + 1}]`;

    filterParts.push(
      `${prevLabel}[${i + 1}:v]xfade=transition=${xfadeType}:duration=${dur}:offset=${offset.toFixed(3)}${nextLabel}`
    );

    prevLabel = nextLabel;
  }

  const filterComplex = filterParts.join("; ");

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    ...WEB_ENCODE_ARGS,
    outputPath,
  ];

  console.log(`  Concatenating ${scenes.length} scenes with transitions`);
  await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });
  return outputPath;
}

/**
 * Map our transition type names to ffmpeg xfade transition names.
 */
function mapTransitionType(type: string): string {
  const map: Record<string, string> = {
    "crossfade": "fade",
    "fade": "fade",
    "wipe-left": "wipeleft",
    "wipe-right": "wiperight",
    "slide-up": "slideup",
    "slide-down": "slidedown",
    "iris": "circleopen",
    "none": "fade",
  };
  return map[type] || "fade";
}

export interface EncodeGifOptions {
  /** Directory containing frame-XXXXXX.png files */
  framesDir: string;
  /** Output GIF path */
  outputPath: string;
  /** Frames per second */
  fps: number;
  /** Output width (default 800) */
  width?: number;
  /** Output height (auto-scaled if omitted) */
  height?: number;
}

/**
 * Encode a frame sequence into an animated GIF using ffmpeg palette generation.
 */
export async function encodeGif(options: EncodeGifOptions): Promise<string> {
  const { framesDir, outputPath, fps, width = 800 } = options;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const scaleFilter = options.height
    ? `scale=${width}:${options.height}:flags=lanczos`
    : `scale=${width}:-1:flags=lanczos`;

  const filterComplex = `fps=${fps},${scaleFilter},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

  const args = [
    "-y",
    "-framerate", String(fps),
    "-i", path.join(framesDir, "frame-%06d.png"),
    "-vf", filterComplex,
    outputPath,
  ];

  console.log(`  Encoding GIF: ${framesDir} -> ${outputPath}`);
  const { stderr } = await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });

  try {
    const stat = await fs.stat(outputPath);
    console.log(`  GIF encoded: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } catch {
    throw new Error(`ffmpeg GIF encoding failed. stderr: ${stderr}`);
  }

  return outputPath;
}

/**
 * Get video duration using ffprobe.
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  return parseFloat(stdout.trim());
}
