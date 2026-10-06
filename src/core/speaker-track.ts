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
import { centerDeadChannel } from "../audio/channels.js";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import type { SpeakerTrack } from "./types.js";
import { resolveVideoPath } from "./video-path.js";

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
 * Check whether a media file has a video stream. Audio-only narration
 * (an .m4a voiceover as the "speaker") is a first-class case: the base
 * builder must synthesize a canvas-sized video track for it.
 */
async function hasVideoStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-select_streams", "v",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      filePath,
    ]);
    return stdout.trim().length > 0;
  } catch (e: any) {
    // Environments with a static ffmpeg but no ffprobe: `ffmpeg -i` exits
    // non-zero (no output requested) but prints the stream table to stderr.
    if (e?.code === "ENOENT") {
      try {
        await execFileAsync("ffmpeg", ["-hide_banner", "-i", filePath]);
      } catch (fe: any) {
        const table = String(fe?.stderr || "");
        if (/Stream #.*: Video:/.test(table)) return true;
        if (/Stream #.*: Audio:/.test(table)) return false;
      }
    }
    // Probe failure: assume video (the original behavior) and let the real
    // ffmpeg run produce the actionable error.
    return true;
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
  /** Per-scene takes: where each clip sits in the film, in clip order --
   *  `lead` seconds of black and silence before it (the first clip only,
   *  when the film opens on a scene with no take) and exactly `length`
   *  seconds of it (its scene plus the transition after it). */
  slots?: Array<{ lead?: number; length: number }>;
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
    const clipHasVideo = await hasVideoStream(resolveVideoPath(clip.source));
    if (!clipHasVideo) console.log(`  [speaker-track] Audio-only speaker source -- synthesizing black canvas video track`);
    // Time-fit: remap the whole (trimmed) recording to exactly totalDuration.
    // The rate is computed from the probed source duration -- e.g. a 400s raw
    // screencast under a 286s de-silenced narration plays start-to-finish at
    // ~1.4x instead of being truncated at 286s. Video-only (no audio speed
    // change needed: the base's audio is ignored; narration rides as a
    // separate project audio track).
    let fitSpeedFactor: number | undefined;
    if (clip.fit && clipHasVideo) {
      try {
        const srcDur = await getVideoDuration(resolveVideoPath(clip.source));
        const winStart = clip.trim_start ?? clip.start ?? 0;
        const winEnd = clip.trim_end ?? srcDur;
        const win = Math.max(0, winEnd - winStart);
        if (win > 0 && totalDuration > 0) {
          // setpts multiplier: new_PTS = factor * old_PTS. To fit `win`
          // seconds into `totalDuration`, factor = totalDuration / win.
          fitSpeedFactor = totalDuration / win;
          console.log(`  [speaker-track] fit: source ${srcDur.toFixed(1)}s (window ${win.toFixed(1)}s) -> ${totalDuration.toFixed(1)}s (setpts x${fitSpeedFactor.toFixed(3)}, ${(1 / fitSpeedFactor).toFixed(2)}x speed)`);
        }
      } catch (e: any) {
        console.warn(`  [speaker-track] fit: could not probe source duration (${e?.message || e}) -- falling back to truncate`);
      }
    } else {
      // Always report the source duration so the log makes drift diagnosable.
      try {
        const srcDur = await getVideoDuration(resolveVideoPath(clip.source));
        console.log(`  [speaker-track] single clip source duration: ${srcDur.toFixed(1)}s (film totalDuration ${totalDuration.toFixed(1)}s)`);
      } catch { /* best-effort log only */ }
    }
    const args = buildSingleClipArgs(clip, width, height, totalDuration, outputPath, clipHasVideo, fitSpeedFactor);
    console.log(`  [speaker-track] ffmpeg single-clip: ${args.filter(a => !a.startsWith('-')).join(' ')}`);
    await execFileAsync("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
    if (await centerDeadChannel(outputPath)) console.log(`  [speaker-track] voice was on one channel -- centered`);
    return outputPath;
  }

  // ── One take per scene, each in ITS slot of the film ──
  if (opts.slots && opts.slots.length === clips.length) {
    return buildSlottedBase(clips, opts.slots, width, height, totalDuration, outputPath, workDir);
  }

  // ── Multiple clips: concat + scale + trim ──
  // Step 1: prepare each clip individually (apply start/trim, scale)
  const clipPaths: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipOut = path.join(workDir, `speaker_clip_${i}.mp4`);
    const clipHasVideo = await hasVideoStream(resolveVideoPath(clip.source));
    if (!clipHasVideo) console.log(`  [speaker-track] Clip ${i + 1} is audio-only -- synthesizing black canvas video track`);
    const args = buildSingleClipArgs(clip, width, height, undefined, clipOut, clipHasVideo);
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

  // A take recorded with the voice on one channel (a lav receiver's mono
  // into the left side) plays centered, like every film mix (audio/channels.ts).
  if (speakerHasAudio && (await centerDeadChannel(outputPath))) console.log(`  [speaker-track] voice was on one channel -- centered`);
  return outputPath;
}

/**
 * PER-SCENE TAKES, EACH IN ITS SLOT. The film puts a rendered transition
 * between scenes (a 0.2 s glitch-cut), but the takes used to be glued end to
 * end with the concat demuxer: by scene 3 the voice ran 0.45 s ahead of the
 * film, and a take whose sound and picture ended at different times jolted
 * the join (Marc, proj_b1f4b7cd, Oct 6: "start of scene 3 freezes for a
 * second and then the audio scrambles"). Each take is now cut to exactly its
 * slot -- its scene plus the transition after it: the picture holds its last
 * frame, the sound pads with silence, both at one clock (30 fps, 48 kHz
 * stereo) -- and the slots are joined by the concat FILTER, which re-times
 * every frame instead of trusting each file's timestamps.
 */
async function buildSlottedBase(
  clips: SpeakerTrack["clips"],
  slots: Array<{ lead?: number; length: number }>,
  width: number,
  height: number,
  totalDuration: number,
  outputPath: string,
  workDir: string,
): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const clip: any = clips[i];
    const lead = Math.max(0, Number(slots[i].lead) || 0);
    const len = Math.max(0.05, Number(slots[i].length) || 0) + lead;
    const src = resolveVideoPath(clip.source);
    const [hasV, hasA] = await Promise.all([hasVideoStream(src), hasAudioStream(src)]);
    const trimStart = clip.trim_start ?? clip.start ?? 0;
    const win = clip.trim_end !== undefined ? clip.trim_end - trimStart : undefined;
    const out = path.join(workDir, `speaker_slot_${i}.mp4`);
    const args: string[] = ["-y"];
    if (trimStart > 0) args.push("-ss", String(trimStart));
    if (win !== undefined && win > 0) args.push("-t", String(win));
    args.push("-i", src);
    let n = 1;
    const vIn = hasV ? "0:v" : `${n}:v`;
    if (!hasV) { args.push("-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:r=30`); n++; }
    const aIn = hasA ? "0:a" : `${n}:a`;
    if (!hasA) { args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"); n++; }
    const leadV = lead > 0 ? `,tpad=start_mode=add:start_duration=${lead.toFixed(3)}:color=black` : "";
    const leadA = lead > 0 ? `,adelay=${Math.round(lead * 1000)}:all=1` : "";
    args.push("-filter_complex",
      `[${vIn}]fps=30,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1` +
      `${leadV},tpad=stop_mode=clone:stop_duration=${len.toFixed(3)},trim=0:${len.toFixed(3)},setpts=PTS-STARTPTS[v];` +
      `[${aIn}]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${leadA},apad,atrim=0:${len.toFixed(3)},asetpts=PTS-STARTPTS[a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "pcm_s16le", "-t", len.toFixed(3), out.replace(/\.mp4$/, ".mov"));
    console.log(`  [speaker-track] Slot ${i + 1}/${clips.length}: ${len.toFixed(2)}s${lead ? ` (${lead.toFixed(2)}s lead)` : ""}`);
    await execFileAsync("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024 });
    parts.push(out.replace(/\.mp4$/, ".mov"));
  }
  const inputs = parts.flatMap((p) => ["-i", p]);
  const chain = parts.map((_, i) => `[${i}:v][${i}:a]`).join("") + `concat=n=${parts.length}:v=1:a=1[v][a]`;
  await execFileAsync("ffmpeg", ["-y", ...inputs, "-filter_complex", chain, "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", String(totalDuration), outputPath], { maxBuffer: 50 * 1024 * 1024 });
  for (const p of parts) await fs.unlink(p).catch(() => {});
  if (await centerDeadChannel(outputPath)) console.log(`  [speaker-track] voice was on one channel -- centered`);
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
  sourceHasVideo: boolean = true,
  /** When set, prepend setpts=<factor>*PTS to the video filter chain to
   *  time-remap the (trimmed) clip to totalDuration. Video-only. */
  fitSpeedFactor?: number,
): string[] {
  const trimStart = clip.trim_start ?? clip.start ?? 0;
  const trimEnd = clip.trim_end;

  // Audio-only narration (recorded voiceover, no camera): synthesize a black
  // canvas-sized video track. Without one the base mp4 carries no video
  // stream and the final overlay's [0:v] matches nothing, killing the render
  // at the last step. Scenes over an audio-only track are opaque, so the
  // black base never shows.
  if (!sourceHasVideo) {
    const a: string[] = ["-y"];
    if (trimStart > 0) a.push("-ss", String(trimStart));
    a.push("-i", resolveVideoPath(clip.source));
    a.push("-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:r=30`);
    a.push("-map", "1:v", "-map", "0:a");
    const clipDuration = trimEnd !== undefined ? trimEnd - trimStart : undefined;
    if (clipDuration !== undefined && clipDuration > 0) a.push("-t", String(clipDuration));
    else if (totalDuration !== undefined) a.push("-t", String(totalDuration));
    else a.push("-shortest"); // color= is infinite; end with the audio
    a.push(
      "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k",
      outputPath,
    );
    return a;
  }

  const args: string[] = ["-y"];

  // Seek before input for fast seek (less accurate but much faster for long files)
  if (trimStart > 0) {
    args.push("-ss", String(trimStart));
  }

  // clip.source is often the SERVED asset URL (/assets/{tenant}/...) --
  // ffmpeg needs the real filesystem path (same mapping scene-worker uses).
  args.push("-i", resolveVideoPath(clip.source));

  // Output duration cap. When fitting, the setpts remap maps the whole
  // (trimmed) window onto totalDuration, so the cap is ALWAYS totalDuration
  // (the source-window length would cap post-setpts output far too early).
  if (fitSpeedFactor && fitSpeedFactor > 0 && totalDuration !== undefined) {
    args.push("-t", String(totalDuration));
  } else if (trimEnd !== undefined) {
    const clipDuration = trimEnd - trimStart;
    if (clipDuration > 0) {
      args.push("-t", String(clipDuration));
    }
  } else if (totalDuration !== undefined) {
    args.push("-t", String(totalDuration));
  }

  // Scale to canvas dimensions, preserve aspect ratio with letterbox/pillarbox black.
  // When fitting, prepend a setpts remap so the whole (trimmed) clip plays in
  // totalDuration; the -t totalDuration above then caps it cleanly.
  // setpts only rewrites timestamps (all source frames survive at a new
  // cadence); normalise to a stable 30fps so the downstream overlay composite
  // and stitch see the same frame rate the black-canvas synth path uses.
  const setptsPrefix = fitSpeedFactor && fitSpeedFactor > 0 ? `setpts=${fitSpeedFactor.toFixed(6)}*PTS,fps=30,` : "";
  args.push(
    "-vf", `${setptsPrefix}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
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
 * @returns Path to the output mp4 (= opts.outputPath)
 */
export async function compositeContentOverlay(opts: {
  speakerVideoPath: string;
  contentFramesDir: string;
  fps: number;
  outputPath: string;
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

/**
 * Film-time start of each scene in the speaker-track output. The stitcher
 * INSERTS transition frames between scenes while the speaker base (and the
 * speaker's voice) plays straight through them -- so a scene's true start is
 * the sum of prior scene durations PLUS prior transition durations. Using
 * plain duration sums put every synced camera view (PiPs, framed panels)
 * progressively behind the voice: ~2.2s of lip lag by the fourth scene.
 * This must mirror the Step 4 stitch loop exactly.
 */
export function speakerSceneFilmStarts(scenes: Array<{ duration_seconds: number; transition_in?: { type: string; duration_seconds?: number } }>): number[] {
  const starts: number[] = [];
  let t = 0;
  for (let i = 0; i < scenes.length; i++) {
    starts.push(t);
    t += scenes[i].duration_seconds || 0;
    const next = scenes[i + 1];
    if (next && next.transition_in && next.transition_in.type !== "none") {
      t += next.transition_in.duration_seconds || 0;
    }
  }
  return starts;
}

/** Each per-scene take's slot in the film (core/speaker-track.ts
 *  buildSlottedBase): from its scene's film start to the next take's (or the
 *  film's end), so the transitions between scenes are inside the slots.
 *  null when the clips are not one-per-scene (a continuous track). */
export function speakerSlots(
  clips: Array<{ scene_index?: number }>,
  scenes: Array<{ duration_seconds: number; transition_in?: { type: string; duration_seconds?: number } }>,
  totalDuration: number,
): Array<{ lead?: number; length: number }> | null {
  if (clips.length < 2 || clips.some((c) => typeof c.scene_index !== "number")) return null;
  const idx = clips.map((c) => c.scene_index as number);
  if (idx.some((v, i) => v < 0 || v >= scenes.length || (i > 0 && v <= idx[i - 1]))) return null;
  const starts = speakerSceneFilmStarts(scenes);
  return idx.map((si, i) => {
    const from = starts[si];
    const to = i + 1 < idx.length ? starts[idx[i + 1]] : totalDuration;
    return { ...(i === 0 && from > 0 ? { lead: from } : {}), length: Math.max(0.05, to - from) };
  });
}

/**
 * The camera under ONE scene's preview. With per-scene takes (clips carry
 * `scene_index`) it is THAT scene's clip from its own trim; with one
 * continuous track it is the first clip at the scene's film start. The
 * render concatenates the clips and never needs this; the Studio preview
 * plays a single <video> and does (measured live: three takes previewed
 * as the first take seeked to 9.99s and 16.66s -- its last frame, twice).
 */
export function speakerClipForScene(
  clips: Array<{ source: string; start?: number; trim_start?: number; scene_index?: number; alpha?: string }> | undefined,
  scenes: Array<{ duration_seconds: number; transition_in?: { type: string; duration_seconds?: number } }>,
  sceneIndex: number,
): { source: string; offset: number; alpha?: string } | null {
  if (!clips || !clips.length) return null;
  const own = clips.find((c) => c.scene_index === sceneIndex);
  if (own) return { source: own.source, offset: own.trim_start ?? own.start ?? 0, ...(own.alpha ? { alpha: own.alpha } : {}) };
  if (clips.some((c) => c.scene_index !== undefined)) return null; // per-scene track, this scene has no take
  const starts = speakerSceneFilmStarts(scenes);
  return { source: clips[0].source, offset: (clips[0].trim_start ?? clips[0].start ?? 0) + (starts[sceneIndex] || 0), ...(clips[0].alpha ? { alpha: clips[0].alpha } : {}) };
}
