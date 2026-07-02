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
  startTime?: number;   // seconds offset on the video timeline
  trimStart?: number;   // seconds skipped from the START of the source file
  fadeIn?: number;       // seconds
  fadeOut?: number;      // seconds
  loop?: boolean;
}

export interface DuckingOptions {
  duckTrack: string;       // path of track to duck (usually music)
  /** Paths of tracks that trigger ducking. Voiceover is usually one clip per
   *  scene, so ducking must cover EVERY clip's window, not just the first. */
  triggerTracks: string[];
  duckedVolume: number;    // volume when ducked (0.08-0.15)
  attack: number;          // seconds to duck down
  release: number;         // seconds to recover
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

    // Trim: optionally skip the source head (e.g. downbeat alignment), then
    // cap at total duration. asetpts rebases so startTime delays still work.
    const trimStart = Math.max(0, track.trimStart || 0);
    filters.push(`atrim=${trimStart}:${trimStart + opts.totalDuration}`);
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

  // If ducking is enabled, apply volume-envelope ducking
  // Instead of sidechain compress (unreliable), we detect each trigger track's
  // window and apply a time-based volume curve to the duck track covering ALL
  // trigger windows (voiceover is one clip per scene, so there are many).
  if (opts.ducking) {
    const duckIdx = opts.tracks.findIndex(t => t.path === opts.ducking!.duckTrack);
    const triggerIdxs = opts.ducking.triggerTracks
      .map(p => opts.tracks.findIndex(t => t.path === p))
      .filter(i => i >= 0);

    console.log("  Ducking: duckIdx=" + duckIdx + " triggers=" + triggerIdxs.length);

    if (duckIdx >= 0 && triggerIdxs.length > 0) {
      const duckLabel = `track${duckIdx}`;
      const duckedVol = opts.ducking.duckedVolume;

      // Compute each trigger's [start, end] window by probing its duration
      const windows: Array<{ start: number; end: number }> = [];
      for (const ti of triggerIdxs) {
        const triggerTrack = opts.tracks[ti];
        let triggerDuration = opts.totalDuration;
        try {
          const probeResult = await execFileAsync("ffprobe", [
            "-v", "quiet", "-show_entries", "format=duration",
            "-of", "csv=p=0", triggerTrack.path
          ]);
          const parsed = parseFloat(probeResult.stdout.trim());
          if (!isNaN(parsed) && parsed > 0) triggerDuration = parsed;
        } catch { /* use total duration as fallback */ }

        const start = Math.max(0, triggerTrack.startTime || 0);
        const end = Math.min(start + triggerDuration, opts.totalDuration);
        if (end > start) windows.push({ start, end });
      }

      // Merge overlapping/adjacent windows so the enable expression stays small
      windows.sort((a, b) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      for (const w of windows) {
        const last = merged[merged.length - 1];
        if (last && w.start <= last.end + 0.25) last.end = Math.max(last.end, w.end);
        else merged.push({ ...w });
      }

      if (merged.length > 0) {
        // In ffmpeg enable expressions, `+` acts as OR (any nonzero term enables)
        const enableExpr = merged
          .map(w => "between(t," + w.start.toFixed(2) + "," + w.end.toFixed(2) + ")")
          .join("+");

        // Replace the duck track's filter to include the volume envelope
        const origFilter = filterParts.find(f => f.includes("[" + duckLabel + "]"));
        if (origFilter) {
          const idx = filterParts.indexOf(origFilter);
          const envelopeFilter = origFilter.replace(
            "[" + duckLabel + "]",
            "[" + duckLabel + "_pre]"
          );
          filterParts[idx] = envelopeFilter;

          filterParts.push(
            "[" + duckLabel + "_pre]" +
            "volume='" + duckedVol + "':enable='" + enableExpr + "'" +
            "[" + duckLabel + "]"
          );
        }

        console.log(
          "  Ducking: vol=" + duckedVol + " during " +
          merged.map(w => w.start.toFixed(1) + "s-" + w.end.toFixed(1) + "s").join(", ")
        );
      }
    } else {
      console.warn("  Ducking: track not found (duck=" + duckIdx + " triggers=" + triggerIdxs.length + ")");
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
    "-y",
    opts.outputPath,
  ];

  console.log("  Audio mixer: running ffmpeg");
  console.log("  Audio mixer filter_complex:", filterComplex);
  console.log("  Audio mixer args:", JSON.stringify(args.slice(0, 20)));

  try {
    await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });
  } catch (error: unknown) {
    const stderr = (error as { stderr?: string }).stderr || "";
    throw new Error(`ffmpeg audio mix failed: ${stderr.substring(0, 500)}`);
  }

  console.log(`  Audio mixer: output written to ${opts.outputPath}`);
  return opts.outputPath;
}
