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
import { assembleScene, type ComponentSource } from "./scene-assembler.js";
import { captureScene, captureSingleFrame } from "./capture.js";
import { encodeScene, concatSegments } from "./encode.js";
import { renderTransition, extractFirstFrame, extractLastFrame } from "./transitions.js";
import { critiqueScene } from "../llm/critiquer.js";
import { config } from "../config.js";
import type { LLMConfig } from "../llm/client.js";
import type { Project, Scene } from "./types.js";

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
      return renderDeck(project, componentSources, workDir, gsapDir, outputPath, startTime);

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
 * Render a single scene to MP4, including optional critique loop.
 * Returns { mp4Path, frameCount }.
 */
async function renderSingleScene(
  project: Project,
  scene: Scene,
  sceneIndex: number,
  componentSources: ComponentSource[],
  workDir: string,
  gsapDir: string,
  critiqueOpts?: { critique?: boolean; maxRevisions?: number; llmConfig?: LLMConfig; originalPrompt?: string },
): Promise<{ mp4Path: string; frameCount: number }> {
  console.log(`\n  Scene ${sceneIndex + 1}/${project.scenes.length}: "${scene.label || scene.id}"`);

  // Assemble scene HTML
  const html = await assembleScene({
    scene,
    components: componentSources,
    brandKit: project.brand_kit,
    canvas: project.canvas,
    gsapDir,
  });

  const sceneDir = path.join(workDir, `scene_${sceneIndex}`);
  const htmlPath = path.join(sceneDir, "scene.html");
  const framesDir = path.join(sceneDir, "frames");
  const mp4Path = path.join(sceneDir, "scene.mp4");

  await fs.mkdir(sceneDir, { recursive: true });
  await fs.writeFile(htmlPath, html);

  // Critiquer loop: preview -> critique -> revise -> repeat
  if (critiqueOpts?.critique && critiqueOpts.llmConfig) {
    let currentHtml = html;
    for (let rev = 0; rev < (critiqueOpts.maxRevisions || 2); rev++) {
      const previewPath = path.join(sceneDir, `preview_rev${rev}.png`);
      await captureSingleFrame({
        htmlPath,
        outputPath: previewPath,
        width: project.canvas.width,
        height: project.canvas.height,
        format: "png",
        atTime: scene.duration_seconds ? scene.duration_seconds / 3 : 0,
      });

      const previewBase64 = (await fs.readFile(previewPath)).toString("base64");

      const critique = await critiqueScene({
        sceneHtml: currentHtml,
        previewImageBase64: previewBase64,
        prompt: scene.label || critiqueOpts.originalPrompt || "",
        llmConfig: critiqueOpts.llmConfig,
        format: project.format,
      });

      console.log(`    Critique score: ${critique.score}/10`);
      if (critique.score >= 7 || !critique.revised_html) break;

      currentHtml = critique.revised_html;
      await fs.writeFile(htmlPath, currentHtml);
      console.log(`    Applied revision ${rev + 1}`);
    }
  }

  // Capture frames
  const captureResult = await captureScene({
    htmlPath,
    outputDir: framesDir,
    fps: project.canvas.fps,
    duration: scene.duration_seconds,
    width: project.canvas.width,
    height: project.canvas.height,
  });

  // Encode to MP4
  await encodeScene({
    framesDir,
    outputPath: mp4Path,
    fps: project.canvas.fps,
  });

  // Clean up frame PNGs to free disk space
  await fs.rm(framesDir, { recursive: true, force: true });

  return { mp4Path, frameCount: captureResult.frameCount };
}

/**
 * Render scenes in parallel batches with configurable concurrency.
 */
async function renderScenesParallel(
  project: Project,
  componentSources: ComponentSource[],
  workDir: string,
  gsapDir: string,
  critiqueOpts?: { critique?: boolean; maxRevisions?: number; llmConfig?: LLMConfig; originalPrompt?: string },
): Promise<Array<{ mp4Path: string; frameCount: number }>> {
  const concurrency = config.renderConcurrency;
  const results = new Array<{ mp4Path: string; frameCount: number }>(project.scenes.length);

  console.log(`  Rendering ${project.scenes.length} scenes (concurrency: ${concurrency})`);

  for (let batch = 0; batch < project.scenes.length; batch += concurrency) {
    const batchScenes = project.scenes.slice(batch, batch + concurrency);
    const promises = batchScenes.map((scene, i) => {
      const idx = batch + i;
      return renderSingleScene(project, scene, idx, componentSources, workDir, gsapDir, critiqueOpts);
    });

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
  componentSources: ComponentSource[],
  workDir: string,
  gsapDir: string,
  outputPath: string,
  startTime: number,
  critiqueOpts?: { critique?: boolean; maxRevisions?: number; llmConfig?: LLMConfig; originalPrompt?: string },
): Promise<RenderResult> {
  // Render all scenes (in parallel batches)
  const sceneResults = await renderScenesParallel(
    project, componentSources, workDir, gsapDir, critiqueOpts,
  );

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
 */
async function renderDeck(
  _project: Project,
  _componentSources: ComponentSource[],
  _workDir: string,
  _gsapDir: string,
  _outputPath: string,
  startTime: number,
): Promise<RenderResult> {
  // TODO: implement PDF deck rendering
  throw new Error("Deck rendering not yet implemented");
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
