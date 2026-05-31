/**
 * Audio Mixer - Mix audio tracks using ffmpeg.
 *
 * Supports volume adjustment, fade in/out, looping, ducking,
 * and muxing onto a video file.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface AudioTrackInput {
  path: string;
  type: "voiceover" | "music" | "sfx";
  volume: number;       // 0-1
  startTime?: number;   // seconds offset
  fadeIn?: number;       // seconds
  fadeOut?: number;      // seconds
  loop?: boolean;
}

export interface DuckingOptions {
  duckTrack: string;     // path of track to duck (usually music)
  triggerTrack: string;  // path of track that triggers ducking (usually voiceover)
  duckedVolume: number;  // volume when ducked (0.08-0.15)
  attack: number;        // seconds to duck down
  release: number;       // seconds to recover
}

export interface MixOptions {
  videoPath: string;       // input video (may have no audio)
  outputPath: string;      // final output with audio
  tracks: AudioTrackInput[];
  ducking?: DuckingOptions;
  totalDuration: number;   // video duration for looping/trimming
}

/**
 * Mix audio tracks and mux onto a video file.
 * Returns the output path.
 */
export async function mixAudio(opts: MixOptions): Promise<string> {
  if (opts.tracks.length === 0) {
    // No audio tracks, just copy video
    await fs.copyFile(opts.videoPath, opts.outputPath);
    return opts.outputPath;
  }

  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });

  console.log(`  Audio mixer: ${opts.tracks.length} tracks, duration=${opts.totalDuration}s`);

  // Build ffmpeg command
  const inputs: string[] = ["-i", opts.videoPath];
  const filterParts: string[] = [];
  const trackLabels: string[] = [];

  for (let i = 0; i < opts.tracks.length; i++) {
    const track = opts.tracks[i];
    const inputIdx = i + 1; // 0 is video

    if (track.loop) {
      inputs.push("-stream_loop", "-1", "-i", track.path);
    } else {
      inputs.push("-i", track.path);
    }

    let filterChain = `[${inputIdx}:a]`;
    const filters: string[] = [];

    // Trim to total duration
    filters.push(`atrim=0:${opts.totalDuration}`);
    filters.push(`asetpts=PTS-STARTPTS`);

    // Delay if startTime is set
    if (track.startTime && track.startTime > 0) {
      const delayMs = Math.round(track.startTime * 1000);
      filters.push(`adelay=${delayMs}|${delayMs}`);
    }

    // Volume adjustment
    filters.push(`volume=${track.volume}`);

    // Fade in
    if (track.fadeIn && track.fadeIn > 0) {
      filters.push(`afade=t=in:st=0:d=${track.fadeIn}`);
    }

    // Fade out
    if (track.fadeOut && track.fadeOut > 0) {
      const fadeOutStart = opts.totalDuration - track.fadeOut;
      filters.push(`afade=t=out:st=${fadeOutStart}:d=${track.fadeOut}`);
    }

    const label = `track${i}`;
    filterChain += filters.join(",") + `[${label}]`;
    filterParts.push(filterChain);
    trackLabels.push(`[${label}]`);
  }

  // If ducking is enabled, apply sidechain compress
  if (opts.ducking) {
    const duckIdx = opts.tracks.findIndex(t => t.path === opts.ducking!.duckTrack);
    const triggerIdx = opts.tracks.findIndex(t => t.path === opts.ducking!.triggerTrack);

    if (duckIdx >= 0 && triggerIdx >= 0) {
      const duckLabel = `track${duckIdx}`;
      const triggerLabel = `track${triggerIdx}`;

      // Split trigger for sidechain
      filterParts.push(`[${triggerLabel}]asplit=2[trigger_out][trigger_sc]`);

      // Apply sidechain compress to duck track
      const ratio = Math.round(1 / opts.ducking.duckedVolume);
      filterParts.push(
        `[${duckLabel}][trigger_sc]sidechaincompress=` +
        `threshold=0.02:ratio=${ratio}:` +
        `attack=${opts.ducking.attack * 1000}:` +
        `release=${opts.ducking.release * 1000}` +
        `[ducked]`
      );

      // Replace labels
      trackLabels[duckIdx] = "[ducked]";
      trackLabels[triggerIdx] = "[trigger_out]";
    }
  }

  // Mix all tracks together
  if (trackLabels.length === 1) {
    filterParts.push(`${trackLabels[0]}acopy[aout]`);
  } else {
    filterParts.push(
      `${trackLabels.join("")}amix=inputs=${trackLabels.length}:duration=longest:normalize=0[aout]`
    );
  }

  const filterComplex = filterParts.join("; ");

  const args = [
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-y",
    opts.outputPath,
  ];

  console.log(`  Audio mixer: running ffmpeg`);

  try {
    await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });
  } catch (error: unknown) {
    const stderr = (error as { stderr?: string }).stderr || "";
    throw new Error(`ffmpeg audio mix failed: ${stderr.substring(0, 500)}`);
  }

  console.log(`  Audio mixer: output written to ${opts.outputPath}`);
  return opts.outputPath;
}
