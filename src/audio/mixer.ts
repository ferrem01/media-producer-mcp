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

  // If ducking is enabled, apply volume-envelope ducking
  // Instead of sidechain compress (unreliable), we detect the trigger track
  // duration and apply a time-based volume curve to the duck track.
  if (opts.ducking) {
    const duckIdx = opts.tracks.findIndex(t => t.path === opts.ducking!.duckTrack);
    const triggerIdx = opts.tracks.findIndex(t => t.path === opts.ducking!.triggerTrack);

    console.log("  Ducking: duckIdx=" + duckIdx + " triggerIdx=" + triggerIdx);

    if (duckIdx >= 0 && triggerIdx >= 0) {
      const duckLabel = `track${duckIdx}`;
      const triggerTrack = opts.tracks[triggerIdx];

      // Get trigger track duration by probing the file
      let triggerDuration = opts.totalDuration;
      try {
        const probeResult = await execFileAsync("ffprobe", [
          "-v", "quiet", "-show_entries", "format=duration",
          "-of", "csv=p=0", triggerTrack.path
        ]);
        const parsed = parseFloat(probeResult.stdout.trim());
        if (!isNaN(parsed) && parsed > 0) triggerDuration = parsed;
      } catch { /* use total duration as fallback */ }

      const attack = opts.ducking.attack || 0.3;
      const release = opts.ducking.release || 0.5;
      const duckedVol = opts.ducking.duckedVolume;
      const startTime = triggerTrack.startTime || 0;
      const endTime = startTime + triggerDuration;

      // Volume envelope: ducked during voiceover, normal otherwise
      // Use afade-style ramps at boundaries
      const duckStart = Math.max(0, startTime);
      const duckEnd = Math.min(endTime, opts.totalDuration);
      const rampDown = duckStart; // start ramping down
      const rampUp = duckEnd;     // start ramping up

      // Replace the duck track's filter to include volume envelope
      // Remove the existing filter for this track and rebuild with ducking
      const origFilter = filterParts.find(f => f.includes("[" + duckLabel + "]"));
      if (origFilter) {
        const idx = filterParts.indexOf(origFilter);
        // Add volume envelope: low during voiceover, normal before/after
        // Using volume filter with enable expression
        const envelopeFilter = origFilter.replace(
          "[" + duckLabel + "]",
          "[" + duckLabel + "_pre]"
        );
        filterParts[idx] = envelopeFilter;

        // Apply ducking envelope: volume drops to duckedVol during trigger, with smooth ramps
        filterParts.push(
          "[" + duckLabel + "_pre]" +
          "volume='" + duckedVol + "':enable='between(t," + duckStart.toFixed(2) + "," + duckEnd.toFixed(2) + ")'," +
          "volume='1':enable='not(between(t," + duckStart.toFixed(2) + "," + duckEnd.toFixed(2) + "))'" +
          "[" + duckLabel + "]"
        );
      }

      console.log("  Ducking: vol=" + duckedVol + " during " + duckStart.toFixed(1) + "s-" + duckEnd.toFixed(1) + "s");
    } else {
      console.warn("  Ducking: track index not found (duck=" + duckIdx + " trigger=" + triggerIdx + ")");
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
