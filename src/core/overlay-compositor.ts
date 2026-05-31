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
  mode: "full" | "pip" | "audio-only";
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
        // Scale speaker to PiP size, apply circular mask
        const scaledLabel = `pip_scaled_${overlayIndex}`;
        const circLabel = `pip_circ_${overlayIndex}`;
        const outLabel = `out_${overlayIndex}`;
        const radius = Math.min(pipW, pipH) / 2;

        filters.push(`[1:v]scale=${pipW}:${pipH}[${scaledLabel}]`);
        filters.push(
          `[${scaledLabel}]format=rgba,geq=` +
          `r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
          `a='if(gt(sqrt(pow(X-${pipW}/2,2)+pow(Y-${pipH}/2,2)),${Math.floor(radius)}),0,255)'` +
          `[${circLabel}]`
        );
        filters.push(
          `[${currentLabel}][${circLabel}]overlay=${pos.x}:${pos.y}:enable='${enable}'[${outLabel}]`
        );
        currentLabel = outLabel;
      } else {
        // Rectangular or rounded-rect PiP (rounded-rect approximated as rect in ffmpeg)
        const scaledLabel = `pip_${overlayIndex}`;
        const outLabel = `out_${overlayIndex}`;
        filters.push(`[1:v]scale=${pipW}:${pipH}[${scaledLabel}]`);

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
    outputPath,
  );

  console.log(`  Compositing overlays: ${videoSegments.length} video segments`);

  await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });

  return outputPath;
}
