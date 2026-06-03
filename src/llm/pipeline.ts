/**
 * Pipeline Orchestrator
 *
 * Main entry point for the LLM generation pipeline. The `generate` MCP tool
 * calls this. Routes by target format.
 *
 * All multi-scene formats (video, presentation, image, scene) go through
 * the unified pipeline: one planner decides per-scene whether to use library
 * components or generate custom HTML. A `creativity` parameter (0-1) biases
 * the decision.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import type { LLMConfig } from "./client.js";
import { generateComponentLLM } from "./component-gen.js";
import { expandPrompt } from "./expander.js";
import { buildComponentCatalog, type ComponentCatalogEntry } from "./catalog.js";
import { planStoryboard } from "./unified-planner.js";
import { generateScene } from "./scene-generator.js";
import { enrichProjectMedia } from "./media-enrichment.js";
import { saveGeneratedComponent } from "../core/component-generator.js";
import { loadProject, saveProject } from "../persistence/project.js";
import { loadBrandKit } from "../persistence/brand-kit.js";
import { tenantComponentsDir, projectDir } from "../persistence/paths.js";
import { config } from "../config.js";
import type { BrandKit, Canvas, OutputFormat, Project, Scene } from "../core/types.js";
import { TraceBuilder } from "../trace/index.js";
import { resolveImageCanvas } from "./image-canvas.js";
import { critiqueScene, type CritiqueResult } from "./critiquer.js";
import { assembleScene, type ComponentSource } from "../core/scene-assembler.js";
import { captureSingleFrame } from "../core/capture.js";
import os from "node:os";

// Keep old imports for backwards compat (deprecated functions still exist in their files)

export type PipelineTarget = "component" | "scene" | "video" | "image" | "presentation";

export interface PipelineOpts {
  prompt: string;
  target: PipelineTarget;
  tenant_id: string;
  project_id?: string;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  // Pipeline-internal defaults (not exposed to MCP callers)
  critique?: boolean;       // default: true
  maxRevisions?: number;    // default: 2
  sceneCount?: number;      // planner decides if not set
  generateImages?: boolean; // default: true
  creativity?: number;      // default: 0.5 (0-1, biases library vs custom)
  trace?: TraceBuilder;

  // Canvas overrides (any target; for images, overrides prompt inference)
  canvasWidth?: number;
  canvasHeight?: number;

  // Revision fields
  existingSource?: string;
  name?: string;
  sceneId?: string;
}

export interface PipelineResult {
  status: "completed" | "error";
  target: PipelineTarget;
  project?: Project;
  component?: {
    type: string;
    source: string;
    saved_path?: string;
  };
  critique?: any;
  customComponents?: Array<{ type: string; source: string }>;
  error?: string;
}

const DEFAULT_BRAND_KIT: BrandKit = {
  colors: {
    primary: "#5B21B6",
    secondary: "#7C3AED",
    accent: "#A78BFA",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#ffffff",
    text_muted: "#94a3b8",
  },
  fonts: [{ family: "Inter", source: "google" as const, weights: [400, 600, 800] }],
  style: { border_radius: "12px", motion: "cinematic" as const },
};

const DEFAULT_CANVAS: Canvas = {
  width: 1920,
  height: 1080,
  preset: "landscape",
  fps: 30,
  background: "#0f172a",
};

/**
 * Resolve creativity from opts. If mode is set (legacy), map it.
 */
function resolveCreativity(opts: PipelineOpts): number {
  if (opts.creativity !== undefined) return opts.creativity;
  return 0.5;
}

/**
 * Run the full generation pipeline.
 */
