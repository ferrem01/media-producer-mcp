/**
 * Overlay Compositor
 *
 * Composites speaker video overlays onto rendered scene video using ffmpeg.
 * Supports full-screen, picture-in-picture, and audio-only modes with
 * segment-based timing.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

export interface OverlaySegment {
  start: number;
  end: number;
  mode: "full" | "pip" | "audio-only" | "full-behind";
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  shape?: "circle" | "rounded-rect" | "rect";
  size?: { width: number; height: number };
  border?: { color: string; width: number };
  lower_third?: { name: string; title?: string };
}

export interface CompositeOverlayOptions {
  videoPath: string;
  speakerPath: string;
  segments: OverlaySegment[];
  outputPath: string;
  width: number;
  height: number;
}

export interface CompositeFullBehindOptions {
  /** Directory containing PNG frames with alpha channel (scene content) */
  framesDir: string;
  /** Speaker video path (becomes the base layer) */
  speakerPath: string;
  /** Output video path */
  outputPath: string;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Frames per second */
  fps: number;
  /** Total duration in seconds (used for audio trimming) */
  duration: number;
  /** Offset into the speaker video in seconds (for continuous speaker across scenes) */
  speakerOffset?: number;
}

/**
 * Check if a media file has an audio stream.
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
 * Get video duration in seconds.
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

/**
 * Calculate PiP overlay position coordinates.
 */
function pipPosition(
  pos: string | undefined,
  canvasW: number,
  canvasH: number,
  pipW: number,
  pipH: number,
  margin: number = 40,
): { x: number; y: number } {
  switch (pos) {
    case "bottom-left":
      return { x: margin, y: canvasH - pipH - margin };
    case "top-right":
      return { x: canvasW - pipW - margin, y: margin };
    case "top-left":
      return { x: margin, y: margin };
    case "bottom-right":
    default:
      return { x: canvasW - pipW - margin, y: canvasH - pipH - margin };
  }
}

/**
 * Composite speaker video overlays onto a scene video.
 */
