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
import { fork, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { assembleSceneAuto, type ComponentSource } from "./scene-assembler.js";

/**
 * Choose the right assembler based on scene type and assemble to HTML.
 * Delegates to assembleSceneAuto, which routes codegen scenes (with <component>
 * tags) through the codegen assembler (loading the full component library) and
 * everything else through the standard assembler.
 */
async function assembleSceneOrSequence(options: {
  scene: any;
  components: ComponentSource[];
  brandKit: any;
  canvas: any;
  gsapDir: string;
  preview?: boolean;
  speakerUrl?: string;
}): Promise<string> {
  return assembleSceneAuto({ ...options, componentLibDir: config.componentLibDir });
}
import { captureScene, captureSingleFrame } from "./capture.js";
import { encodeScene, encodeGif, concatSegments, applyFilmGrade } from "./encode.js";
import { exportPdf } from "./pdf-export.js";
import { renderTransition, extractFirstFrame, extractLastFrame, getTransitionScript, loadGsapMinimal } from "./transitions.js";
import { renderGlassTurnTransition, sceneHasGlassSlab } from "./glass-transition.js";
import { resolveAssetUrls } from "./scene-assembler.js";
// Critique now runs during generate, not render
import { config } from "../config.js";
import type { LLMConfig } from "../llm/client.js";
import type { Project, Scene } from "./types.js";
import { mixAudio, type AudioTrackInput } from "../audio/mixer.js";
import { buildSpeakerBase, compositeContentOverlay, speakerSceneFilmStarts } from "./speaker-track.js";
import { projectAssetsDir } from "../persistence/paths.js";

/**
 * Resolve a project's ducking config into mixer options.
 *
 * `trigger_track` may be a single track id, or the sentinel "voiceover" to
 * duck against ALL voiceover tracks (the auto pipeline generates one VO clip
 * per scene, so ducking must cover every window). As a safety net, if the
 * named trigger id doesn't exist but voiceover tracks do, we duck against
 * those rather than silently skipping.
 */
function resolveDucking(project: Project): Parameters<typeof mixAudio>[0]["ducking"] {
  const d = project.audio?.ducking;
  if (!d?.enabled || !project.audio) return undefined;

  const duckTrackObj = project.audio.tracks.find((t) => t.id === d.duck_track);
  let triggers = project.audio.tracks.filter((t) => t.id === d.trigger_track);
  if (triggers.length === 0) {
    triggers = project.audio.tracks.filter((t) => t.type === "voiceover");
  }

  if (!duckTrackObj || triggers.length === 0) {
    console.warn("  Ducking: track IDs not found, skipping ducking");
    return undefined;
  }

  console.log(`  Ducking: ${duckTrackObj.id} ducked by ${triggers.map((t) => t.id).join(", ")}`);
  return {
    duckTrack: duckTrackObj.source,
    triggerTracks: triggers.map((t) => t.source),
    duckedVolume: d.ducked_volume,
    attack: d.attack ?? 0.3,
    release: d.release ?? 0.5,
  };
}

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

  /** Additional directories to search for component sources (e.g. project-local scene components) */
  extraComponentDirs?: string[];

  /** When true, skip scene rendering and only re-apply audio mix to existing output */
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
 * Audio-only render: skip scene rendering, just re-apply audio mix
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
      trimStart: t.trim_start,
      fadeIn: t.fade_in,
      fadeOut: t.fade_out,
      loop: t.loop,
    }));

    const duckingOpts = resolveDucking(project);

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
  const html = await assembleSceneOrSequence({
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
  workerRegistry?: Set<ChildProcess>,
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
          "-profile:v", "high",
          "-level", "4.0",
          "-preset", "medium",
          "-crf", "18",
          "-maxrate", "16M",
          "-bufsize", "32M",
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
  const projectJsonPath = path.join(sceneDir, "project.json");
  await fs.writeFile(projectJsonPath, JSON.stringify(project));

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
    // Pipe stderr (keep stdout inherited so progress logs still stream) so a
    // worker crash surfaces its actual reason in the job error instead of being
    // lost to the server console. Keep only the tail to bound memory.
    const child = fork(workerPath, [argsPath], {
      execArgv: [],
      // fork() requires an "ipc" entry in the stdio array.
      stdio: ["inherit", "inherit", "pipe", "ipc"],
    });
    workerRegistry?.add(child);
    let stderrTail = "";
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        process.stderr.write(chunk); // still echo to server console
        stderrTail = (stderrTail + chunk.toString()).slice(-4000);
      });
    }
    child.on("exit", (code) => {
      workerRegistry?.delete(child);
      if (code === 0) resolve();
      else {
        const label = scene.label ? ` "${scene.label}"` : "";
        const tail = stderrTail.trim();
        reject(new Error(
          `Scene worker for scene ${sceneIndex + 1}${label} exited with code ${code}` +
          (tail ? `:\n${tail}` : "")
        ));
      }
    });
    child.on("error", reject);
  });

  // Clean up temp files
  await fs.unlink(projectJsonPath).catch(() => {});
  await fs.unlink(argsPath).catch(() => {});

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

  console.log(`  Rendering ${project.scenes.length} scenes (concurrency: ${concurrency})`);

  // Registry of in-flight scene workers. When one worker fails, Promise.all
  // rejects immediately -- but WITHOUT this, the sibling forks keep running as
  // zombies after the job is declared failed: they finish capturing, encode,
  // then delete their frames dir, corrupting any subsequent render that reuses
  // the same scene work dirs ("Could find no file ... frames"). On failure,
  // kill every still-running worker before propagating.
  const workers = new Set<ChildProcess>();

  for (let batch = 0; batch < project.scenes.length; batch += concurrency) {
    const batchEnd = Math.min(batch + concurrency, project.scenes.length);
    const promises: Promise<{ mp4Path: string; frameCount: number }>[] = [];

    for (let idx = batch; idx < batchEnd; idx++) {
      promises.push(renderSingleSceneWorker(project, idx, workDir, critiqueOpts, extraComponentDirs, workers));
    }

    let batchResults;
    try {
      batchResults = await Promise.all(promises);
    } catch (e) {
      for (const child of workers) child.kill("SIGKILL");
      workers.clear();
      throw e;
    }
    for (let i = 0; i < batchResults.length; i++) {
      results[batch + i] = batchResults[i];
    }
  }

  return results;
}