export async function runGeneratePipeline(opts: PipelineOpts): Promise<PipelineResult> {
  var brandKit = opts.brandKit || DEFAULT_BRAND_KIT;
  var canvas = opts.canvas || DEFAULT_CANVAS;

  // Apply explicit canvas overrides if provided (any target)
  if (opts.canvasWidth && opts.canvasHeight) {
    canvas = {
      width: opts.canvasWidth,
      height: opts.canvasHeight,
      preset: opts.canvasWidth === opts.canvasHeight ? "square" : opts.canvasWidth > opts.canvasHeight ? "landscape" : "vertical",
      fps: canvas.fps,
      background: brandKit.colors?.background || canvas.background,
    };
  }
  // For image targets with no explicit override, infer from prompt
  else if (opts.target === "image") {
    canvas = resolveImageCanvas(opts.prompt);
    if (brandKit.colors?.background) {
      canvas.background = brandKit.colors.background;
    }
  }

  // Create trace if not provided
  const trace = opts.trace || new TraceBuilder("generate", opts.tenant_id, opts.project_id || "", opts.prompt);
  trace.setBrandKit(!!opts.brandKit);
  trace.setCanvas(canvas.width, canvas.height, canvas.fps);

  // Build component catalog
  trace.beginEvent("build_catalog");
  var catalog = await buildComponentCatalog(
    config.componentLibDir,
    tenantComponentsDir(opts.tenant_id),
  );
  trace.endEvent();

  try {
    let result: PipelineResult;
    switch (opts.target) {
      case "component":
        result = await runComponentPipeline(opts, brandKit, trace);
        break;

      case "video":
      case "presentation":
      case "image":
      case "scene":
        // Scene revision: load existing project, revise a single scene
        if (opts.target === "scene" && opts.sceneId && opts.project_id) {
          result = await runSceneRevisionPipeline(opts, brandKit, canvas, catalog, trace);
        }
        // Video revision: load existing project, revise the whole thing
        else if (opts.target === "video" && opts.project_id && opts.existingSource) {
          result = await runVideoRevisionPipeline(opts, brandKit, canvas, catalog, trace);
        }
        // Image revision: load existing project, revise the single scene
        else if (opts.target === "image" && opts.project_id && opts.existingSource) {
          result = await runImageRevisionPipeline(opts, brandKit, canvas, catalog, trace);
        }
        // Deck revision: same as video revision
        else if (opts.target === "presentation" && opts.project_id && opts.existingSource) {
          result = await runVideoRevisionPipeline(opts, brandKit, canvas, catalog, trace);
        }
        else {
          result = await runUnifiedPipeline(opts, brandKit, canvas, catalog, opts.target === "scene" ? "video" : opts.target as OutputFormat, trace);
        }
        break;

      default:
        result = { status: "error", target: opts.target, error: `Unknown target: ${opts.target}` };
    }

    trace.setOutcome(result.status === "completed" ? "success" : "failed", result.error);
    return result;
  } catch (e: any) {
    trace.setOutcome("failed", e.message || String(e));
    return {
      status: "error",
      target: opts.target,
      error: e.message || String(e),
    };
  } finally {
    if (!opts.trace) {
      trace.finish();
    }
  }
}

// ── Component Pipeline ──

async function runComponentPipeline(
  opts: PipelineOpts,
  brandKit: BrandKit,
  trace?: TraceBuilder,
): Promise<PipelineResult> {
  trace?.beginEvent("component_llm");
  var result = await generateComponentLLM({
    prompt: opts.prompt,
    llmConfig: opts.llmConfig,
    brandKit,
    format: opts.target,
    existingSource: opts.existingSource,
    name: opts.name,
  });
  trace?.endEvent({ type: result.type, source_length: result.source.length });
  trace?.setComponentGen(result.type, result.source.length, 0);

  // Save to tenant library
  trace?.beginEvent("save_component");
  var savedPath = await saveGeneratedComponent(
    opts.tenant_id,
    result.type,
    result.source,
    "custom",
  );
  trace?.endEvent();

  return {
    status: "completed",
    target: "component",
    component: {
      type: result.type,
      source: result.source,
      saved_path: savedPath,
    },
  };
}

// ── Scene Revision Pipeline ──

