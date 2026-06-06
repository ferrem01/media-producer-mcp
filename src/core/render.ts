/**
 * Render Pipeline
 *
 * Orchestrates the full render flow:
 *   project.json -> assemble scenes -> capture frames -> encode video
 *
 * Features:
 * - Parallel scene rendering with configurable concurrency
 * - GSAP-powered transitions rendered as mini HTML scenes
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fork, execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { assembleScene, type ComponentSource } from "./scene-assembler.js";
import { captureScene, captureSingleFrame } from "./capture.js";
import { encodeScene, encodeGif, concatSegments } from "./encode.js";
import { exportPdf } from "./pdf-export.js";
import { renderTransition, extractFirstFrame, extractLastFrame } from "./transitions.js";
// Critique now runs during generate, not render
import { config } from "../config.js";
import type { LLMConfig } from "../llm/client.js";
import type { Project, Scene } from "./types.js";
import { mixAudio, type AudioTrackInput } from "../audio/mixer.js";
import { compositeOverlays, compositeFullBehind, mixSpeakerAudio, compositeContentOntoSpeaker, type OverlaySegment } from "./overlay-compositor.js";
import { projectAssetsDir } from "../persistence/paths.js";

export interface RenderOptions {
  /** The project to render */
  project: Project;
  /** Working directory for intermediate files */
  workDir: string;
  /** Directory containing .component.html files */
  componentLibDir: string;
  /** Directory containing GSAP files */
  gsapDir: string;
  /** Output file path */
  outputPath: string;

  /** Additional directories to search for component sources (e.g. project-local freeform components) */
  extraComponentDirs?: string[];

  /** When true, skip scene rendering and only (re-)apply audio mix + overlays to existing output */
  audioOnly?: boolean;
}

export interface RenderResult {
  outputPath: string;
  format: string;
  durationMs: number;
  frameCount?: number;
}

/**
 * Render a project to its output format.
 */
export async function renderProject(options: RenderOptions): Promise<RenderResult> {
  const { project, workDir, componentLibDir, gsapDir, outputPath } = options;
  const startTime = Date.now();

  await fs.mkdir(workDir, { recursive: true });

  console.log(`Rendering project: ${project.name} (format: ${project.format})`);
  console.log(`  Scenes: ${project.scenes.length}`);
  console.log(`  Canvas: ${project.canvas.width}x${project.canvas.height} @ ${project.canvas.fps}fps`);

  // Load all required component sources
  const componentSources = await loadComponentSources(project, componentLibDir, options.extraComponentDirs);

  // ── Audio-only mode: skip scene rendering, just re-mux audio + overlays ──
  if (options.audioOnly) {
    if (project.format !== "video" && project.format !== "slideshow") {
      throw new Error(`audio_only is only supported for video/slideshow formats, got: ${project.format}`);
    }
    return renderAudioOnly(project, workDir, outputPath, startTime);
  }

  switch (project.format) {
    case "image":
    case "one-pager":
      return renderImage(project, componentSources, workDir, gsapDir, outputPath, startTime);

    case "video":
    case "slideshow":
      return renderVideo(project, componentSources, workDir, gsapDir, outputPath, startTime, undefined, options.extraComponentDirs);

    case "presentation":
    case "presentation":
      return renderDeck(project, componentSources, workDir, gsapDir, outputPath, startTime);

    case "gif":
      return renderGif(project, componentSources, workDir, gsapDir, outputPath, startTime);

    case "social":
      return renderSocial(project, componentSources, workDir, gsapDir, outputPath, startTime);

    case "email-header":
      return renderEmailHeader(project, componentSources, workDir, gsapDir, outputPath, startTime);

    case "thumbnail":
      return renderImage(project, componentSources, workDir, gsapDir, outputPath, startTime);

    default:
      throw new Error(`Unsupported format: ${project.format}`);
  }
}

/**
 * Audio-only render: skip scene rendering, just mix audio + apply overlays
 * onto the already-rendered video file.
 */