/**
 * Render a video output using the continuous speaker track architecture.
 *
 * Two-layer pipeline:
 *   1. Build a single continuous speaker base video (never sliced/seeked per scene)
 *   2. Render ALL scene content as transparent PNGs in one continuous sequence
 *   3. Composite in a single ffmpeg pass: speaker (base) + content (overlay)
 *
 * This eliminates audio drift caused by per-scene seeks in the old full-behind approach.
 */
async function renderVideoWithSpeakerTrack(
  project: Project,
  workDir: string,
  gsapDir: string,
  outputPath: string,
  critiqueOpts?: { critique?: boolean; maxRevisions?: number; llmConfig?: LLMConfig; originalPrompt?: string },
  extraComponentDirs?: string[],
): Promise<RenderResult> {
  const startTime = Date.now();
  const { canvas, scenes, speaker_track } = project;
  if (!speaker_track) throw new Error("renderVideoWithSpeakerTrack called without speaker_track");

  const fps = canvas.fps;
  const width = canvas.width;
  const height = canvas.height;

  // ── 1. Calculate total duration (scenes + transitions) ──
  // We need to know the transition durations to compute total frame count.
  // Transitions are rendered as their own mini-segments (GSAP HTML scenes).
  // The total content duration = sum(scene durations) + sum(transition durations).
  let totalDuration = 0;
  for (const scene of scenes) {
    totalDuration += scene.duration_seconds;
  }
  // Add transition durations
  for (let i = 1; i < scenes.length; i++) {
    const t = scenes[i].transition_in;
    if (t && t.type !== "none") {
      totalDuration += t.duration_seconds;
    }
  }
  const totalFrameCount = Math.ceil(totalDuration * fps);

  console.log(`
[speaker-track] Pipeline start`);
  console.log(`  Scenes: ${scenes.length}, total duration: ${totalDuration.toFixed(2)}s, frames: ${totalFrameCount}`);

  // ── 2. Build continuous speaker base video ──
  const speakerBaseDir = path.join(workDir, "speaker_base");
  await fs.mkdir(speakerBaseDir, { recursive: true });
  const speakerBasePath = path.join(speakerBaseDir, "speaker_base.mp4");

  console.log(`
[speaker-track] Step 1: Building speaker base video...`);
  await buildSpeakerBase({
    speakerTrack: speaker_track,
    totalDuration,
    width,
    height,
    outputPath: speakerBasePath,
    workDir: speakerBaseDir,
  });
  console.log(`  Speaker base: ${speakerBasePath}`);

  // ── 2b. Resolve "speaker" source references in scene component data ──
  // Any component data value equal to "speaker" is replaced with the actual
  // file:// path to the speaker base video. `start_at` is set to the scene's
  // cumulative start time so the capture worker seeks to the right position.
  const speakerFileUrl = `file://${path.resolve(speakerBasePath)}`;
  const filmStarts = speakerSceneFilmStarts(project.scenes);
  {
    for (let si2 = 0; si2 < project.scenes.length; si2++) {
      const scene = project.scenes[si2];
      for (const comp of scene.components) {
        const dataCopy = comp.data as Record<string, unknown>;
        for (const [key, val] of Object.entries(dataCopy)) {
          if (val === "speaker") {
            dataCopy[key] = speakerFileUrl;
          }
        }
        // If any source key was replaced, set start_at for timeline sync
        if (
          dataCopy.src === speakerFileUrl ||
          dataCopy.pip_source === speakerFileUrl ||
          dataCopy.source === speakerFileUrl
        ) {
          dataCopy.start_at = filmStarts[si2];
        }
      }
    }
  }

  // ── 3. Render all scenes as transparent PNGs ──
  // Each scene is rendered with transparent_background = true.
  // The scene-worker leaves frames in {sceneDir}/frames/ when captureAsPng is set.
  console.log(`
[speaker-track] Step 2: Rendering ${scenes.length} scene(s) as transparent PNGs...`);

  const sceneFrameDirs: Array<{ framesDir: string; frameCount: number }> = [];

  // Per-scene start offsets into the film (INCLUDING inserted transition
  // time), so a raw <video src="speaker"> PiP seeks the camera to true
  // film-time -- the same clock the speaker base and voice follow.
  const sceneStartTimes = filmStarts;

  // Render scenes in parallel batches (same concurrency as normal pipeline).
  // Same zombie-worker guard as renderScenesParallel: on failure, kill the
  // still-running sibling forks before propagating.
  const concurrency = config.renderConcurrency;
  const speakerWorkers = new Set<ChildProcess>();
  for (let batch = 0; batch < scenes.length; batch += concurrency) {
    const batchEnd = Math.min(batch + concurrency, scenes.length);
    const promises: Promise<{ framesDir: string; frameCount: number }>[] = [];

    for (let idx = batch; idx < batchEnd; idx++) {
      promises.push(renderSceneTransparentFrames(project, idx, workDir, critiqueOpts, extraComponentDirs, speakerWorkers, {
        speakerUrl: speakerFileUrl,
        speakerOffset: sceneStartTimes[idx],
      }));
    }

    let batchResults;
    try {
      batchResults = await Promise.all(promises);
    } catch (e) {
      for (const child of speakerWorkers) child.kill("SIGKILL");
      speakerWorkers.clear();
      throw e;
    }
    for (const r of batchResults) {
      sceneFrameDirs.push(r);
    }
  }

  // ── 4. Render transitions as transparent PNGs ──
  // For each transition between scenes i-1 and i, we render the GSAP transition
  // using the last frame of scene i-1 and first frame of scene i.
  // Transition frames are transparent (content crossfade) -- speaker plays through.
  console.log(`
[speaker-track] Step 3: Rendering transitions as transparent PNGs...`);

  // We need scene preview frames (last of prev, first of next) for transition rendering.
  // Build opaque snapshots from the transparent frames for the GSAP transition engine
  // (it expects opaque PNG inputs -- the frames represent content, not speaker).
  const transitionFrameDirs: Array<{ framesDir: string; frameCount: number } | null> = [];

  for (let i = 1; i < scenes.length; i++) {
    const scene = scenes[i];
    const t = scene.transition_in;
    if (!t || t.type === "none") {
      transitionFrameDirs.push(null);
      continue;
    }

    const transWorkDir = path.join(workDir, `speaker_transition_${i - 1}_${i}`);
    await fs.mkdir(transWorkDir, { recursive: true });

    // Extract last/first frames from the transparent scene PNG sequences.
    // The transition HTML renders content-to-content crossfade (no speaker).
    const prevSceneFrames = sceneFrameDirs[i - 1];
    const currSceneFrames = sceneFrameDirs[i];

    const prevFrameCount = prevSceneFrames.frameCount;
    const lastFrameSrc = path.join(prevSceneFrames.framesDir, `frame-${String(prevFrameCount - 1).padStart(6, "0")}.png`);
    const firstFrameSrc = path.join(currSceneFrames.framesDir, `frame-${String(0).padStart(6, "0")}.png`);

    const lastFrameDst = path.join(transWorkDir, "frameA.png");
    const firstFrameDst = path.join(transWorkDir, "frameB.png");

    await fs.copyFile(lastFrameSrc, lastFrameDst);
    await fs.copyFile(firstFrameSrc, firstFrameDst);

    console.log(`  Transition ${i - 1}->${i}: ${t.type} (${t.duration_seconds}s)`);
    const transitionFramesInfo = await renderTransitionTransparent({
      type: t.type,
      duration: t.duration_seconds,
      frameA: lastFrameDst,
      frameB: firstFrameDst,
      width,
      height,
      fps,
      workDir: transWorkDir,
      gsapDir,
    });

    transitionFrameDirs.push(transitionFramesInfo);
  }

  // ── 5. Stitch all frames into one continuous numbered sequence ──
  console.log(`
[speaker-track] Step 4: Stitching frames into continuous sequence...`);
  const contentFramesDir = path.join(workDir, "speaker_content_frames");
  await fs.mkdir(contentFramesDir, { recursive: true });

  let globalFrameIdx = 0;
  for (let i = 0; i < scenes.length; i++) {
    // Copy scene frames
    const { framesDir, frameCount } = sceneFrameDirs[i];
    for (let f = 0; f < frameCount; f++) {
      const src = path.join(framesDir, `frame-${String(f).padStart(6, "0")}.png`);
      const dst = path.join(contentFramesDir, `frame-${String(globalFrameIdx).padStart(6, "0")}.png`);
      await fs.copyFile(src, dst);
      globalFrameIdx++;
    }

    // Copy transition frames (after this scene, before scene i+1)
    if (i < transitionFrameDirs.length && transitionFrameDirs[i]) {
      const trans = transitionFrameDirs[i]!;
      for (let f = 0; f < trans.frameCount; f++) {
        const src = path.join(trans.framesDir, `frame-${String(f).padStart(6, "0")}.png`);
        const dst = path.join(contentFramesDir, `frame-${String(globalFrameIdx).padStart(6, "0")}.png`);
        await fs.copyFile(src, dst);
        globalFrameIdx++;
      }
    }
  }

  console.log(`  Total frames stitched: ${globalFrameIdx} (expected ~${totalFrameCount})`);

  // ── 6. Single-pass composite: speaker base + content overlay ──
  console.log(`
[speaker-track] Step 5: Compositing content overlay onto speaker base...`);
  await compositeContentOverlay({
    speakerVideoPath: speakerBasePath,
    contentFramesDir,
    fps,
    outputPath,
    width,
    height,
  });

    // ── 7. Audio mixing (project-level background music / voiceover) ──
  const totalProjectDuration = scenes.reduce((sum, s) => sum + s.duration_seconds, 0);
  if (project.audio && project.audio.tracks.length > 0) {
    console.log(`
[speaker-track] Mixing ${project.audio.tracks.length} audio track(s)...`);
    const audioOutput = outputPath.replace(/\.mp4$/, "-with-audio.mp4");
    const audioTracks = project.audio.tracks.map((t) => ({
      path: t.source,
      type: t.type,
      volume: t.volume,
      startTime: t.start_time,
      trimStart: t.trim_start,
      fadeIn: t.fade_in,
      fadeOut: t.fade_out,
      loop: t.loop,
    }));

    const duckingOpts = resolveDucking(project);

    await mixAudio({
      videoPath: outputPath,
      outputPath: audioOutput,
      tracks: audioTracks,
      ducking: duckingOpts,
      totalDuration: totalProjectDuration,
    });
    await fs.rename(audioOutput, outputPath);
  }

  // Clean up intermediate files
  await fs.rm(speakerBaseDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(contentFramesDir, { recursive: true, force: true }).catch(() => {});

  const durationMs = Date.now() - startTime;
  console.log(`
[speaker-track] Render complete: ${outputPath}`);
  console.log(`  Total frames: ${globalFrameIdx}`);
  console.log(`  Total time: ${(durationMs / 1000).toFixed(1)}s`);

  return {
    outputPath,
    format: project.format,
    durationMs,
    frameCount: globalFrameIdx,
  };
}

/**
 * Render a single scene's content as transparent PNG frames for the speaker track pipeline.
 * Reuses the existing scene-worker with captureAsPng=true.
 * Returns the path to the frames directory and the frame count.
 */
async function renderSceneTransparentFrames(
  project: Project,
  sceneIndex: number,
  workDir: string,
  critiqueOpts?: { critique?: boolean; maxRevisions?: number; llmConfig?: LLMConfig; originalPrompt?: string },
  extraComponentDirs?: string[],
  workerRegistry?: Set<ChildProcess>,
  speakerRef?: { speakerUrl: string; speakerOffset: number },
): Promise<{ framesDir: string; frameCount: number }> {
  const scene = project.scenes[sceneIndex];
  const sceneDir = path.join(workDir, `speaker_scene_${sceneIndex}`);
  await fs.mkdir(sceneDir, { recursive: true });

  // Clone project and set transparent background for this scene.
  // Only force transparency if the scene hasn't explicitly set transparent_background = false.
  // Scenes that want opaque backgrounds (e.g. screencast, Brady grid) set this to false.
  const projectClone = JSON.parse(JSON.stringify(project));
  if (projectClone.scenes[sceneIndex].transparent_background !== false) {
    projectClone.scenes[sceneIndex].transparent_background = true;
  }

  const projectJsonPath = path.join(sceneDir, "project.json");
  await fs.writeFile(projectJsonPath, JSON.stringify(projectClone));

  const argsPath = path.join(sceneDir, ".worker-args.json");
  const workerArgs: Record<string, unknown> = {
    projectJsonPath,
    sceneIndex,
    workDir: sceneDir,
    componentLibDir: config.componentLibDir,
    gsapDir: config.gsapDir,
    outputMp4Path: path.join(sceneDir, "scene.mp4"), // not used when captureAsPng=true
    width: project.canvas.width,
    height: project.canvas.height,
    fps: project.canvas.fps,
    extraComponentDirs: extraComponentDirs || [],
    captureAsPng: true,
  };

  if (speakerRef) {
    workerArgs.speakerUrl = speakerRef.speakerUrl;
    workerArgs.speakerOffset = speakerRef.speakerOffset;
  }

  if (critiqueOpts?.critique && critiqueOpts.llmConfig) {
    workerArgs.critique = true;
    workerArgs.maxRevisions = critiqueOpts.maxRevisions || 2;
    workerArgs.anthropicApiKey = critiqueOpts.llmConfig.apiKey;
    workerArgs.critiqueModel = critiqueOpts.llmConfig.model;
    workerArgs.format = project.format;
    workerArgs.originalPrompt = critiqueOpts.originalPrompt || "";
  }

  await fs.writeFile(argsPath, JSON.stringify(workerArgs));

  const workerPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "scene-worker.js"
  );

  await new Promise<void>((resolve, reject) => {
    const child = fork(workerPath, [argsPath], { execArgv: [], stdio: ["inherit", "inherit", "pipe", "ipc"] });
    workerRegistry?.add(child);
    let stderrTail = "";
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        process.stderr.write(chunk);
        stderrTail = (stderrTail + chunk.toString()).slice(-4000);
      });
    }
    child.on("exit", (code) => {
      workerRegistry?.delete(child);
      if (code === 0) resolve();
      else {
        const tail = stderrTail.trim();
        reject(new Error(
          `Scene worker exited with code ${code} for scene ${sceneIndex}` +
          (tail ? `:\n${tail}` : "")
        ));
      }
    });
    child.on("error", reject);
  });

  await fs.unlink(projectJsonPath).catch(() => {});
  await fs.unlink(argsPath).catch(() => {});

  const framesDir = path.join(sceneDir, "frames");
  const frameCount = Math.ceil(scene.duration_seconds * project.canvas.fps);
  return { framesDir, frameCount };
}