async function runSceneRevisionPipeline(
  opts: PipelineOpts,
  brandKit: BrandKit,
  canvas: Canvas,
  catalog: ComponentCatalogEntry[],
  trace?: TraceBuilder,
): Promise<PipelineResult> {
  const project = await loadProject(opts.tenant_id, opts.project_id!);
  if (!project) {
    return { status: "error", target: "scene", error: `Project ${opts.project_id} not found` };
  }

  const sceneIndex = project.scenes.findIndex((s) => s.id === opts.sceneId);
  if (sceneIndex === -1) {
    return { status: "error", target: "scene", error: `Scene ${opts.sceneId} not found in project ${opts.project_id}` };
  }

  const existingScene = project.scenes[sceneIndex];

  // Serialize existing scene as context for the planner
  const sceneContext = serializeSceneContext(existingScene);
  const revisionPrompt = `Revise the following scene based on these instructions: ${opts.prompt}\n\nCurrent scene:\n${sceneContext}`;

  trace?.beginEvent("scene_revision_plan");
  const storyboard = await planStoryboard({
    prompt: revisionPrompt,
    format: project.format || "video",
    llmConfig: opts.llmConfig,
    brandKit,
    canvas,
    componentCatalog: catalog,
    sceneCount: 1,
    creativity: resolveCreativity(opts),
    tenantId: opts.tenant_id,
  });
  trace?.endEvent({ scenes: storyboard.scenes.length });

  if (storyboard.scenes.length === 0) {
    return { status: "error", target: "scene", error: "Planner returned no scenes for revision" };
  }

  // Generate the revised scene
  trace?.beginEvent("scene_revision_generate");
  const compDir = path.join(projectDir(opts.tenant_id, project.project_id), "components");
  await fs.mkdir(compDir, { recursive: true });

  const planned = storyboard.scenes[0];
  const generated = await generateScene({
    scene: planned,
    sceneIndex,
    totalScenes: project.scenes.length,
    prompt: revisionPrompt,
    format: project.format || "video",
    llmConfig: opts.llmConfig,
    brandKit,
    canvas,
    tenantId: opts.tenant_id,
    projectId: project.project_id,
  });

  // Preserve the original scene id
  generated.scene.id = existingScene.id;
  if (existingScene.label) generated.scene.label = existingScene.label;

  // Save custom component HTML if needed
  if (generated.customSources) {
    for (const [compName, html] of generated.customSources) {
      await fs.writeFile(path.join(compDir, `${compName}.component.html`), html);
    }
  }

  // Critique loop (skip if opts.critique === false)
  let finalRevScene = generated.scene;
  if (opts.critique !== false) {
    const critiqueResult = await critiqueAndRetryScene({
      scene: generated.scene,
      planned,
      sceneIndex,
      totalScenes: project.scenes.length,
      prompt: revisionPrompt,
      format: (project.format || "video") as OutputFormat,
      llmConfig: opts.llmConfig,
      brandKit,
      canvas,
      tenantId: opts.tenant_id,
      projectId: project.project_id,
      compDir,
      maxRetries: opts.maxRevisions ?? 2,
      trace,
      customSources: generated.customSources,
      catalog,
      critique: opts.critique,
    });
    finalRevScene = critiqueResult.scene;
    if (critiqueResult.customSources && critiqueResult.customSources !== generated.customSources) {
      for (const [compName, html] of critiqueResult.customSources) {
        await fs.writeFile(path.join(compDir, `${compName}.component.html`), html);
      }
    }
  }

  // Preserve the original scene id (re-apply after possible critique regeneration)
  finalRevScene.id = existingScene.id;
  if (existingScene.label) finalRevScene.label = existingScene.label;

  // Replace the scene in the project
  project.scenes[sceneIndex] = finalRevScene;
  await saveProject(project);
  trace?.endEvent();

  return {
    status: "completed",
    target: "scene",
    project,
  };
}

// ── Video Revision Pipeline ──