async function renderAudioOnly(
  project: Project,
  workDir: string,
  outputPath: string,
  startTime: number,
): Promise<RenderResult> {
  // Check that the existing output exists
  try {
    await fs.access(outputPath);
  } catch {
    throw new Error(
      `audio_only requires an existing rendered video at ${outputPath}. Run a full render first.`
    );
  }

  console.log(`Audio-only render: muxing audio onto existing video`);

  const totalDuration = project.scenes.reduce((sum, s) => sum + s.duration_seconds, 0);

  // ── Audio mixing ──
  if (project.audio && project.audio.tracks.length > 0) {
    console.log(`  Mixing ${project.audio.tracks.length} audio track(s)...`);

    const audioOutput = outputPath.replace(/\.mp4$/, "-with-audio.mp4");
    const audioTracks: AudioTrackInput[] = project.audio.tracks.map((t) => ({
      path: t.source,
      type: t.type,
      volume: t.volume,
      startTime: t.start_time,
      fadeIn: t.fade_in,
      fadeOut: t.fade_out,
      loop: t.loop,
    }));

    let duckingOpts: Parameters<typeof mixAudio>[0]["ducking"] = undefined;
    if (project.audio.ducking?.enabled) {
      const duckTrackObj = project.audio.tracks.find((t) => t.id === project.audio!.ducking!.duck_track);
      const triggerTrackObj = project.audio.tracks.find((t) => t.id === project.audio!.ducking!.trigger_track);
      if (duckTrackObj && triggerTrackObj) {
        duckingOpts = {
          duckTrack: duckTrackObj.source,
          triggerTrack: triggerTrackObj.source,
          duckedVolume: project.audio.ducking.ducked_volume,
          attack: project.audio.ducking.attack ?? 0.3,
          release: project.audio.ducking.release ?? 0.5,
        };
      }
    }

    await mixAudio({
      videoPath: outputPath,
      outputPath: audioOutput,
      tracks: audioTracks,
      ducking: duckingOpts,
      totalDuration,
    });

    await fs.rename(audioOutput, outputPath);
  } else {
    console.log("  No audio tracks to mix, nothing to do.");
  }

  // ── Speaker overlays ──
  if (project.overlays && project.overlays.length > 0) {
    for (const overlay of project.overlays) {
      if (overlay.type === "speaker-video" && overlay.source) {
        const speakerPath = resolveAssetPath(overlay.source, project.tenant_id, project.project_id);
        // Exclude full-behind segments (handled during scene render, not in audio-only pass)
        const segments: OverlaySegment[] = (overlay.segments
          ? overlay.segments.map((s) => ({
              start: s.start,
              end: s.end,
              mode: s.mode,
              position: (s.position as OverlaySegment["position"]) || (overlay.position as OverlaySegment["position"]) || "bottom-right",
              shape: (s.shape as OverlaySegment["shape"]) || overlay.shape || "circle",
              size: s.size || overlay.size,
            }))
          : [{
              start: overlay.start_time || 0,
              end: overlay.end_time ?? Infinity,
              mode: "pip" as const,
              position: (overlay.position as OverlaySegment["position"]) || "bottom-right",
              shape: overlay.shape || "circle",
              size: overlay.size,
            }]).filter((s) => s.mode !== "full-behind");
        if (segments.length === 0) continue;

        const overlayOutput = outputPath.replace(/\.mp4$/, "-overlay.mp4");
        await compositeOverlays({
          videoPath: outputPath,
          speakerPath,
          segments,
          outputPath: overlayOutput,
          width: project.canvas.width,
          height: project.canvas.height,
        });
        await fs.rename(overlayOutput, outputPath);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`Audio-only render complete: ${outputPath} (${(durationMs / 1000).toFixed(1)}s)`);

  return {
    outputPath,
    format: project.format,
    durationMs,
  };
}

/**
 * Render a single-image output.
 */
async function renderImage(
  project: Project,
  componentSources: ComponentSource[],
  workDir: string,
  gsapDir: string,
  outputPath: string,
  startTime: number,
): Promise<RenderResult> {
  const scene = project.scenes[0];
  if (!scene) throw new Error("No scenes in project");

  // Assemble scene HTML
  const html = await assembleScene({
    scene,
    components: componentSources,
    brandKit: project.brand_kit,
    canvas: project.canvas,
    gsapDir,
  });

  const htmlPath = path.join(workDir, "scene.html");
  await fs.writeFile(htmlPath, html);

  // Capture single frame
  const format = outputPath.endsWith(".jpg") || outputPath.endsWith(".jpeg") ? "jpeg" : "png";
  await captureSingleFrame({
    htmlPath,
    outputPath,
    width: project.canvas.width,
    height: project.canvas.height,
    format,
    atTime: scene.duration_seconds ? scene.duration_seconds / 2 : 0,
  });

  return {
    outputPath,
    format: project.format,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Render a single scene by spawning a child process.
 * The child process handles assembly + capture + encode, then exits.
 * ALL memory (HTML strings, Chromium, frame buffers) is freed on exit.
 */
async function renderSingleSceneWorker(
  project: Project,
  sceneIndex: number,
  workDir: string,
  critiqueOpts?: { critique?: boolean; maxRevisions?: number; llmConfig?: LLMConfig; originalPrompt?: string },
  extraComponentDirs?: string[],
  fullBehindSpeakerPath?: string,
  fullBehindSpeakerOffset?: number,
): Promise<{ mp4Path: string; frameCount: number }> {
  const scene = project.scenes[sceneIndex];
  const sceneDir = path.join(workDir, `scene_${sceneIndex}`);
  const mp4Path = path.join(sceneDir, "scene.mp4");

  await fs.mkdir(sceneDir, { recursive: true });

  // Brand asset shortcut: if scene is a pre-rendered video (brand intro/outro),
  // re-encode to match project canvas settings instead of going through Playwright capture.
  if (scene.components.length === 1 && scene.components[0].type === "video" && scene.components[0].data?.src) {
    const videoSrc = scene.components[0].data?.src as string;
    if (videoSrc) {
      console.log(`  Scene ${sceneIndex + 1}: brand asset video, re-encoding to ${project.canvas.width}x${project.canvas.height}`);
      try {
        // Download the source video to a temp file
        const srcPath = path.join(sceneDir, "brand_source.mp4");
        if (videoSrc.startsWith("http://") || videoSrc.startsWith("https://")) {
          const res = await fetch(videoSrc);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${videoSrc}`);
          const buf = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(srcPath, buf);
        } else if (videoSrc.startsWith("/")) {
          // Resolve /assets/{tenant}/brand-kit/{path} -> {dataDir}/{tenant}/brand-kit/assets/{path}
          // Must match the HTTP handler pattern in index.ts
          const brandMatch = videoSrc.match(/^\/assets\/([^/]+)\/brand-kit\/(.+)$/);
          if (brandMatch) {
            const localPath = path.join(config.dataDir, brandMatch[1], "brand-kit", "assets", brandMatch[2]);
            await fs.copyFile(localPath, srcPath);
          } else {
            // For other /assets/ or /api/ paths, fetch via localhost
            const localRes = await fetch(`http://localhost:${config.port}${videoSrc}`);
            if (!localRes.ok) throw new Error(`HTTP ${localRes.status}: ${videoSrc}`);
            const localBuf = Buffer.from(await localRes.arrayBuffer());
            await fs.writeFile(srcPath, localBuf);
          }
        }

        // Re-encode to match project canvas (resolution, codec, fps, no audio for now)
        const ffmpegArgs = [
          "-y",
          "-i", srcPath,
          "-vf", `scale=${project.canvas.width}:${project.canvas.height}:force_original_aspect_ratio=decrease,pad=${project.canvas.width}:${project.canvas.height}:(ow-iw)/2:(oh-ih)/2:black`,
          "-r", String(project.canvas.fps),
          "-c:v", "libx264",
          "-profile:v", "baseline",
          "-level", "3.0",
          "-preset", "medium",
          "-crf", "23",
          "-maxrate", "2M",
          "-bufsize", "4M",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-an", // strip audio for now (audio mix happens later)
          mp4Path,
        ];
        await execFileAsync("ffmpeg", ffmpegArgs, { maxBuffer: 10 * 1024 * 1024 });

        // Clean up source
        await fs.unlink(srcPath).catch(() => {});

        const stat = await fs.stat(mp4Path);
        console.log(`  Encoded: ${mp4Path} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
        const totalFrames = Math.ceil(scene.duration_seconds * project.canvas.fps);
        return { mp4Path, frameCount: totalFrames };
      } catch (e: any) {
        console.warn(`  Brand asset encode failed (${e.message}), falling back to capture`);
      }
    }
  }

  // Write the project JSON for the worker to read.
  // When using full-behind mode, mutate the scene copy to enable transparent background.
  const projectJsonPath = path.join(sceneDir, "project.json");
  if (fullBehindSpeakerPath) {
    // Clone project and mark scene as transparent
    const projectClone = JSON.parse(JSON.stringify(project));
    projectClone.scenes[sceneIndex].transparent_background = true;
    await fs.writeFile(projectJsonPath, JSON.stringify(projectClone));
  } else {
    await fs.writeFile(projectJsonPath, JSON.stringify(project));
  }

  // Write worker args
  const argsPath = path.join(sceneDir, ".worker-args.json");
  const workerArgs: Record<string, unknown> = {
    projectJsonPath,
    sceneIndex,
    workDir: sceneDir,
    componentLibDir: config.componentLibDir,
    gsapDir: config.gsapDir,
    outputMp4Path: mp4Path,
    width: project.canvas.width,
    height: project.canvas.height,
    fps: project.canvas.fps,
    extraComponentDirs: extraComponentDirs || [],
    // full-behind: capture PNGs with alpha instead of JPEG
    captureAsPng: !!fullBehindSpeakerPath,
  };

  if (critiqueOpts?.critique && critiqueOpts.llmConfig) {
    workerArgs.critique = true;
    workerArgs.maxRevisions = critiqueOpts.maxRevisions || 2;
    workerArgs.anthropicApiKey = critiqueOpts.llmConfig.apiKey;
    workerArgs.critiqueModel = critiqueOpts.llmConfig.model;
    workerArgs.format = project.format;
    workerArgs.originalPrompt = critiqueOpts.originalPrompt || "";
  }

  await fs.writeFile(argsPath, JSON.stringify(workerArgs));

  // Spawn the worker
  const workerPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "scene-worker.js"
  );

  await new Promise<void>((resolve, reject) => {
    const child = fork(workerPath, [argsPath], {
      execArgv: [],
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Scene worker exited with code ${code}`));
    });
    child.on("error", reject);
  });

  // Clean up temp files
  await fs.unlink(projectJsonPath).catch(() => {});
  await fs.unlink(argsPath).catch(() => {});

  // full-behind: PNG frames captured with transparency.
  // Composite them onto the speaker video per-scene (no audio -- audio mixed post-concat).
  if (fullBehindSpeakerPath) {
    const framesDir = path.join(sceneDir, "frames");
    console.log(`\n  full-behind composite: scene ${sceneIndex + 1}`);
    await compositeFullBehind({
      framesDir,
      speakerPath: fullBehindSpeakerPath,
      outputPath: mp4Path,
      width: project.canvas.width,
      height: project.canvas.height,
      fps: project.canvas.fps,
      duration: scene.duration_seconds,
      speakerOffset: fullBehindSpeakerOffset,
    });
    // Clean up PNG frames
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    await fs.unlink(path.join(sceneDir, ".frames-ready")).catch(() => {});
  }

  const totalFrames = Math.ceil(scene.duration_seconds * project.canvas.fps);
  return { mp4Path, frameCount: totalFrames };
}

/**
 * Render scenes in parallel batches using child process workers.
 */
async function renderScenesParallel(
  project: Project,
  workDir: string,
  critiqueOpts?: { critique?: boolean; maxRevisions?: number; llmConfig?: LLMConfig; originalPrompt?: string },
  extraComponentDirs?: string[],
): Promise<Array<{ mp4Path: string; frameCount: number }>> {
  const concurrency = config.renderConcurrency;
  const results = new Array<{ mp4Path: string; frameCount: number }>(project.scenes.length);

  // Build a map of scene index -> speaker path for full-behind overlays.
  // A scene uses full-behind when there is a speaker-video overlay whose segment
  // time range covers that scene and the segment mode is "full-behind".
  const sceneFullBehindSpeaker = buildFullBehindSpeakerMap(project);

  console.log(`  Rendering ${project.scenes.length} scenes (concurrency: ${concurrency})`);

  for (let batch = 0; batch < project.scenes.length; batch += concurrency) {
    const batchEnd = Math.min(batch + concurrency, project.scenes.length);
    const promises: Promise<{ mp4Path: string; frameCount: number }>[] = [];
    
    for (let idx = batch; idx < batchEnd; idx++) {
      const fbSpeakerPath = sceneFullBehindSpeaker.get(idx);
      // Compute cumulative offset into speaker video for this scene
      let fbOffset = 0;
      if (fbSpeakerPath) {
        for (let si = 0; si < idx; si++) {
          fbOffset += project.scenes[si].duration_seconds;
        }
      }
      promises.push(renderSingleSceneWorker(project, idx, workDir, critiqueOpts, extraComponentDirs, fbSpeakerPath, fbOffset));
    }

    const batchResults = await Promise.all(promises);
    for (let i = 0; i < batchResults.length; i++) {
      results[batch + i] = batchResults[i];
    }
  }

  return results;
}

/**
 * Build a map from scene index to speaker video path for scenes that should
 * use the full-behind compositing mode.
 *
 * A scene is "full-behind" when it overlaps in time with a speaker-video overlay
 * segment whose mode is "full-behind".
 */
function buildFullBehindSpeakerMap(project: Project): Map<number, string> {
  const map = new Map<number, string>();
  if (!project.overlays) return map;

  // Compute cumulative scene start times
  const sceneStarts: number[] = [];
  let t = 0;
  for (const scene of project.scenes) {
    sceneStarts.push(t);
    t += scene.duration_seconds;
  }

  for (const overlay of project.overlays) {
    if (overlay.type !== "speaker-video" || !overlay.source) continue;
    if (!overlay.segments) continue;

    const speakerPath = resolveAssetPath(overlay.source, project.tenant_id, project.project_id);

    for (const seg of overlay.segments) {
      if (seg.mode !== "full-behind") continue;

      // Find all scenes whose time range overlaps this segment
      for (let i = 0; i < project.scenes.length; i++) {
        const sceneStart = sceneStarts[i];
        const sceneEnd = sceneStart + project.scenes[i].duration_seconds;
        const segEnd = seg.end === Infinity ? Infinity : seg.end;
        // Overlap check: scene starts before seg ends AND scene ends after seg starts.
        // Only apply full-behind to scenes that have transparent_background set.
        // Scenes with their own backgrounds (e.g. screencast) should not be composited.
        if (sceneStart < segEnd && sceneEnd > seg.start && project.scenes[i].transparent_background) {
          map.set(i, speakerPath);
        }
      }
    }
  }

  return map;
}

/**
 * Render a video output with parallel scene rendering and GSAP transitions.
 */
async function renderVideo(
  project: Project,
  _componentSources: ComponentSource[],
  workDir: string,
  gsapDir: string,
  outputPath: string,
  startTime: number,
  critiqueOpts?: { critique?: boolean; maxRevisions?: number; llmConfig?: LLMConfig; originalPrompt?: string },
  extraComponentDirs?: string[],
): Promise<RenderResult> {
  // Render all scenes (in parallel batches, each as a child process)
  const sceneResults = await renderScenesParallel(project, workDir, critiqueOpts, extraComponentDirs);

  const sceneMp4s = sceneResults.map((r) => r.mp4Path);
  const totalFrames = sceneResults.reduce((sum, r) => sum + r.frameCount, 0);

  // Build the final segment list: scene + transition + scene + transition + ...
  if (sceneMp4s.length > 1) {
    const segments: string[] = [sceneMp4s[0]];

    for (let i = 1; i < sceneMp4s.length; i++) {
      const scene = project.scenes[i];
      const transitionType = scene.transition_in?.type || "crossfade";
      const transitionDuration = scene.transition_in?.duration_seconds || 0.5;

      if (transitionType === "none") {
        // No transition, just append the scene
        segments.push(sceneMp4s[i]);
        continue;
      }

      // Extract last frame of previous scene and first frame of current scene
      const transWorkDir = path.join(workDir, `transition_${i - 1}_${i}`);
      await fs.mkdir(transWorkDir, { recursive: true });

      const lastFramePath = path.join(transWorkDir, "frameA.png");
      const firstFramePath = path.join(transWorkDir, "frameB.png");

      await extractLastFrame(
        sceneMp4s[i - 1], lastFramePath,
        project.canvas.width, project.canvas.height,
      );
      await extractFirstFrame(
        sceneMp4s[i], firstFramePath,
        project.canvas.width, project.canvas.height,
      );

      // Render the transition as a mini video segment
      console.log(`\n  Transition ${i - 1}->${i}: ${transitionType} (${transitionDuration}s)`);
      const transitionMp4 = await renderTransition({
        type: transitionType,
        duration: transitionDuration,
        frameA: lastFramePath,
        frameB: firstFramePath,
        width: project.canvas.width,
        height: project.canvas.height,
        fps: project.canvas.fps,
        workDir: transWorkDir,
        gsapDir,
      });

      segments.push(transitionMp4);
      segments.push(sceneMp4s[i]);
    }

    // Simple concat of all segments (no xfade needed, transitions are their own segments)
    await concatSegments(segments, outputPath);
  } else if (sceneMp4s.length === 1) {
    await fs.copyFile(sceneMp4s[0], outputPath);
  }

  // ── Audio mixing ──
  const totalDuration = project.scenes.reduce((sum, s) => sum + s.duration_seconds, 0);

  if (project.audio && project.audio.tracks.length > 0) {
    console.log(`\n  Mixing ${project.audio.tracks.length} audio track(s)...`);

    const audioOutput = outputPath.replace(/\.mp4$/, "-with-audio.mp4");
    const audioTracks: AudioTrackInput[] = project.audio.tracks.map((t) => ({
      path: t.source,
      type: t.type,
      volume: t.volume,
      startTime: t.start_time,
      fadeIn: t.fade_in,
      fadeOut: t.fade_out,
      loop: t.loop,
    }));

    // Resolve ducking track IDs to file paths (mixer matches by path)
    let duckingOpts: Parameters<typeof mixAudio>[0]["ducking"] = undefined;
    if (project.audio.ducking?.enabled) {
      const duckTrackObj = project.audio.tracks.find((t) => t.id === project.audio!.ducking!.duck_track);
      const triggerTrackObj = project.audio.tracks.find((t) => t.id === project.audio!.ducking!.trigger_track);
      if (duckTrackObj && triggerTrackObj) {
        duckingOpts = {
          duckTrack: duckTrackObj.source,
          triggerTrack: triggerTrackObj.source,
          duckedVolume: project.audio.ducking.ducked_volume,
          attack: project.audio.ducking.attack ?? 0.3,
          release: project.audio.ducking.release ?? 0.5,
        };
        console.log("  Ducking: " + duckTrackObj.id + " ducked by " + triggerTrackObj.id);
      } else {
        console.warn("  Ducking: track IDs not found, skipping ducking");
      }
    }

    await mixAudio({
      videoPath: outputPath,
      outputPath: audioOutput,
      tracks: audioTracks,
      ducking: duckingOpts,
      totalDuration,
    });

    // Replace the video-only output with the audio-mixed version
    await fs.rename(audioOutput, outputPath);
  }

  // ── Speaker overlays ──
  if (project.overlays && project.overlays.length > 0) {
    for (const overlay of project.overlays) {
      if (overlay.type === "speaker-video" && overlay.source) {
        const speakerPath = resolveAssetPath(overlay.source, project.tenant_id, project.project_id);

        // Build segments from overlay config.
        // full-behind segments are handled at scene-render time and must be excluded here.
        const allSegments: OverlaySegment[] = overlay.segments
          ? overlay.segments.map((s) => ({
              start: s.start,
              end: s.end,
              mode: s.mode,
              position: (s.position as OverlaySegment["position"]) || (overlay.position as OverlaySegment["position"]) || "bottom-right",
              shape: (s.shape as OverlaySegment["shape"]) || overlay.shape || "circle",
              size: s.size || overlay.size,
            }))
          : [{
              start: overlay.start_time || 0,
              end: overlay.end_time ?? Infinity,
              mode: "pip" as const,
              position: (overlay.position as OverlaySegment["position"]) || "bottom-right",
              shape: overlay.shape || "circle",
              size: overlay.size,
            }];

        // Only composite segments that aren't full-behind (those were already composited per-scene)
        const segments = allSegments.filter((s) => s.mode !== "full-behind");
        if (segments.length === 0) continue;

        const overlayOutput = outputPath.replace(/\.mp4$/, "-overlay.mp4");

        console.log(`\n  Compositing speaker overlay: ${segments.length} segment(s)`);
        await compositeOverlays({
          videoPath: outputPath,
          speakerPath,
          segments,
          outputPath: overlayOutput,
          width: project.canvas.width,
          height: project.canvas.height,
        });

        await fs.rename(overlayOutput, outputPath);
      }
    }
  }

  // ── Speaker audio: mix as one continuous track across all scenes ──
  // Full-behind scenes have speaker video composited per-scene (no audio).
  // Mix the speaker audio onto the final concatenated video as one continuous track.
  if (project.overlays && project.overlays.length > 0) {
    for (const overlay of project.overlays) {
      if (overlay.type === "speaker-video" && overlay.source) {
        const speakerPath = resolveAssetPath(overlay.source, project.tenant_id, project.project_id);
        const hasFullBehind = overlay.segments?.some(s => s.mode === "full-behind");
        if (hasFullBehind) {
          const audioOutput = outputPath.replace(/\.mp4$/, "-speaker-audio.mp4");
          await mixSpeakerAudio({
            videoPath: outputPath,
            speakerPath,
            outputPath: audioOutput,
          });
          await fs.rename(audioOutput, outputPath);
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`\nRender complete: ${outputPath}`);
  console.log(`  Total frames: ${totalFrames}`);
  console.log(`  Total time: ${(durationMs / 1000).toFixed(1)}s`);

  return {
    outputPath,
    format: project.format,
    durationMs,
    frameCount: totalFrames,
  };
}

/**
 * Render a multi-page PDF presentation.
 * Captures each scene as a static PNG, then combines into a PDF.
 */
async function renderDeck(
  project: Project,
  componentSources: ComponentSource[],
  workDir: string,
  gsapDir: string,
  outputPath: string,
  startTime: number,
): Promise<RenderResult> {
  const scenePngs: string[] = [];

  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    const html = await assembleScene({
      scene,
      components: componentSources,
      brandKit: project.brand_kit,
      canvas: project.canvas,
      gsapDir,
    });

    const htmlPath = path.join(workDir, `deck_scene_${i}.html`);
    const pngPath = path.join(workDir, `deck_scene_${i}.png`);
    await fs.writeFile(htmlPath, html);

    await captureSingleFrame({
      htmlPath,
      outputPath: pngPath,
      width: project.canvas.width,
      height: project.canvas.height,
      format: "png",
      atTime: scene.duration_seconds ? scene.duration_seconds / 3 : 1,
    });

    scenePngs.push(pngPath);
  }

  const pdfPath = outputPath.endsWith(".pdf") ? outputPath : outputPath.replace(/\.[^.]+$/, ".pdf");
  await exportPdf({
    scenePngs,
    outputPath: pdfPath,
    width: project.canvas.width,
    height: project.canvas.height,
  });

  return {
    outputPath: pdfPath,
    format: project.format,
    durationMs: Date.now() - startTime,
  };
}

/** Social media size presets */
const SOCIAL_PRESETS: Record<string, { width: number; height: number }> = {
  "instagram-post": { width: 1080, height: 1080 },
  "instagram-story": { width: 1080, height: 1920 },
  "linkedin": { width: 1200, height: 627 },
  "twitter": { width: 1600, height: 900 },
  "youtube-thumbnail": { width: 1280, height: 720 },
};

/**
 * Render a GIF output from all scenes.
 */
async function renderGif(
  project: Project,
  componentSources: ComponentSource[],
  workDir: string,
  gsapDir: string,
  outputPath: string,
  startTime: number,
): Promise<RenderResult> {
  // Render all scene frames into a single frames directory
  const framesDir = path.join(workDir, "gif_frames");
  await fs.mkdir(framesDir, { recursive: true });

  let globalFrameIndex = 0;

  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    const sceneDir = path.join(workDir, `gif_scene_${i}`);
    await fs.mkdir(sceneDir, { recursive: true });

    const html = await assembleScene({
      scene,
      components: componentSources,
      brandKit: project.brand_kit,
      canvas: project.canvas,
      gsapDir,
    });

    const htmlPath = path.join(sceneDir, "scene.html");
    await fs.writeFile(htmlPath, html);

    const result = await captureScene({
      htmlPath,
      outputDir: sceneDir,
      width: project.canvas.width,
      height: project.canvas.height,
      fps: project.canvas.fps,
      duration: scene.duration_seconds,
    });

    // Copy frames to the unified frames directory with sequential numbering
    for (let f = 0; f < result.frameCount; f++) {
      const srcFrame = path.join(sceneDir, `frame-${String(f + 1).padStart(6, "0")}.png`);
      const dstFrame = path.join(framesDir, `frame-${String(globalFrameIndex + 1).padStart(6, "0")}.png`);
      await fs.copyFile(srcFrame, dstFrame);
      globalFrameIndex++;
    }
  }

  const gifPath = outputPath.endsWith(".gif") ? outputPath : outputPath.replace(/\.[^.]+$/, ".gif");
  await encodeGif({
    framesDir,
    outputPath: gifPath,
    fps: project.canvas.fps,
    width: 800,
  });

  return {
    outputPath: gifPath,
    format: "gif",
    durationMs: Date.now() - startTime,
    frameCount: globalFrameIndex,
  };
}

/**
 * Render social batch: same first scene at multiple social media sizes.
 */
async function renderSocial(
  project: Project,
  componentSources: ComponentSource[],
  workDir: string,
  gsapDir: string,
  outputPath: string,
  startTime: number,
): Promise<RenderResult> {
  const scene = project.scenes[0];
  if (!scene) throw new Error("No scenes in project");

  const socialDir = path.join(path.dirname(outputPath), "social");
  await fs.mkdir(socialDir, { recursive: true });

  const outputs: string[] = [];

  for (const [presetName, dims] of Object.entries(SOCIAL_PRESETS)) {
    const canvas = { ...project.canvas, width: dims.width, height: dims.height };

    const html = await assembleScene({
      scene,
      components: componentSources,
      brandKit: project.brand_kit,
      canvas,
      gsapDir,
    });

    const htmlPath = path.join(workDir, `social_${presetName}.html`);
    const pngPath = path.join(socialDir, `${presetName}.png`);
    await fs.writeFile(htmlPath, html);

    await captureSingleFrame({
      htmlPath,
      outputPath: pngPath,
      width: dims.width,
      height: dims.height,
      format: "png",
      atTime: scene.duration_seconds ? scene.duration_seconds / 2 : 0,
    });

    outputs.push(pngPath);
    console.log(`  Social: ${presetName} (${dims.width}x${dims.height})`);
  }

  return {
    outputPath: socialDir,
    format: "social",
    durationMs: Date.now() - startTime,
  };
}

/**
 * Render email header: animated GIF (600px wide) + static PNG fallback.
 */
async function renderEmailHeader(
  project: Project,
  componentSources: ComponentSource[],
  workDir: string,
  gsapDir: string,
  outputPath: string,
  startTime: number,
): Promise<RenderResult> {
  const outputDir = path.dirname(outputPath);
  const baseName = path.basename(outputPath, path.extname(outputPath));

  // 1. Render the animated GIF (all scenes, 600px wide)
  const framesDir = path.join(workDir, "email_frames");
  await fs.mkdir(framesDir, { recursive: true });

  let globalFrameIndex = 0;

  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    const sceneDir = path.join(workDir, `email_scene_${i}`);
    await fs.mkdir(sceneDir, { recursive: true });

    const html = await assembleScene({
      scene,
      components: componentSources,
      brandKit: project.brand_kit,
      canvas: project.canvas,
      gsapDir,
    });

    const htmlPath = path.join(sceneDir, "scene.html");
    await fs.writeFile(htmlPath, html);

    const result = await captureScene({
      htmlPath,
      outputDir: sceneDir,
      width: project.canvas.width,
      height: project.canvas.height,
      fps: project.canvas.fps,
      duration: scene.duration_seconds,
    });

    for (let f = 0; f < result.frameCount; f++) {
      const srcFrame = path.join(sceneDir, `frame-${String(f + 1).padStart(6, "0")}.png`);
      const dstFrame = path.join(framesDir, `frame-${String(globalFrameIndex + 1).padStart(6, "0")}.png`);
      await fs.copyFile(srcFrame, dstFrame);
      globalFrameIndex++;
    }
  }

  const gifPath = path.join(outputDir, `${baseName}.gif`);
  await encodeGif({
    framesDir,
    outputPath: gifPath,
    fps: project.canvas.fps,
    width: 600,
  });

  // 2. Render the static PNG fallback (first scene, hero moment)
  const scene = project.scenes[0];
  if (scene) {
    const html = await assembleScene({
      scene,
      components: componentSources,
      brandKit: project.brand_kit,
      canvas: project.canvas,
      gsapDir,
    });

    const htmlPath = path.join(workDir, "email_fallback.html");
    const pngPath = path.join(outputDir, `${baseName}-fallback.png`);
    await fs.writeFile(htmlPath, html);

    await captureSingleFrame({
      htmlPath,
      outputPath: pngPath,
      width: 600,
      height: Math.round(600 * (project.canvas.height / project.canvas.width)),
      format: "png",
      atTime: scene.duration_seconds ? scene.duration_seconds / 2 : 0,
    });

    console.log(`  Email header fallback PNG: ${pngPath}`);
  }

  return {
    outputPath: gifPath,
    format: "email-header",
    durationMs: Date.now() - startTime,
    frameCount: globalFrameIndex,
  };
}

/**
 * Resolve an asset path. If it's already absolute, use it directly.
 * Otherwise resolve relative to the project's assets directory.
 */
function resolveAssetPath(source: string, tenantId: string, projectId: string): string {
  if (path.isAbsolute(source)) return source;
  return path.join(projectAssetsDir(tenantId, projectId), source);
}

/**
 * Load component .component.html sources for all types used in the project.
 */
async function loadComponentSources(
  project: Project,
  componentLibDir: string,
  extraDirs?: string[],
): Promise<ComponentSource[]> {
  // Collect all unique component types used in the project
  const types = new Set<string>();
  for (const scene of project.scenes) {
    for (const comp of scene.components) {
      types.add(comp.type);
    }
  }

  const sources: ComponentSource[] = [];

  for (const type of types) {
    const source = await findComponentSource(type, componentLibDir, extraDirs);
    if (source) {
      sources.push({ type, source });
    } else {
      console.warn(`  Warning: component type "${type}" not found`);
    }
  }

  return sources;
}

/**
 * Find a component's .component.html file by searching category subdirs.
 */
async function findComponentSource(
  type: string,
  componentLibDir: string,
  extraDirs?: string[],
): Promise<string | null> {
  // Search extra dirs first (project-local freeform components take priority)
  if (extraDirs) {
    for (const dir of extraDirs) {
      try {
        const filePath = path.join(dir, `${type}.component.html`);
        return await fs.readFile(filePath, "utf-8");
      } catch {
        // Not in this dir, continue
      }
    }
  }

  // Search all subdirectories in the component library
  try {
    const categories = await fs.readdir(componentLibDir, { withFileTypes: true });
    for (const cat of categories) {
      if (!cat.isDirectory()) continue;
      const filePath = path.join(componentLibDir, cat.name, `${type}.component.html`);
      try {
        return await fs.readFile(filePath, "utf-8");
      } catch {
        // Not in this category, continue
      }
    }
  } catch {
    // componentLibDir doesn't exist
  }

  // Also check root level
  try {
    const filePath = path.join(componentLibDir, `${type}.component.html`);
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