/**
 * Render a GSAP transition as transparent PNG frames for the speaker track pipeline.
 *
 * Builds the transition HTML with a transparent background and captures
 * directly as PNGs with omitBackground, preserving alpha for compositing
 * onto the speaker base layer.
 */
async function renderTransitionTransparent(opts: {
  type: string;
  duration: number;
  frameA: string;
  frameB: string;
  width: number;
  height: number;
  fps: number;
  workDir: string;
  gsapDir: string;
}): Promise<{ framesDir: string; frameCount: number }> {
  const { type, duration, frameA, frameB, width, height, fps, workDir, gsapDir } = opts;

  // Build transition HTML with transparent background
  const frameABase64 = (await fs.readFile(frameA)).toString("base64");
  const frameBBase64 = (await fs.readFile(frameB)).toString("base64");
  const gsapSource = await loadGsapMinimal(gsapDir);
  const animScript = getTransitionScript(type, duration, width);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: ${width}px;
  height: ${height}px;
  overflow: hidden;
  background: transparent;
}
#frameA, #frameB {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
<script>
${gsapSource}
</` + `script>
</head>
<body>
<img id="frameA" src="data:image/png;base64,${frameABase64}">
<img id="frameB" src="data:image/png;base64,${frameBBase64}">
<script>
(function() {
  var imgA = document.getElementById('frameA');
  var imgB = document.getElementById('frameB');
  var dur = ${duration};
  var tl = gsap.timeline({ paused: true });
  ${animScript}
  window.__MP_TIMELINE = tl;
  window.__MP_DURATION = dur;
  window.__MP_READY = true;
})();
</` + `script>
</body>
</html>`;

  const htmlPath = path.join(workDir, "transition.html");
  await fs.writeFile(htmlPath, html);

  // Capture directly as transparent PNGs (0-based frame numbering)
  const framesDir = path.join(workDir, "content_frames");
  await captureScene({
    htmlPath,
    outputDir: framesDir,
    fps,
    duration,
    width,
    height,
    format: "png",
    omitBackground: true,
  });

  const frameCount = Math.ceil(duration * fps);
  return { framesDir, frameCount };
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
  // ── Speaker Track pipeline branch ──
  // When project.speaker_track is set, use the new continuous base layer architecture.
  // This avoids per-scene speaker seeks which cause audio drift with transitions.
  if (project.speaker_track) {
    return renderVideoWithSpeakerTrack(project, workDir, gsapDir, outputPath, critiqueOpts, extraComponentDirs);
  }

  // Render all scenes (in parallel batches, each as a child process)
  const sceneResults = await renderScenesParallel(project, workDir, critiqueOpts, extraComponentDirs);

  const sceneMp4s = sceneResults.map((r) => r.mp4Path);
  const totalFrames = sceneResults.reduce((sum, r) => sum + r.frameCount, 0);

  // Build the final segment list: scene + transition + scene + transition + ...
  if (sceneMp4s.length > 1) {
    const segments: string[] = [sceneMp4s[0]];

    for (let i = 1; i < sceneMp4s.length; i++) {
      const scene = project.scenes[i];
      const prevScene = project.scenes[i - 1];
      let transitionType: string = scene.transition_in?.type || "crossfade";
      const transitionDuration = scene.transition_in?.duration_seconds || 0.5;

      if (transitionType === "none") {
        // No transition, just append the scene
        segments.push(sceneMp4s[i]);
        continue;
      }

      // ── Shared-element match cut between glass-slab scenes ──
      // A crossfade between frozen frames breaks object continuity when both
      // neighbors are glass-slab scenes: the transition instead reuses the
      // component itself and turns the pane back to edge-on (= scene B's
      // opening pose), so one continuous object carries across the cut.
      // Default transitions auto-upgrade; explicit non-default choices are
      // respected.
      const bothGlass = sceneHasGlassSlab(prevScene) && sceneHasGlassSlab(scene);
      if (bothGlass && (transitionType === "glass-turn" || transitionType === "crossfade" || transitionType === "blur-crossfade")) {
        const glassComp = prevScene.components.find((c) => c.type === "glass-slab");
        const glassSource = _componentSources.find((s) => s.type === "glass-slab")?.source;
        if (glassComp && glassSource) {
          const glassWorkDir = path.join(workDir, `transition_${i - 1}_${i}`);
          try {
            console.log(`\n  Transition ${i - 1}->${i}: glass-turn (${transitionDuration}s)${transitionType !== "glass-turn" ? ` [upgraded from ${transitionType}]` : ""}`);
            const mp4 = await renderGlassTurnTransition({
              glassData: resolveAssetUrls(glassComp.data as Record<string, any>, false),
              sceneDurationA: prevScene.duration_seconds,
              motion: project.brand_kit?.style?.motion,
              duration: transitionDuration,
              width: project.canvas.width,
              height: project.canvas.height,
              fps: project.canvas.fps,
              workDir: glassWorkDir,
              gsapDir,
              componentSource: glassSource,
            });
            segments.push(mp4);
            segments.push(sceneMp4s[i]);
            continue;
          } catch (e: any) {
            console.warn(`  glass-turn failed (falling back to crossfade): ${e.message}`);
          }
        }
        transitionType = "crossfade";
      } else if (transitionType === "glass-turn") {
        // glass-turn requested but the neighbors aren't both glass scenes.
        transitionType = "crossfade";
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

  // ── Film grade: one consistent color pass over the whole film ──
  // Runs on the silent concat (before audio mux, which stream-copies video).
  if (project.film_grade && project.film_grade !== "none") {
    console.log(`\n  Film grade: applying "${project.film_grade}" pass...`);
    const gradedPath = outputPath.replace(/\.mp4$/, "-graded.mp4");
    try {
      await applyFilmGrade(outputPath, gradedPath, project.film_grade);
      await fs.rename(gradedPath, outputPath);
    } catch (e: any) {
      console.warn(`  Film grade failed (non-fatal, using ungraded video): ${e.message}`);
      await fs.rm(gradedPath, { force: true }).catch(() => {});
    }
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
      trimStart: t.trim_start,
      fadeIn: t.fade_in,
      fadeOut: t.fade_out,
      loop: t.loop,
    }));

    // Resolve ducking track IDs to file paths (mixer matches by path)
    const duckingOpts = resolveDucking(project);

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
    const html = await assembleSceneOrSequence({
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

    const html = await assembleSceneOrSequence({
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
      fps: 12, // GIF: reduced fps for reasonable file size
      duration: scene.duration_seconds,
    });

    // Copy frames to the unified frames directory with sequential numbering
    // captureScene writes 0-indexed frames: frame-000000.png, frame-000001.png, etc.
    for (let f = 0; f < result.frameCount; f++) {
      const srcFrame = path.join(sceneDir, `frame-${String(f).padStart(6, "0")}.png`);
      const dstFrame = path.join(framesDir, `frame-${String(globalFrameIndex).padStart(6, "0")}.png`);
      try {
        await fs.copyFile(srcFrame, dstFrame);
        globalFrameIndex++;
      } catch (e) {
        // Frame might not exist if capture was short
        console.warn(`  GIF: missing frame ${f} for scene ${i}, stopping at ${globalFrameIndex} total frames`);
        break;
      }
    }
  }

  const gifPath = outputPath.endsWith(".gif") ? outputPath : outputPath.replace(/\.[^.]+$/, ".gif");
  await encodeGif({
    framesDir,
    outputPath: gifPath,
    fps: 12,
    width: 640,
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

    const html = await assembleSceneOrSequence({
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

    const html = await assembleSceneOrSequence({
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
    const html = await assembleSceneOrSequence({
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
  const loaded = new Set<string>();

  // Resolve component types, including nested <component type="..."> tags that
  // codegen scene components reference internally (e.g. mesh-gradient,
  // depth-blur). Without these the codegen assembler can't register their
  // timelines and the page errors on ctx.getComponentTimeline().
  const NESTED_TAG_RE = /<component\s+[^>]*\btype=["']([^"']+)["']/g;
  const queue = [...types];
  while (queue.length > 0) {
    const type = queue.shift()!;
    if (loaded.has(type)) continue;
    loaded.add(type);

    const source = await findComponentSource(type, componentLibDir, extraDirs);
    if (source) {
      sources.push({ type, source });
      // Discover any nested component types referenced by this source
      let m: RegExpExecArray | null;
      NESTED_TAG_RE.lastIndex = 0;
      while ((m = NESTED_TAG_RE.exec(source)) !== null) {
        if (!loaded.has(m[1])) queue.push(m[1]);
      }
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
  // Search extra dirs first (project-local scene components take priority)
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