async function runVideoRevisionPipeline(
  opts: PipelineOpts,
  brandKit: BrandKit,
  canvas: Canvas,
  catalog: ComponentCatalogEntry[],
  trace?: TraceBuilder,
): Promise<PipelineResult> {
  const project = await loadProject(opts.tenant_id, opts.project_id!);
  if (!project) {
    return { status: "error", target: "video", error: `Project ${opts.project_id} not found` };
  }

  // Serialize the full project as context
  const projectContext = serializeProjectContext(project);
  const revisionPrompt = `Revise this video based on these instructions: ${opts.prompt}\n\nCurrent project:\n${projectContext}`;

  trace?.beginEvent("video_revision_plan");
  const storyboard = await planStoryboard({
    prompt: revisionPrompt,
    format: project.format || "video",
    llmConfig: opts.llmConfig,
    brandKit: project.brand_kit || brandKit,
    canvas: project.canvas || canvas,
    componentCatalog: catalog,
    sceneCount: opts.sceneCount || project.scenes.length,
    creativity: resolveCreativity(opts),
    tenantId: opts.tenant_id,
  });
  trace?.endEvent({ scenes: storyboard.scenes.length });

  // Media enrichment
  trace?.beginEvent("video_revision_media");
  const enrichResult = await enrichProjectMedia({
    storyboard,
    project,
    tenantId: opts.tenant_id,
    projectId: project.project_id,
    llmConfig: opts.llmConfig,
    generateImages: opts.generateImages,
  });
  if (enrichResult.project) {
    // Merge but preserve core metadata
    const preserved = {
      project_id: project.project_id,
      tenant_id: project.tenant_id,
      audio: project.audio,
      brand_kit: project.brand_kit,
      overlays: project.overlays,
      canvas: project.canvas,
    };
    Object.assign(project, enrichResult.project, preserved);
  }
  trace?.endEvent();

  // Generate scenes
  trace?.beginEvent("video_revision_scenes");
  const compDir = path.join(projectDir(opts.tenant_id, project.project_id), "components");
  await fs.mkdir(compDir, { recursive: true });

  const newScenes: Scene[] = [];
  for (let i = 0; i < storyboard.scenes.length; i++) {
    const planned = storyboard.scenes[i];
    const imageUrl = enrichResult.imageUrls.get(i);

    const generated = await generateScene({
      scene: planned,
      sceneIndex: i,
      totalScenes: storyboard.scenes.length,
      prompt: revisionPrompt,
      format: project.format || "video",
      llmConfig: opts.llmConfig,
      brandKit: project.brand_kit || brandKit,
      canvas: project.canvas || canvas,
      imageUrl,
      tenantId: opts.tenant_id,
      projectId: project.project_id,
    });

    if (generated.customSources) {
      for (const [compName, html] of generated.customSources) {
        await fs.writeFile(path.join(compDir, `${compName}.component.html`), html);
      }
    }

    // Critique loop (skip if opts.critique === false)
    let finalVidScene = generated.scene;
    if (opts.critique !== false) {
      const critiqueResult = await critiqueAndRetryScene({
        scene: generated.scene,
        planned,
        sceneIndex: i,
        totalScenes: storyboard.scenes.length,
        prompt: revisionPrompt,
        format: (project.format || "video") as OutputFormat,
        llmConfig: opts.llmConfig,
        brandKit: project.brand_kit || brandKit,
        canvas: project.canvas || canvas,
        tenantId: opts.tenant_id,
        projectId: project.project_id,
        compDir,
        maxRetries: opts.maxRevisions ?? 2,
        imageUrl,
        trace,
        customSources: generated.customSources,
        catalog,
        critique: opts.critique,
      });
      finalVidScene = critiqueResult.scene;
      if (critiqueResult.customSources && critiqueResult.customSources !== generated.customSources) {
        for (const [compName, html] of critiqueResult.customSources) {
          await fs.writeFile(path.join(compDir, `${compName}.component.html`), html);
        }
      }
    }

    newScenes.push(finalVidScene);
  }

  project.scenes = newScenes;
  project.name = storyboard.name || project.name;

  // Merge assets
  if (enrichResult.assets.length > 0) {
    project.assets = [...(project.assets || []), ...enrichResult.assets];
  }

  await saveProject(project);
  trace?.endEvent();

  return {
    status: "completed",
    target: "video",
    project,
  };
}

// ── Image Revision Pipeline ──