export async function compositeOverlays(opts: CompositeOverlayOptions): Promise<string> {
  const { videoPath, speakerPath, segments, outputPath, width, height } = opts;

  // Clamp segment end times to speaker video duration
  const speakerDuration = await getVideoDuration(speakerPath);
  const videoDuration = await getVideoDuration(videoPath);

  const videoHasAudio = await hasAudioStream(videoPath);
  const speakerHasAudio = await hasAudioStream(speakerPath);

  // Separate video overlay segments from audio-only segments
  const videoSegments = segments.filter((s) => s.mode !== "audio-only");
  const hasVideoOverlays = videoSegments.length > 0;

  // Build ffmpeg filter_complex
  const filters: string[] = [];
  let currentLabel = "0:v";
  let overlayIndex = 0;

  for (const seg of videoSegments) {
    const endTime = seg.end === Infinity ? Math.min(speakerDuration, videoDuration) : Math.min(seg.end, speakerDuration, videoDuration);
    const enable = `between(t,${seg.start},${endTime})`;

    if (seg.mode === "full") {
      // Speaker fills the entire frame
      const scaledLabel = `speaker_full_${overlayIndex}`;
      const outLabel = `out_${overlayIndex}`;
      filters.push(`[1:v]scale=${width}:${height}[${scaledLabel}]`);
      filters.push(`[${currentLabel}][${scaledLabel}]overlay=0:0:enable='${enable}'[${outLabel}]`);
      currentLabel = outLabel;
    } else if (seg.mode === "pip") {
      const pipW = seg.size?.width || Math.round(width * 0.25);
      const pipH = seg.size?.height || Math.round(height * 0.25);
      const pos = pipPosition(seg.position, width, height, pipW, pipH);

      if (seg.shape === "circle") {
        // Center-crop speaker to square, then scale to PiP size, apply circular mask
        const scaledLabel = `pip_scaled_${overlayIndex}`;
        const circLabel = `pip_circ_${overlayIndex}`;
        const outLabel = `out_${overlayIndex}`;
        const cropSize = Math.min(pipW, pipH);
        const radius = cropSize / 2;

        // Center-crop speaker to square then scale. Most speaker videos are landscape,
        // so crop width to match height (ih), centered horizontally.
        filters.push(`[1:v]crop=ih:ih:(iw-ih)/2:0,scale=${cropSize}:${cropSize}[${scaledLabel}]`);
        filters.push(
          `[${scaledLabel}]format=rgba,geq=` +
          `r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
          `a='if(gt(sqrt(pow(X-${cropSize}/2,2)+pow(Y-${cropSize}/2,2)),${Math.floor(radius)}),0,255)'` +
          `[${circLabel}]`
        );
        filters.push(
          `[${currentLabel}][${circLabel}]overlay=${pos.x}:${pos.y}:enable='${enable}'[${outLabel}]`
        );
        currentLabel = outLabel;
      } else {
        // Rectangular or rounded-rect PiP -- preserve aspect ratio
        const scaledLabel = `pip_${overlayIndex}`;
        const outLabel = `out_${overlayIndex}`;
        // Scale to fit within pipW x pipH, crop any overflow
        filters.push(`[1:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=increase,crop=${pipW}:${pipH}[${scaledLabel}]`);

        if (seg.border && seg.border.width > 0) {
          // Add border by padding
          const bw = seg.border.width;
          const borderColor = seg.border.color || "white";
          const borderedLabel = `pip_bordered_${overlayIndex}`;
          filters.push(
            `[${scaledLabel}]pad=` +
            `${pipW + bw * 2}:${pipH + bw * 2}:${bw}:${bw}:color=${borderColor}` +
            `[${borderedLabel}]`
          );
          filters.push(
            `[${currentLabel}][${borderedLabel}]overlay=${pos.x - bw}:${pos.y - bw}:enable='${enable}'[${outLabel}]`
          );
        } else {
          filters.push(
            `[${currentLabel}][${scaledLabel}]overlay=${pos.x}:${pos.y}:enable='${enable}'[${outLabel}]`
          );
        }
        currentLabel = outLabel;
      }
    }

    overlayIndex++;
  }

  // Build the ffmpeg command
  const args: string[] = ["-y", "-i", videoPath, "-i", speakerPath];

  if (hasVideoOverlays && filters.length > 0) {
    // Add audio mixing to the filter complex if needed
    let filterComplex = filters.join("; ");

    if (speakerHasAudio) {
      if (videoHasAudio) {
        // Mix both audio tracks
        filterComplex += `; [0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
        args.push("-filter_complex", filterComplex);
        args.push("-map", `[${currentLabel}]`, "-map", "[aout]");
      } else {
        // Use speaker audio only
        args.push("-filter_complex", filterComplex);
        args.push("-map", `[${currentLabel}]`, "-map", "1:a");
      }
    } else {
      // No speaker audio
      args.push("-filter_complex", filterComplex);
      args.push("-map", `[${currentLabel}]`);
      if (videoHasAudio) {
        args.push("-map", "0:a");
      }
    }
  } else if (speakerHasAudio) {
    // Audio-only mode: no video overlay, just mix audio
    if (videoHasAudio) {
      args.push(
        "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        "-map", "0:v", "-map", "[aout]",
      );
    } else {
      args.push("-map", "0:v", "-map", "1:a");
    }
  } else {
    // No overlays and no speaker audio -- just copy
    args.push("-map", "0:v");
    if (videoHasAudio) args.push("-map", "0:a");
  }

  // Output encoding
  args.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-shortest",
    "-t", String(videoDuration),
    outputPath,
  );

  console.log(`  Compositing overlays: ${videoSegments.length} video segments`);

  await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });

  return outputPath;
}

/**
 * Composite scene PNG frames (with alpha) ON TOP of the speaker video.
 * This is the "full-behind" mode: speaker fills the entire frame as the
 * base layer, and the HTML scene (with transparent background) renders
 * on top, so animated components appear beside the speaker's face.
 *
 * Input frames must be PNGs with alpha transparency.
 * The speaker video is scaled to fill the full canvas.
 *
 * ffmpeg filter:
 *   [speaker_scaled][scene_pngs]overlay=0:0:shortest=1
 */
