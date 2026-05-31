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
import { fork } from "node:child_process";
import { assembleScene, type ComponentSource } from "./scene-assembler.js";
import { captureScene, captureSingleFrame } from "./capture.js";
import { encodeScene, encodeGif, concatSegments } from "./encode.js";
import { exportPdf } from "./pdf-export.js";
import { renderTransition, extractFirstFrame, extractLastFrame } from "./transitions.js";
import { critiqueScene } from "../llm/critiquer.js";
import { config } from "../config.js";
import type { LLMConfig } from "../llm/client.js";
import type { Project, Scene } from "./types.js";
import { mixAudio, type AudioTrackInput } from "../audio/mixer.js";

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
  /** Run critiquer loop on each scene */
  critique?: boolean;
  /** Max revision iterations per scene (default 2) */
  maxRevisions?: number;
  /** LLM config needed for critiquer calls */
  llmConfig?: LLMConfig;
  /** Original prompt for context in critique */
  originalPrompt?: string;
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
  const componentSources = await loadComponentSources(project, componentLibDir);

  switch (project.format) {
    case "image":
    case "one-pager":
      return renderImage(project, componentSources, workDir, gsapDir, outputPath, startTime);

    case "video":
    case "slideshow":
      return renderVideo(project, componentSources, workDir, gsapDir, outputPath, startTime, {
        critique: options.critique,
        maxRevisions: options.maxRevisions,
        llmConfig: options.llmConfig,
        originalPrompt: options.originalPrompt,
      });

    case "deck":
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
): Promise<{ mp4Path: string; frameCount: number }> {
  const scene = project.scenes[sceneIndex];
  const sceneDir = path.join(workDir, `scene_${sceneIndex}`);
  const mp4Path = path.join(sceneDir, "scene.mp4");

  await fs.mkdir(sceneDir, { recursive: true });

  // Write the project JSON for the worker to read
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
    "scene-worker.ts"
  );

  await new Promise<void>((resolve, reject) => {
    const child = fork(workerPath, [argsPath], {
      execArgv: ["--import", "tsx/esm"],
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
): Promise<Array<{ mp4Path: string; frameCount: number }>> {
  const concurrency = config.renderConcurrency;
  const results = new Array<{ mp4Path: string; frameCount: number }>(project.scenes.length);

  console.log(`  Rendering ${project.scenes.length} scenes (concurrency: ${concurrency})`);

  for (let batch = 0; batch < project.scenes.length; batch += concurrency) {
    const batchEnd = Math.min(batch + concurrency, project.scenes.length);
    const promises: Promise<{ mp4Path: string; frameCount: number }>[] = [];
    
    for (let idx = batch; idx < batchEnd; idx++) {
      promises.push(renderSingleSceneWorker(project, idx, workDir, critiqueOpts));
    }

    const batchResults = await Promise.all(promises);
    for (let i = 0; i < batchResults.length; i++) {
      results[batch + i] = batchResults[i];
    }
  }

  return results;
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
): Promise<RenderResult> {
  // Render all scenes (in parallel batches, each as a child process)
  const sceneResults = await renderScenesParallel(project, workDir, critiqueOpts);

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

    const duckingOpts = project.audio.ducking?.enabled
      ? {
          duckTrack: project.audio.ducking.duck_track,
          triggerTrack: project.audio.ducking.trigger_track,
          duckedVolume: project.audio.ducking.ducked_volume,
          attack: project.audio.ducking.attack ?? 0.3,
          release: project.audio.ducking.release ?? 0.5,
        }
      : undefined;

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
 * Render a multi-page PDF deck.
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
      atTime: 0,
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
 * Load component .component.html sources for all types used in the project.
 */
async function loadComponentSources(
  project: Project,
  componentLibDir: string,
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
    const source = await findComponentSource(type, componentLibDir);
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
): Promise<string | null> {
  // Search all subdirectories
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