async function runImageRevisionPipeline(
  opts: PipelineOpts,
  brandKit: BrandKit,
  canvas: Canvas,
  catalog: ComponentCatalogEntry[],
  trace?: TraceBuilder,
): Promise<PipelineResult> {
  const project = await loadProject(opts.tenant_id, opts.project_id!);
  if (!project) {
    return { status: "error", target: "image", error: `Project ${opts.project_id} not found` };
  }

  // Image = single scene project. Revise the first (only) scene.
  const existingScene = project.scenes[0];
  if (!existingScene) {
    return { status: "error", target: "image", error: `Project ${opts.project_id} has no scenes` };
  }

  const sceneContext = serializeSceneContext(existingScene);
  const revisionPrompt = `Revise this image based on these instructions: ${opts.prompt}\n\nCurrent scene:\n${sceneContext}`;

  trace?.beginEvent("image_revision_plan");
  const storyboard = await planStoryboard({
    prompt: revisionPrompt,
    format: "image",
    llmConfig: opts.llmConfig,
    brandKit: project.brand_kit || brandKit,
    canvas: project.canvas || canvas,
    componentCatalog: catalog,
    sceneCount: 1,
    creativity: resolveCreativity(opts),
    tenantId: opts.tenant_id,
  });
  trace?.endEvent({ scenes: storyboard.scenes.length });

  if (storyboard.scenes.length === 0) {
    return { status: "error", target: "image", error: "Planner returned no scenes for image revision" };
  }

  // Generate the revised scene
  trace?.beginEvent("image_revision_generate");
  const compDir = path.join(projectDir(opts.tenant_id, project.project_id), "components");
  await fs.mkdir(compDir, { recursive: true });

  const planned = storyboard.scenes[0];
  const generated = await generateScene({
    scene: planned,
    sceneIndex: 0,
    totalScenes: 1,
    prompt: revisionPrompt,
    format: "image",
    llmConfig: opts.llmConfig,
    brandKit: project.brand_kit || brandKit,
    canvas: project.canvas || canvas,
    tenantId: opts.tenant_id,
    projectId: project.project_id,
  });

  // Preserve original scene id
  generated.scene.id = existingScene.id;
  if (existingScene.label) generated.scene.label = existingScene.label;

  // Save custom component HTML
  if (generated.customSources) {
    for (const [compName, html] of generated.customSources) {
      await fs.writeFile(path.join(compDir, `${compName}.component.html`), html);
    }
  }

  // Critique loop (skip if opts.critique === false)
  let finalImgScene = generated.scene;
  if (opts.critique !== false) {
    const critiqueResult = await critiqueAndRetryScene({
      scene: generated.scene,
      planned,
      sceneIndex: 0,
      totalScenes: 1,
      prompt: revisionPrompt,
      format: "image" as OutputFormat,
      llmConfig: opts.llmConfig,
      brandKit: project.brand_kit || brandKit,
      canvas: project.canvas || canvas,
      tenantId: opts.tenant_id,
      projectId: project.project_id,
      compDir,
      maxRetries: opts.maxRevisions ?? 2,
      trace,
      customSources: generated.customSources,
      catalog,
      critique: opts.critique,
    });
    finalImgScene = critiqueResult.scene;
    if (critiqueResult.customSources && critiqueResult.customSources !== generated.customSources) {
      for (const [compName, html] of critiqueResult.customSources) {
        await fs.writeFile(path.join(compDir, `${compName}.component.html`), html);
      }
    }
  }

  // Preserve original scene id
  finalImgScene.id = existingScene.id;
  if (existingScene.label) finalImgScene.label = existingScene.label;

  // Replace the scene and update name if planner provided one
  project.scenes = [finalImgScene];
  if (storyboard.name) project.name = storyboard.name;

  await saveProject(project);
  trace?.endEvent();

  return {
    status: "completed",
    target: "image",
    project,
  };
}

// ── Serialization Helpers ──

function serializeSceneContext(scene: Scene): string {
  const lines: string[] = [];
  lines.push(`Scene ID: ${scene.id}`);
  if (scene.label) lines.push(`Label: ${scene.label}`);
  lines.push(`Duration: ${scene.duration_seconds}s`);
  if (scene.background) lines.push(`Background: ${scene.background}`);
  if (scene.transition_in) lines.push(`Transition: ${scene.transition_in.type} (${scene.transition_in.duration_seconds}s)`);

  lines.push(`Components (${scene.components.length}):`);
  for (const comp of scene.components) {
    lines.push(`  - ${comp.id} (type: ${comp.type})`);
    if (comp.data && Object.keys(comp.data).length > 0) {
      lines.push(`    data: ${JSON.stringify(comp.data)}`);
    }
  }

  return lines.join("\n");
}

function serializeProjectContext(project: Project): string {
  const lines: string[] = [];
  lines.push(`Project: ${project.name} (${project.project_id})`);
  lines.push(`Format: ${project.format}`);
  lines.push(`Canvas: ${project.canvas.width}x${project.canvas.height} @ ${project.canvas.fps}fps`);
  lines.push(`Scenes (${project.scenes.length}):`);

  for (const scene of project.scenes) {
    lines.push(`\n${serializeSceneContext(scene)}`);
  }

  if (project.audio) {
    lines.push(`\nAudio tracks (${project.audio.tracks.length}):`);
    for (const track of project.audio.tracks) {
      lines.push(`  - ${track.id} (${track.type}): ${track.source}`);
    }
  }

  return lines.join("\n");
}

// ── Critique Helper ──