export async function compositeFullBehind(opts: CompositeFullBehindOptions): Promise<string> {
  const { framesDir, speakerPath, outputPath, width, height, fps, duration, speakerOffset } = opts;

  const speakerHasAudio = await hasAudioStream(speakerPath);

  // ffmpeg reads PNGs as an image sequence (input 0 = speaker video, input 1 = PNG sequence)
  const filterComplex = [
    `[0:v]scale=${width}:${height}[speaker_base]`,
    `[speaker_base][1:v]overlay=0:0:shortest=1[out]`,
  ].join("; ");

  const args: string[] = [
    "-y",
    // Input 0: speaker video (seek to offset for continuous playback)
    ...(speakerOffset ? ["-ss", String(speakerOffset)] : []),
    "-i", speakerPath,
    // Input 1: PNG sequence with alpha
    "-framerate", String(fps),
    "-i", `${framesDir}/frame-%06d.png`,
  ];

  args.push("-filter_complex", filterComplex);
  args.push("-map", "[out]");

  // Do NOT include speaker audio per-scene -- audio is laid as one
  // continuous track after all scenes are concatenated (see mixSpeakerAudio).

  // Output encoding
  args.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-t", String(duration),
    outputPath,
  );

  console.log(`  Compositing full-behind: speaker base + PNG sequence overlay`);

  await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });

  return outputPath;
}

/**
 * Mix speaker audio onto the final concatenated video as one continuous track.
 * This preserves audio continuity across scene boundaries.
 */
export async function mixSpeakerAudio(opts: {
  videoPath: string;
  speakerPath: string;
  outputPath: string;
}): Promise<string> {
  const { videoPath, speakerPath, outputPath } = opts;

  const videoHasAudio = await hasAudioStream(videoPath);
  const speakerHasAudio = await hasAudioStream(speakerPath);

  if (!speakerHasAudio) {
    // No speaker audio to mix -- just copy
    const content = await import("node:fs/promises");
    await content.copyFile(videoPath, outputPath);
    return outputPath;
  }

  const videoDuration = await getVideoDuration(videoPath);

  const args: string[] = ["-y", "-i", videoPath, "-i", speakerPath];

  if (videoHasAudio) {
    // Mix both audio tracks
    args.push(
      "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]",
      "-map", "0:v", "-map", "[aout]",
    );
  } else {
    // Use speaker audio only
    args.push("-map", "0:v", "-map", "1:a");
  }

  args.push(
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-t", String(videoDuration),
    outputPath,
  );

  console.log("  Mixing speaker audio onto final output");

  await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });
  return outputPath;
}

/**
 * Composite a content video onto the speaker video in a single pass.
 *
 * The speaker video is the base layer (providing both video AND audio).
 * The content video (which has black backgrounds where transparency was)
 * overlays on top using a "lighten" or additive blend so the black areas
 * become transparent and the content shows through.
 *
 * For true transparency, we use chromakey on pure black OR simply overlay
 * with the content rendered on transparent (but encoded to mp4 with black bg).
 * Since our content has white/colored text on black, "lighten" blend works well.
 *
 * Actually: the simplest correct approach is to use the content video as-is
 * and overlay it with blend=lighten so black pixels become the speaker.
 */
export async function compositeContentOntoSpeaker(opts: {
  contentVideoPath: string;
  speakerPath: string;
  outputPath: string;
  width: number;
  height: number;
}): Promise<string> {
  const { contentVideoPath, speakerPath, outputPath, width, height } = opts;

  const speakerHasAudio = await hasAudioStream(speakerPath);
  const contentDuration = await getVideoDuration(contentVideoPath);

  // Use blend=lighten: for each pixel, take the brighter of speaker vs content.
  // Black content pixels (0,0,0) always show the speaker.
  // Colored/white content pixels show the content (since they are brighter than most speaker pixels).
  const filterComplex = [
    `[0:v]scale=${width}:${height}[speaker]`,
    `[speaker][1:v]blend=all_mode=lighten:shortest=1[out]`,
  ].join("; ");

  const args: string[] = [
    "-y",
    "-i", speakerPath,
    "-i", contentVideoPath,
    "-filter_complex", filterComplex,
    "-map", "[out]",
  ];

  // Speaker audio (stays in perfect sync because we never re-encode the speaker)
  if (speakerHasAudio) {
    args.push("-map", "0:a", "-c:a", "aac", "-b:a", "192k");
  }

  args.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-t", String(contentDuration),
    outputPath,
  );

  console.log("  Compositing: speaker (base) + content (lighten blend)");

  await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });
  return outputPath;
}