async function findComponentSourceForCritique(
  type: string,
  componentLibDir: string,
  extraDirs?: string[],
): Promise<string | null> {
  if (extraDirs) {
    for (const dir of extraDirs) {
      try {
        const filePath = path.join(dir, `${type}.component.html`);
        return await fs.readFile(filePath, "utf-8");
      } catch {
        // Not in this dir
      }
    }
  }
  try {
    const categories = await fs.readdir(componentLibDir, { withFileTypes: true });
    for (const cat of categories) {
      if (!cat.isDirectory()) continue;
      const filePath = path.join(componentLibDir, cat.name, `${type}.component.html`);
      try {
        return await fs.readFile(filePath, "utf-8");
      } catch {}
    }
  } catch {}
  try {
    const filePath = path.join(componentLibDir, `${type}.component.html`);
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function critiqueAndRetryScene(opts: {
  scene: Scene;
  planned: any;
  sceneIndex: number;
  totalScenes: number;
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  tenantId: string;
  projectId: string;
  compDir: string;
  maxRetries: number;
  imageUrl?: string;
  trace?: TraceBuilder;
  customSources?: Map<string, string>;
  catalog: ComponentCatalogEntry[];
  critique?: boolean;
}): Promise<{ scene: Scene; customSources?: Map<string, string>; critiqueResult?: CritiqueResult }> {
  // Skip critique if disabled
  if (opts.critique === false) {
    return { scene: opts.scene, customSources: opts.customSources };
  }

  let currentScene = opts.scene;
  let currentCustomSources = opts.customSources;
  let currentPlanned = opts.planned;
  let lastCritique: CritiqueResult | undefined;

  // Track best attempt by score
  let bestScene = opts.scene;
  let bestCustomSources = opts.customSources;
  let bestScore = 0;
  let bestCritique: CritiqueResult | undefined;

  const extraDirs = [
    opts.compDir,
    tenantComponentsDir(opts.tenantId),
  ];

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    opts.trace?.beginEvent(`critique_scene_${opts.sceneIndex}_attempt_${attempt}`);

    try {
      // 1. Collect component sources for this scene
      const componentSources: ComponentSource[] = [];
      for (const comp of currentScene.components) {
        if (currentCustomSources?.has(comp.type)) {
          componentSources.push({ type: comp.type, source: currentCustomSources.get(comp.type)! });
        } else {
          const source = await findComponentSourceForCritique(comp.type, config.componentLibDir, extraDirs);
          if (source) {
            componentSources.push({ type: comp.type, source });
          }
        }
      }

      if (componentSources.length === 0) {
        console.log(`  Critique: no component sources found for scene ${opts.sceneIndex}, skipping`);
        opts.trace?.endEvent({ skipped: true, reason: "no_sources" });
        break;
      }

      // 2. Assemble the scene HTML
      const assembledHtml = await assembleScene({
        scene: currentScene,
        components: componentSources,
        brandKit: opts.brandKit,
        canvas: opts.canvas,
        gsapDir: config.gsapDir,
      });

      // 3. Write to temp file and capture preview
      const tmpDir = path.join(os.tmpdir(), `critique_${opts.projectId}_${opts.sceneIndex}_${attempt}`);
      await fs.mkdir(tmpDir, { recursive: true });
      const htmlPath = path.join(tmpDir, "scene.html");
      const previewPath = path.join(tmpDir, "preview.png");

      await fs.writeFile(htmlPath, assembledHtml);
      await captureSingleFrame({
        htmlPath,
        outputPath: previewPath,
        width: opts.canvas.width,
        height: opts.canvas.height,
        atTime: currentScene.duration_seconds / 3,
      });

      // 4. Read preview and critique
      const previewBase64 = (await fs.readFile(previewPath)).toString("base64");
      const critiqueResult = await critiqueScene({
        sceneHtml: assembledHtml,
        previewImageBase64: previewBase64,
        prompt: opts.prompt,
        llmConfig: opts.llmConfig,
        format: opts.format,
        trace: opts.trace,
        critiqueRound: attempt,
      });

      lastCritique = critiqueResult;
      console.log(`  Critique scene ${opts.sceneIndex} attempt ${attempt}: score=${critiqueResult.score}, issues=${critiqueResult.issues.length}`);
      if (critiqueResult.issues.length > 0) {
        console.log(`    Issues: ${critiqueResult.issues.join(" | ")}`);
      }
      if (critiqueResult.suggestions.length > 0) {
        console.log(`    Suggestions: ${critiqueResult.suggestions.join(" | ")}`);
      }

      // 5. Clean up temp files
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      // Track best attempt
      if (critiqueResult.score > bestScore) {
        bestScore = critiqueResult.score;
        bestScene = currentScene;
        bestCustomSources = currentCustomSources;
        bestCritique = critiqueResult;
      }

      // 6. If score >= 7, accept (good enough)
      if (critiqueResult.score >= 7) {
        opts.trace?.endEvent({ score: critiqueResult.score, accepted: true });
        break;
      }

      // 7. If score >= 5, acceptable -- don't re-plan, just accept
      // Only re-plan for scores < 5 (significant problems)
      if (critiqueResult.score >= 5) {
        console.log(`  Score ${critiqueResult.score} is acceptable, keeping without re-plan`);
        opts.trace?.endEvent({ score: critiqueResult.score, accepted: true, reason: "acceptable" });
        break;
      }

      opts.trace?.endEvent({ score: critiqueResult.score, retries: attempt + 1, accepted: false });

      // 8. Score < 5: surgical re-plan
      // Give the planner the EXISTING plan as structured JSON and ask for minimal fixes
      const existingPlanJSON = JSON.stringify(currentPlanned, null, 2);
      const rePlanPrompt = `You previously planned this scene and it has rendering problems. Make MINIMAL changes to fix ONLY these issues:

${critiqueResult.issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}

Here is your previous plan (JSON). Keep everything that works. Only change what's broken:
${existingPlanJSON}

Original brief: ${opts.prompt}

Rules:
- Keep the same overall structure and components that are working
- Only adjust component types, data props, or positions to fix the specific issues listed
- Do NOT start from scratch -- this is a surgical fix
- If a library component isn't rendering correctly, try a different library component or switch to custom
- Output a single scene plan in the same JSON format`;

      const rePlanned = await planStoryboard({
        prompt: rePlanPrompt,
        format: opts.format,
        llmConfig: opts.llmConfig,
        brandKit: opts.brandKit,
        canvas: opts.canvas,
        componentCatalog: opts.catalog,
        sceneCount: 1,
        creativity: 0.5,
        tenantId: opts.tenantId,
      });

      if (!rePlanned.scenes || rePlanned.scenes.length === 0) {
        console.log(`  Critique re-plan returned no scenes, keeping best (score ${bestScore})`);
        break;
      }

      // Generate the surgically re-planned scene
      const newPlanned = rePlanned.scenes[0];
      currentPlanned = newPlanned;
      const regenerated = await generateScene({
        scene: newPlanned,
        sceneIndex: opts.sceneIndex,
        totalScenes: opts.totalScenes,
        prompt: opts.prompt,
        format: opts.format,
        llmConfig: opts.llmConfig,
        brandKit: opts.brandKit,
        canvas: opts.canvas,
        imageUrl: opts.imageUrl,
        tenantId: opts.tenantId,
        projectId: opts.projectId,
      });

      // Save custom component HTML if needed
      if (regenerated.customSources) {
        for (const [compName, compHtml] of regenerated.customSources) {
          await fs.writeFile(path.join(opts.compDir, `${compName}.component.html`), compHtml);
        }
      }

      currentScene = regenerated.scene;
      currentCustomSources = regenerated.customSources;

    } catch (e: any) {
      console.error(`  Critique scene ${opts.sceneIndex} attempt ${attempt} failed: ${e.message}`);
      opts.trace?.endEvent({ error: e.message });
      break; // Don't let critique failures block the pipeline
    }
  }

  // Return the best-scoring attempt, not the last one
  if (bestScore > 0 && bestScore >= (lastCritique?.score ?? 0)) {
    return { scene: bestScene, customSources: bestCustomSources, critiqueResult: bestCritique };
  }
  return { scene: currentScene, customSources: currentCustomSources, critiqueResult: lastCritique };
}

// ── Unified Pipeline ──

async function runUnifiedPipeline(
  opts: PipelineOpts,
  brandKit: BrandKit,
  canvas: Canvas,
  catalog: ComponentCatalogEntry[],
  format: OutputFormat,
  trace?: TraceBuilder,
): Promise<PipelineResult> {
  var creativity = resolveCreativity(opts);
  console.log(`  Unified pipeline: format=${format}, creativity=${creativity}`);

  // Images are always 1 scene
  if (format === "image") {
    opts.sceneCount = 1;
  }

  // 1. Expand prompt
  trace?.beginEvent("expand_prompt");
  var expanded = await expandPrompt({
    prompt: opts.prompt,
    format,
    llmConfig: opts.llmConfig,
    brandKit,
    sceneCount: opts.sceneCount,
  });
  var richPrompt = expanded.prompt;
  var sceneCount = format === "image" ? 1 : (expanded.sceneCount || opts.sceneCount);
  trace?.endEvent({ expanded: expanded.expanded });
  if (expanded.expanded) {
    console.log("  Prompt expanded");
  }

  // 2. Plan storyboard (unified planner)
  trace?.beginEvent("plan_storyboard");
  var storyboard = await planStoryboard({
    prompt: richPrompt,
    format,
    llmConfig: opts.llmConfig,
    brandKit,
    canvas,
    componentCatalog: catalog,
    sceneCount,
    creativity,
    tenantId: opts.tenant_id,
  });
  trace?.endEvent({ scenes: storyboard.scenes.length });

  // Create project shell
  var projectId = `proj_${uuid().replace(/-/g, "").slice(0, 8)}`;
  var project: Project = {
    project_id: projectId,
    tenant_id: opts.tenant_id,
    name: storyboard.name,
    format,
    status: "draft",
    canvas,
    brand_kit: brandKit,
    scenes: [],
  };

  // 3. Media enrichment (images, future: video, music)
  trace?.beginEvent("media_enrichment");
  var enrichResult = await enrichProjectMedia({
    storyboard,
    project,
    tenantId: opts.tenant_id,
    projectId,
    llmConfig: opts.llmConfig,
    generateImages: opts.generateImages,
  });
  if (enrichResult.project) {
    project = enrichResult.project;
  }
  trace?.endEvent({ images: enrichResult.imageUrls.size });

  // 4. Generate scenes (library + custom in one pass)
  trace?.beginEvent("generate_scenes");
  var compDir = path.join(projectDir(opts.tenant_id, projectId), "components");
  await fs.mkdir(compDir, { recursive: true });

  for (var i = 0; i < storyboard.scenes.length; i++) {
    var planned = storyboard.scenes[i];
    var imageUrl = enrichResult.imageUrls.get(i);

    var generated = await generateScene({
      scene: planned,
      sceneIndex: i,
      totalScenes: storyboard.scenes.length,
      prompt: richPrompt,
      format,
      llmConfig: opts.llmConfig,
      brandKit,
      canvas,
      imageUrl,
      tenantId: opts.tenant_id,
      projectId,
    });

    // Save custom component HTML if needed
    if (generated.customSources) {
      for (var [compName, html] of generated.customSources) {
        await fs.writeFile(path.join(compDir, `${compName}.component.html`), html);
        console.log(`  Saved: ${compDir}/${compName}.component.html`);
      }
    }

    // Critique loop (skip if opts.critique === false)
    let finalScene = generated.scene;
    let finalCustomSources = generated.customSources;
    if (opts.critique !== false) {
      const critiqueResult = await critiqueAndRetryScene({
        scene: generated.scene,
        planned,
        sceneIndex: i,
        totalScenes: storyboard.scenes.length,
        prompt: richPrompt,
        format,
        llmConfig: opts.llmConfig,
        brandKit,
        canvas,
        tenantId: opts.tenant_id,
        projectId,
        compDir,
        maxRetries: opts.maxRevisions ?? 2,
        imageUrl,
        trace,
        customSources: generated.customSources,
        catalog,
        critique: opts.critique,
      });
      finalScene = critiqueResult.scene;
      finalCustomSources = critiqueResult.customSources;
      // Update saved custom sources if critique regenerated them
      if (finalCustomSources && finalCustomSources !== generated.customSources) {
        for (const [compName, html] of finalCustomSources) {
          await fs.writeFile(path.join(compDir, `${compName}.component.html`), html);
        }
      }
    }

    project.scenes.push(finalScene);
  }
  trace?.endEvent({ scenes: project.scenes.length });

  // Merge assets from enrichment
  if (enrichResult.assets.length > 0) {
    project.assets = [...(project.assets || []), ...enrichResult.assets];
  }

  await saveProject(project);

  return {
    status: "completed",
    target: opts.target,
    project,
  };
}
