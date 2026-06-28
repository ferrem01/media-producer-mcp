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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { v4 as uuid } from "uuid";
import type { LLMConfig } from "./client.js";
import { generateComponentLLM } from "./component-gen.js";
import { expandPrompt } from "./expander.js";
import { buildComponentCatalog, type ComponentCatalogEntry } from "./catalog.js";
import { planStoryboard } from "./unified-planner.js";
import { generateCreativeBible, formatCreativeBibleForPlanner, type CreativeBible } from "./concept-director.js";

import { planRevision, type RevisionPlan, type RevisedComponent } from "./revision-planner.js";
import { reviseComponent } from "./component-revise.js";
import { critiqueAndReviseScene } from "./revision-critique.js";
import { generateScene } from "./scene-generator.js";
import { enrichProjectMedia } from "./media-enrichment.js";
import { saveGeneratedComponent } from "../core/component-generator.js";
import { loadProject, saveProject } from "../persistence/project.js";
import { loadBrandKit } from "../persistence/brand-kit.js";
import { tenantComponentsDir, projectDir } from "../persistence/paths.js";
import { config } from "../config.js";
import { fetchStockFootage } from "../media/stock-footage.js";
import { generateSceneVoiceovers } from "../audio/scene-voiceover.js";
import type { BrandKit, Canvas, OutputFormat, PlannedScene, Project, ProjectPlan, ReferenceImage, Scene, SceneTransition } from "../core/types.js";
import { TraceBuilder } from "../trace/index.js";
import { resolveImageCanvas } from "./image-canvas.js";
import { processReferenceImages } from "./reference-images.js";
import { type CritiqueResult } from "./critiquer.js";
import { critiqueEditorial, type EditorialCritiqueResult } from "./multi-pass-critiquer.js";
import { formatCorrectnessDefects, type CorrectnessResult } from "./correctness-critique.js";
import { critiqueConsolidated, consolidatedCorrectness } from "./consolidated-critique.js";
import { tileFramesToStoryboard } from "./editorial-vision.js";
import { generateContactSheet } from "../core/contact-sheet.js";
import { assembleSceneAuto, type ComponentSource } from "../core/scene-assembler.js";
import { captureSingleFrame, validateSceneRuntime } from "../core/capture.js";
import { measureTextContrast } from "../core/text-contrast.js";
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
  voiceover?: boolean;      // default: false. Generate TTS voiceover per scene.
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";  // TTS voice (default: nova)
  backgroundMusic?: boolean;  // default: false. Add background music with voiceover ducking.
  /** Streams fine-grained generation progress (phase + percent + per-scene detail
   *  + rough ETA) so a caller can surface a live status instead of a frozen bar. */
  onProgress?: (p: { step: string; percent: number; detail?: string; etaSeconds?: number }) => void;
  trace?: TraceBuilder;

  /** Reference images for vision-aware generation */
  referenceImages?: ReferenceImage[];

  // Canvas overrides (any target; for images, overrides prompt inference)
  canvasWidth?: number;
  canvasHeight?: number;

  // Revision fields
  existingSource?: string;
  name?: string;
  sceneId?: string;

  // Speaker track fields
  speaker_source?: string;
  speaker_start?: number;
  speaker_trim_start?: number;
  speaker_trim_end?: number;

  // Plan-only mode: run concept director + unified planner, save plan, stop before scene generation
  planOnly?: boolean;
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

/** True when the brand's background color is light (relative luminance > 0.5). */
function brandBackgroundIsLight(brandKit?: BrandKit): boolean {
  let hex = (brandKit?.colors?.background || "#0f172a").replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

/**
 * Classify a scene as a "bookend" (intro/outro/title/closing/CTA, or a video-only
 * brand clip). Bookends skip the aesthetic/editorial critique but still get the
 * correctness + brand-theme gate (so they can't drift off-brand). Exported so the
 * detection is unit-testable independent of the pipeline.
 */
export function isBookendScene(
  label: string | undefined,
  sceneIndex: number,
  totalScenes: number,
  componentTypes?: string[],
): boolean {
  const labelLower = (label || "").toLowerCase();
  const byLabel =
    labelLower.includes("intro") || labelLower.includes("outro") ||
    (sceneIndex === 0 && (labelLower.includes("title") || labelLower.includes("opening"))) ||
    (sceneIndex === totalScenes - 1 && (labelLower.includes("closing") || labelLower.includes("cta") || labelLower.includes("end")));
  // A video-only scene (single video component) is a brand clip -> bookend.
  const videoOnly = componentTypes?.length === 1 && componentTypes[0] === "video";
  return byLabel || !!videoOnly;
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
  const plannedScene = project.plan?.scenes?.[sceneIndex];

  // Serialize existing scene as context for the planner, and pin the scene's
  // brief (Studio-edited override, else the original storyboard plan) so the
  // rebuild fulfills the scene's actual intent — not just its label.
  const sceneContext = serializeSceneContext(existingScene);
  const briefBlock = formatSceneBrief(plannedScene);
  const revisionPrompt =
    `Revise the following scene based on these instructions: ${opts.prompt}` +
    (briefBlock ? `\n\nScene brief (the intent this scene must fulfill):\n${briefBlock}` : "") +
    `\n\nCurrent scene:\n${sceneContext}`;

  // Build the scene the generator will render. When we have an explicit brief
  // (Studio-edited override, else the original storyboard plan), use it VERBATIM
  // as the generation spec instead of re-running the planner: planStoryboard
  // paraphrases the brief into its own brief/description, and buildCodegenBrief
  // then generates from THAT — so the rebuild drifts from what the storyboard
  // actually said. Only fall back to the planner when there is no brief at all.
  // The plan entry (project.plan.scenes[idx]) is the single source of truth that
  // Studio edits; use it verbatim so the rebuild matches the storyboard.
  const briefPurpose = plannedScene?.purpose;
  const briefScript = plannedScene?.voiceover_text;
  const briefVisual = plannedScene?.visual_notes;
  const instr = opts.prompt?.trim();
  let planned: any;

  if (briefPurpose || briefScript || briefVisual) {
    opts.onProgress?.({ step: "planning", percent: 10, detail: "Using the storyboard brief" });
    // buildCodegenBrief surfaces `description` -> "Description" and `brief` ->
    // "Visual Direction" verbatim, so map the user's words straight in.
    planned = {
      label: existingScene.label || plannedScene?.label || `Scene ${sceneIndex + 1}`,
      duration_seconds: plannedScene?.duration_seconds || existingScene.duration_seconds || 5,
      description: [briefPurpose, instr ? `Additional instruction: ${instr}` : ""].filter(Boolean).join("\n"),
      brief: briefVisual || "",
      purpose: briefPurpose || "",
      visual_notes: briefVisual || "",
      voiceover_text: briefScript || "",
      components: plannedScene?.components || [],
      broll_query: plannedScene?.broll_query,
      hero_image: plannedScene?.hero_image,
      template: plannedScene?.template,
      assets: plannedScene?.assets || [],
      transition_in: existingScene.transition_in,
    };
  } else {
    opts.onProgress?.({ step: "planning", percent: 10, detail: "Planning the scene" });
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
    planned = storyboard.scenes[0];
  }

  // Generate the revised scene
  opts.onProgress?.({ step: "generating", percent: 40, detail: "Generating the scene" });
  trace?.beginEvent("scene_revision_generate");
  const compDir = path.join(projectDir(opts.tenant_id, project.project_id), "components");
  await fs.mkdir(compDir, { recursive: true });

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
    creativeBible: project.creative_bible as any,
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
    opts.onProgress?.({ step: "critiquing", percent: 70, detail: "Reviewing & polishing" });
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
      creativity: resolveCreativity(opts),
      critiqueLlmConfig: config.critiqueLlm,
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
  opts.onProgress?.({ step: "done", percent: 100, detail: "Finalizing" });

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
      creativeBible: project.creative_bible as any,
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
        creativity: resolveCreativity(opts),
        critiqueLlmConfig: config.critiqueLlm,
        creativeBible: project.creative_bible,
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
    // creativeBible saved in runUnifiedPipeline

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

  const useCanvas = project.canvas || canvas;
  const useBrandKit = project.brand_kit || brandKit;

  // Load existing custom component HTML sources
  const compDir = path.join(projectDir(opts.tenant_id, project.project_id), "components");
  const customSources = new Map<string, string>();
  try {
    const files = await fs.readdir(compDir);
    for (const file of files) {
      if (file.endsWith(".component.html")) {
        const compName = file.replace(".component.html", "");
        const source = await fs.readFile(path.join(compDir, file), "utf-8");
        customSources.set(compName, source);
      }
    }
  } catch {
    // No components dir yet
  }

  // Also check tenant components dir
  const tenantCompDir = tenantComponentsDir(opts.tenant_id);
  try {
    const files = await fs.readdir(tenantCompDir);
    for (const file of files) {
      if (file.endsWith(".component.html") && !customSources.has(file.replace(".component.html", ""))) {
        const compName = file.replace(".component.html", "");
        const source = await fs.readFile(path.join(tenantCompDir, file), "utf-8");
        customSources.set(compName, source);
      }
    }
  } catch { /* no tenant components */ }

  // Use the revision planner (NOT the unified planner)
  trace?.beginEvent("image_revision_plan");
  console.log(`  [revision] Planning revision for image project ${opts.project_id}`);
  console.log(`  [revision] Existing components: ${existingScene.components.map(c => c.type).join(", ")}`);
  console.log(`  [revision] Custom sources available: ${[...customSources.keys()].join(", ") || "none"}`);

  const revisionPlan = await planRevision({
    prompt: opts.prompt,
    existingComponents: existingScene.components,
    customSources,
    sceneLabel: existingScene.label || "Image",
    sceneDuration: existingScene.duration_seconds,
    format: "image",
    llmConfig: opts.llmConfig,
    brandKit: useBrandKit,
    canvas: useCanvas,
    componentCatalog: catalog,
    tenantId: opts.tenant_id,
  });
  trace?.endEvent({
    strategies: revisionPlan.components.map(c => `${c.type}:${c.strategy}`),
    summary: revisionPlan.revision_summary,
  });

  console.log(`  [revision] Plan: ${revisionPlan.revision_summary}`);
  for (const comp of revisionPlan.components) {
    console.log(`    ${comp.original_id || "NEW"} (${comp.type}): ${comp.strategy}${comp.revise_instructions ? " - " + comp.revise_instructions.substring(0, 80) : ""}`);
  }

  // Execute the revision plan
  trace?.beginEvent("image_revision_execute");
  await fs.mkdir(compDir, { recursive: true });
  const newComponents: import("../core/types.js").SceneComponent[] = [];
  const newCustomSources = new Map<string, string>();

  for (let ci = 0; ci < revisionPlan.components.length; ci++) {
    const planned = revisionPlan.components[ci];

    if (planned.strategy === "remove") {
      console.log(`  [revision] Removing ${planned.type}`);
      continue;
    }

    if (planned.strategy === "keep") {
      // Pass through unchanged
      const existing = existingScene.components.find(c => c.id === planned.original_id);
      if (existing) {
        // Apply any data/position updates from the plan
        const comp = { ...existing };
        if (planned.data) comp.data = planned.data;
        if (planned.position) comp.position = planned.position;
        if (planned.z_index !== undefined) comp.z_index = planned.z_index;
        newComponents.push(comp);
        // Preserve custom source
        if (customSources.has(comp.type)) {
          newCustomSources.set(comp.type, customSources.get(comp.type)!);
        }
      }
      continue;
    }

    if (planned.strategy === "revise") {
      // Surgical SEARCH/REPLACE on existing custom component
      const existingSource = customSources.get(planned.type);
      if (!existingSource) {
        console.log(`  [revision] Cannot revise ${planned.type}: no HTML source found, treating as keep`);
        const existing = existingScene.components.find(c => c.id === planned.original_id);
        if (existing) newComponents.push(existing);
        continue;
      }

      console.log(`  [revision] Revising ${planned.type} via SEARCH/REPLACE`);
      const reviseResult = await reviseComponent({
        existingSource,
        instructions: planned.revise_instructions || opts.prompt,
        componentName: planned.type,
        llmConfig: opts.llmConfig,
        brandKit: useBrandKit,
        canvas: useCanvas,
      });

      console.log(`  [revision] ${planned.type}: ${reviseResult.blocksApplied} blocks applied, fullRewrite=${reviseResult.fullRewrite}`);

      // Save revised HTML
      await fs.writeFile(path.join(compDir, `${planned.type}.component.html`), reviseResult.source);
      newCustomSources.set(planned.type, reviseResult.source);

      const existing = existingScene.components.find(c => c.id === planned.original_id);
      if (existing) {
        const comp = { ...existing };
        if (planned.data) comp.data = planned.data;
        if (planned.position) comp.position = planned.position;
        if (planned.z_index !== undefined) comp.z_index = planned.z_index;
        newComponents.push(comp);
      }
      continue;
    }

    if (planned.strategy === "replace") {
      // Full regeneration of custom component
      console.log(`  [revision] Replacing ${planned.type} with new custom component`);
      const compName = planned.original_id
        ? planned.type
        : `custom_${existingScene.id}_${ci}`;

      const generated = await generateScene({
        scene: {
          label: revisionPlan.label,
          duration_seconds: revisionPlan.duration_seconds,
          description: planned.custom_prompt || opts.prompt,
          brief: planned.custom_prompt || opts.prompt,
          components: [],
        },
        sceneIndex: 0,
        totalScenes: 1,
        prompt: opts.prompt,
        format: "image",
        llmConfig: opts.llmConfig,
        brandKit: useBrandKit,
        canvas: useCanvas,
        tenantId: opts.tenant_id,
        projectId: project.project_id,
        creativeBible: project.creative_bible as any,
      });

      if (generated.customSources) {
        for (const [name, html] of generated.customSources) {
          await fs.writeFile(path.join(compDir, `${name}.component.html`), html);
          newCustomSources.set(name, html);
        }
      }

      // Use the generated scene component(s)
      for (const gc of generated.scene.components) {
        newComponents.push(gc);
      }
      continue;
    }
  }

  // Build the revised scene
  const revisedScene: Scene = {
    id: existingScene.id,
    label: revisionPlan.label || existingScene.label,
    duration_seconds: revisionPlan.duration_seconds || existingScene.duration_seconds,
    transition_in: existingScene.transition_in,
    components: newComponents,
    background: existingScene.background,
  };

  // Revision-aware critique loop: uses SEARCH/REPLACE to fix visual issues
  // instead of regenerating components from scratch (which destroys content).
  let finalScene = revisedScene;
  let finalCustomSources = newCustomSources;
  if (opts.critique !== false && newCustomSources.size > 0) {
    console.log(`  [revision] Running revision-aware critique loop`);
    const critiqueResult = await critiqueAndReviseScene({
      scene: revisedScene,
      customSources: newCustomSources,
      prompt: opts.prompt,
      format: "image",
      llmConfig: opts.llmConfig,
      brandKit: useBrandKit,
      canvas: useCanvas,
      tenantId: opts.tenant_id,
      projectId: project.project_id,
      compDir,
      maxRetries: opts.maxRevisions ?? 2,
      trace,
    });
    finalScene = critiqueResult.scene;
    finalCustomSources = critiqueResult.customSources;
    console.log(`  [revision] Critique complete: accepted=${critiqueResult.accepted}, score=${critiqueResult.critiqueResult?.score ?? "n/a"}`);
  }

  // Preserve original scene id
  finalScene.id = existingScene.id;

  project.scenes = [finalScene];
  await saveProject(project);
  trace?.endEvent();

  console.log(`  [revision] Image revision complete for ${opts.project_id}`);

  return {
    status: "completed",
    target: "image",
    project,
  };
}

// ── Serialization Helpers ──

/** Format a scene's brief for the revision prompt: the Studio-edited override
 *  (scene.brief) takes precedence over the original storyboard plan entry. */
function formatSceneBrief(planned?: PlannedScene): string {
  const purpose = planned?.purpose;
  const script = planned?.voiceover_text;
  const visual = planned?.visual_notes;
  const lines: string[] = [];
  if (purpose) lines.push(`Purpose: ${purpose}`);
  if (script) lines.push(`Script: ${script}`);
  if (visual) lines.push(`Visual notes: ${visual}`);
  return lines.join("\n");
}

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
  /** Bookend mode: skip the aesthetic/editorial critique but STILL run the
   *  correctness + brand-theme gate (so an intro/outro can't drift off-brand,
   *  e.g. a dark scene on a light brand) and revise on blocking defects. */
  correctnessOnly?: boolean;
  creativity?: number;
  critiqueLlmConfig?: LLMConfig;
  creativeBible?: any;
}): Promise<{ scene: Scene; customSources?: Map<string, string>; critiqueResult?: CritiqueResult }> {
  // Skip critique if disabled (but correctnessOnly still runs the correctness gate).
  if (opts.critique === false && !opts.correctnessOnly) {
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
  // Surgical-patch improvement guard: the score at which we last patched (-1 = the
  // last fix was a full regen / none yet). Used to escalate to a full regen if a
  // patch fails to raise the score.
  let patchAnchor = -1;

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

      // 2. Assemble the scene HTML. assembleSceneAuto routes codegen scenes
      //    (with <component> tags) through the codegen assembler + library load.
      const assembledHtml = await assembleSceneAuto({
        scene: currentScene,
        components: componentSources,
        brandKit: opts.brandKit,
        canvas: opts.canvas,
        gsapDir: config.gsapDir,
        componentLibDir: config.componentLibDir,
        preview: true,
      });

      // 3. Write to temp file and capture preview
      const tmpDir = path.join(os.tmpdir(), `critique_${opts.projectId}_${opts.sceneIndex}_${attempt}`);
      await fs.mkdir(tmpDir, { recursive: true });
      const htmlPath = path.join(tmpDir, "scene.html");
      const previewPath = path.join(tmpDir, "preview.png");

      await fs.writeFile(htmlPath, assembledHtml);

      // 3b. Runtime gate: seek the timeline and catch any thrown error. The vision
      // critique can't see a callback that throws mid-animation (the frame still
      // renders), so this is what catches the "broken" (vs "ugly") class of bug.
      const runtime = await validateSceneRuntime({
        htmlPath,
        width: opts.canvas.width,
        height: opts.canvas.height,
        duration: currentScene.duration_seconds || 5,
      });
      if (!runtime.ok) {
        console.warn(`  Scene ${opts.sceneIndex} runtime error @${(runtime.atTime ?? 0).toFixed(1)}s: ${runtime.error}`);
      }

      // Video-only scene: extract frame directly from video file via ffmpeg
      // (Playwright can't load http:// video in file:// pages due to CORS)
      const isVideoOnly = currentScene.components.length === 1 &&
        currentScene.components[0].type === "video" &&
        currentScene.components[0].data?.src;

      if (isVideoOnly) {
        const videoSrc = currentScene.components[0].data!.src as string;
        const seekTime = Math.min(currentScene.duration_seconds * 0.5, 3);
        try {
          // Resolve URL to local file path for ffmpeg
          let videoPath = videoSrc;
          // Resolve relative /assets/ paths to full HTTP URL
          if (videoPath.startsWith("/assets/") || videoPath.startsWith("/api/")) {
            videoPath = `http://localhost:${config.port}${videoPath}`;
          }
          if (videoPath.startsWith("http://localhost")) {
            // Download to temp file
            const tmpVideo = path.join(tmpDir, "source.mp4");
            const res = await fetch(videoPath);
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              await fs.writeFile(tmpVideo, buf);
              videoPath = tmpVideo;
            }
          }
          await execFileAsync("ffmpeg", [
            "-y", "-ss", String(seekTime), "-i", videoPath,
            "-vframes", "1",
            "-vf", `scale=${opts.canvas.width}:${opts.canvas.height}:force_original_aspect_ratio=decrease,pad=${opts.canvas.width}:${opts.canvas.height}:(ow-iw)/2:(oh-ih)/2:black`,
            previewPath,
          ], { timeout: 15000 });
          console.log(`  Captured video frame via ffmpeg: ${previewPath}`);
        } catch (e: any) {
          console.warn(`  ffmpeg frame extract failed (${e.message}), falling back to Playwright`);
          await captureSingleFrame({
            htmlPath,
            outputPath: previewPath,
            width: opts.canvas.width,
            height: opts.canvas.height,
            atTime: currentScene.duration_seconds * 0.9,
          });
        }
      } else {
        await captureSingleFrame({
          htmlPath,
          outputPath: previewPath,
          width: opts.canvas.width,
          height: opts.canvas.height,
          atTime: currentScene.duration_seconds * 0.9,
        });
      }

      // 4a. Generate contact sheet for motion-aware critique (6 frames across timeline)
      let contactSheetBase64: string | undefined;
      let contactTimestamps: number[] | undefined;
      if (!isVideoOnly && currentScene.duration_seconds >= 3) {
        try {
          const contactPath = path.join(tmpDir, "contact-sheet.png");
          const contactResult = await generateContactSheet({
            htmlPath,
            width: opts.canvas.width,
            height: opts.canvas.height,
            duration: currentScene.duration_seconds,
            frameCount: 6,
            outputPath: contactPath,
          });
          contactSheetBase64 = contactResult.base64;
          contactTimestamps = contactResult.timestamps;
        } catch (e: any) {
          console.warn(`  Contact sheet generation failed (${e.message}), using single frame`);
        }
      }

      // 4. Read preview and critique
      const previewBase64 = (await fs.readFile(previewPath)).toString("base64");
      // Add context for video-only scenes so critiquer evaluates appropriately
      const videoContext = isVideoOnly
        ? "This scene contains a pre-rendered video component (brand animation/clip). The video content cannot be modified. Evaluate the video frame for visual quality, brand consistency, and professional appearance. Do NOT penalize for missing headlines, text, messaging, or value propositions - this is an animated brand clip, not a content scene."
        : undefined;

      // Build motion context for the critiquer
      let motionContext = videoContext || "";
      if (contactSheetBase64 && contactTimestamps) {
        motionContext += `\nMOTION REVIEW: A contact sheet with 6 frames across the timeline is attached (timestamps: ${contactTimestamps.map(t => t.toFixed(1) + "s").join(", ")}). Evaluate animation pacing, choreography, and whether the motion feels purposeful. Check that elements animate smoothly and the Build-Breathe-Resolve pattern is followed.`;
      }

      // Per-scene critique: ONE consolidated vision call that does functional
      // (readability/contrast/layout) + premium ("does it feel expensive") +
      // correctness (overlap/off_canvas/illegible/stray_ui/missing_asset/
      // off_brand_theme) on the same frame. Replaces what used to be 2-3 separate
      // round-trips. Bookends (correctnessOnly) ignore the aesthetic score and gate
      // only on defects; video-only brand clips are scored but not defect-gated
      // (their content can't be regenerated).
      const briefForCon = currentPlanned?.brief || currentPlanned?.visual_notes || currentPlanned?.description || currentPlanned?.label || opts.prompt;
      const con = await critiqueConsolidated({
        previewImageBase64: previewBase64,
        contactSheetBase64,
        contactTimestamps,
        briefText: briefForCon,
        sceneHtml: assembledHtml,
        expectedComponents: Array.isArray(currentPlanned?.components) ? currentPlanned.components.filter((c: any) => typeof c === "string") : undefined,
        requiresLogo: /\blogo\b/i.test(briefForCon) && (opts.brandKit?.logos?.length ?? 0) > 0,
        brandTheme: brandBackgroundIsLight(opts.brandKit) ? "light" : "dark",
        videoOnly: !!isVideoOnly,
        // Footage / hero-image background: light text over a scrim is correct then,
        // so the theme rule must not false-flag it as off_brand_theme.
        mediaBackground: /<video[\s>]|class="[^"]*\bmp-(broll|hero-img)\b|class="[^"]*broll/i.test(assembledHtml),
        llmConfig: opts.critiqueLlmConfig || opts.llmConfig,
      });
      // Bookends are intentionally minimal -> don't revise on aesthetic score, only
      // on hard defects (e.g. a dark intro/outro on a light brand).
      const critiqueResult: CritiqueResult = {
        score: opts.correctnessOnly ? 10 : con.score,
        issues: con.issues,
        suggestions: con.suggestions,
      };
      // Video-only clips can't have their content regenerated -> never defect-gate them.
      const correctness: CorrectnessResult = isVideoOnly
        ? { pass: true, defects: [] }
        : consolidatedCorrectness(con);

      // Programmatic legibility gate: measure each text element's REAL contrast
      // against the pixels rendered behind it. Catches illegible text the vision
      // model misses (dark caption over b-roll, light-on-light, faded copy) --
      // general, any scene. Video-only brand clips are skipped (can't be revised).
      if (!isVideoOnly) {
        try {
          const dur = currentScene.duration_seconds || 5;
          const contrastDefects = await measureTextContrast({
            htmlPath,
            width: opts.canvas.width,
            height: opts.canvas.height,
            // Probe several moments: captions animate in/out, so a single sample
            // misses text that isn't fully on-screen at that instant.
            atTimes: [dur * 0.35, dur * 0.6, dur * 0.85],
          });
          for (const d of contrastDefects) {
            if (d.reason === "no-backing") {
              correctness.defects.push({
                type: "illegible",
                detail: `Text "${d.text}" sits directly over moving video with NO legibility treatment. The footage brightness changes every frame, so part of the text WILL wash out. Add a backing that travels with the text: (A) an anchored scrim sized to the text block, (B) a frosted/solid caption panel behind it, or (C) darken/grade the footage during this beat -- plus white/near-white heavy text with a soft text-shadow.`,
              });
              critiqueResult.issues.push(`Text "${d.text}" over video has no legibility backing (scrim/panel)`);
            } else {
              correctness.defects.push({
                type: "illegible",
                detail: `Text "${d.text}" is unreadable over its background -- measured contrast ${d.contrast}:1, needs >= ${d.threshold}:1. Use a higher-contrast text color (lighter over dark, darker over light) or put a solid/scrim pad directly behind the text.`,
              });
              critiqueResult.issues.push(`Illegible text "${d.text}" (contrast ${d.contrast}:1, needs ${d.threshold}:1)`);
            }
          }
          if (contrastDefects.length > 0) {
            correctness.pass = false;
            console.log(`  Legibility gate: ${contrastDefects.length} low-contrast text element(s) -- forcing revision`);
          }
        } catch (e: any) {
          console.warn(`  Legibility gate skipped: ${e?.message || e}`);
        }
      }

      lastCritique = critiqueResult;
      console.log(`  Critique scene ${opts.sceneIndex} attempt ${attempt}: score=${critiqueResult.score}, issues=${critiqueResult.issues.length}, defects=${correctness.defects.length}`);
      if (critiqueResult.issues.length > 0) {
        console.log(`    Issues: ${critiqueResult.issues.join(" | ")}`);
      }
      if (!correctness.pass) {
        console.log(`  Correctness FAIL (${correctness.defects.length}): ${correctness.defects.map((d) => `[${d.type}] ${d.detail}`).join(" | ")}`);
      }

      // Clean up temp files
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      const aestheticPass = critiqueResult.score >= 7 && runtime.ok;

      // Track best attempt. A scene that throws at runtime renders degraded, so
      // it must never beat a runtime-clean attempt -- apply a large penalty so a
      // clean scene always wins, even if its visual score is lower. A scene with
      // correctness defects is likewise penalized so a clean one is preferred.
      const effectiveScore = (runtime.ok ? critiqueResult.score : critiqueResult.score - 100) - (correctness.pass ? 0 : 50);
      if (effectiveScore > bestScore) {
        bestScore = effectiveScore;
        bestScene = currentScene;
        bestCustomSources = currentCustomSources;
        bestCritique = critiqueResult;
      }

      // 6. Accept only if the vision score passes AND the scene runs clean AND
      // it has no blocking correctness defects. A pretty-but-broken scene (good
      // visual score, but overlaps/stray UI/missing logo) is forced to revise.
      if (aestheticPass && correctness.pass) {
        console.log(`  Score ${critiqueResult.score} accepted`);
        opts.trace?.endEvent({ score: critiqueResult.score, accepted: true });
        break;
      }
      if (aestheticPass && !correctness.pass) {
        console.log(`  Score ${critiqueResult.score} but correctness defects present -- forcing revision`);
      }
      if (critiqueResult.score >= 7 && !runtime.ok) {
        console.log(`  Score ${critiqueResult.score} but runtime error present -- forcing revision`);
      }

      // 7. Score < 7: surgical re-plan to fix issues

      opts.trace?.endEvent({ score: critiqueResult.score, retries: attempt + 1, accepted: false });

      // 7b. SURGICAL PATCH fast-path. Most retries are driven by a low aesthetic
      // score (or local visual defects: contrast/overlap/clip/off-brand), not by
      // structural problems. For those, edit the existing scene HTML with minimal
      // SEARCH/REPLACE blocks instead of re-emitting the whole scene -- benchmarked
      // ~16x faster on one fix (~80 output tokens vs ~6k) since generation is
      // output-bound. STRUCTURAL defects (missing/stray components), runtime errors,
      // and catastrophic scores still take the full re-plan path below.
      // Improvement-guard: if the previous patch did NOT raise the score, stop
      // patching this scene and escalate to a full regen (a fresh design may do what
      // surgical tweaks can't). reviseComponent also self-falls-back to a full
      // rewrite if SEARCH/REPLACE can't apply, so a patch never makes things worse.
      // off_brand_theme = a whole-scene color problem; surgical SEARCH/REPLACE can't
      // reliably flip it, so route it to a full regen (with the correct theme) too.
      const STRUCTURAL_DEFECTS = new Set(["missing_asset", "stray_ui", "not_sequenced", "off_brand_theme"]);
      const customEntries = currentCustomSources ? [...currentCustomSources.entries()] : [];
      const lastPatchImproved = patchAnchor < 0 || critiqueResult.score > patchAnchor;
      const canPatch =
        runtime.ok &&
        customEntries.length === 1 &&
        critiqueResult.score >= 4 &&
        !correctness.defects.some((d) => STRUCTURAL_DEFECTS.has(d.type)) &&
        lastPatchImproved;
      if (canPatch) {
        const [patchType, patchSource] = customEntries[0];
        const patchProblems = [
          ...correctness.defects.map((d) => `[${d.type}] ${d.detail}`),
          ...critiqueResult.issues,
        ];
        const patchInstructions =
          "Improve this scene by fixing these problems with MINIMAL, targeted edits. Keep the content, layout structure, and animations otherwise intact:\n" +
          patchProblems.map((p, i) => `${i + 1}. ${p}`).join("\n");
        patchAnchor = critiqueResult.score; // remember the pre-patch score for the guard
        opts.trace?.beginEvent(`critique_scene_${opts.sceneIndex}_patch`);
        try {
          const revised = await reviseComponent({
            existingSource: patchSource,
            instructions: patchInstructions,
            componentName: patchType,
            llmConfig: opts.llmConfig,
            brandKit: opts.brandKit,
            canvas: opts.canvas,
          });
          // Copy the Map (bestCustomSources may alias it) so a patch can't clobber
          // a previously-tracked best attempt.
          currentCustomSources = new Map(currentCustomSources);
          currentCustomSources.set(patchType, revised.source);
          await fs.writeFile(path.join(opts.compDir, `${patchType}.component.html`), revised.source);
          console.log(`  Critique: surgical patch on ${patchType} (${revised.blocksApplied} block(s)${revised.fullRewrite ? ", full-rewrite fallback" : ""})`);
          opts.trace?.endEvent({ patched: true, blocks: revised.blocksApplied, fullRewrite: revised.fullRewrite });
          continue; // re-assemble + re-critique the patched scene next iteration
        } catch (e: any) {
          console.warn(`  Surgical patch failed, falling back to full re-plan: ${e.message}`);
          opts.trace?.endEvent({ error: e.message });
          // fall through to the full re-plan path below
        }
      }

      // 8. Full re-plan: direct LLM call to fix the existing plan JSON
      const existingPlanJSON = JSON.stringify(currentPlanned, null, 2);
      // Build list of valid library component types for the fix prompt
      const validTypeList = opts.catalog.map(c => c.type).join(', ');
      const runtimeIssueBlock = !runtime.ok
        ? `\n\n!! CRITICAL RUNTIME ERROR (must fix): the scene threw "${runtime.error}" when the animation was seeked to ${(runtime.atTime ?? 0).toFixed(1)}s. This is almost always a querySelector/getElementById/GSAP target that returned null and was used without a guard (e.g. el.textContent on a null element). In the regenerated scene, every DOM lookup MUST be null-guarded before use, and every GSAP tween/callback must target an element that actually exists in the template. A scene that throws renders degraded and is unacceptable.\n`
        : "";
      const fixPrompt = `Fix this scene plan. The rendered output had these problems:

${critiqueResult.issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}${runtimeIssueBlock}${formatCorrectnessDefects(correctness.defects)}

Current plan:
${existingPlanJSON}

Canvas: ${opts.canvas.width}x${opts.canvas.height}
Original brief: ${opts.prompt}

VALID library component types (use ONLY these exact names, or use custom: true):
${validTypeList}, image

CRITICAL FIX RULES:
- Use ONLY the valid component types listed above. Do NOT invent component names like "headline", "text", "accent-line", "rectangle" etc. If you need something not in the list, use { "custom": true, "custom_prompt": "..." }.
- gradient-background data uses "from" and "to" fields (not "colors"): { "type": "gradient-background", "data": { "from": "var(--mp-color-background)", "to": "var(--mp-color-surface)" } }
- mesh-gradient data uses "colors" array: { "type": "mesh-gradient", "data": { "colors": ["var(--mp-color-background)", "var(--mp-color-primary)"] } }
- Fix component positions that are off-canvas (must be within 0-${opts.canvas.width} x 0-${opts.canvas.height})
- Fix missing or incorrect data props
- Remove duplicate content across components
- For text contrast: use white text (#ffffff) or var(--mp-color-text) on dark backgrounds. NEVER use dark text on dark backgrounds.
- Do NOT bloat the scene by adding many components. Fix the existing ones or swap broken types for valid alternatives. Aim for 2-4 components per scene max.
${(opts.creativity ?? 0) >= 0.7 ? "\n- CRITICAL: At this creativity level, use ONLY custom components (custom: true). Do NOT add any library components. One custom component per scene that handles everything." : ""}

Output valid JSON only. No markdown fences, no commentary.`;

      let fixedPlan: any;
      try {
        const { callLLM } = await import("./client.js");
        const fixRaw = await callLLM(opts.critiqueLlmConfig || opts.llmConfig, [
          { role: "user", content: fixPrompt },
        ], { temperature: 0.3, maxTokens: 4096 });
        const trimmed = fixRaw.trim();
        const jsonMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        fixedPlan = JSON.parse(jsonMatch ? jsonMatch[1].trim() : trimmed);
      } catch (e: any) {
        console.log(`  Critique fix-plan failed to parse: ${e.message}, keeping best (score ${bestScore})`);
        break;
      }

      if (!fixedPlan || !fixedPlan.components || fixedPlan.components.length === 0) {
        console.log(`  Critique fix-plan returned empty, keeping best (score ${bestScore})`);
        break;
      }

      // Validate fix-plan component types against catalog
      // Validate components: ensure string array of valid types
      const fixValidTypes = new Set(opts.catalog.map(c => c.type));
      fixValidTypes.add('image');
      if (fixedPlan.components && Array.isArray(fixedPlan.components)) {
        // Normalize: if LLM returned old-style objects, extract type names
        fixedPlan.components = fixedPlan.components
          .map((c: any) => typeof c === "string" ? c : (c.type || ""))
          .filter((t: string) => t.length > 0 && fixValidTypes.has(t));
      } else {
        fixedPlan.components = [];
      }

      // Ensure brief exists
      if (!fixedPlan.brief) {
        fixedPlan.brief = fixedPlan.description || fixedPlan.label || opts.prompt;
      }

      // Use the fixed plan
      const newPlanned = fixedPlan;
      currentPlanned = newPlanned;

      // Fix 1: Feed critique issues directly into the retry prompt so the
      // generator knows what went wrong and can avoid the same mistakes.
      const critiqueFeedback = buildCritiqueFeedback(critiqueResult) + formatCorrectnessDefects(correctness.defects);

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
        creativeBible: opts.creativeBible,
        critiqueFeedback,
      });

      // Save custom component HTML if needed
      if (regenerated.customSources) {
        for (const [compName, compHtml] of regenerated.customSources) {
          await fs.writeFile(path.join(opts.compDir, `${compName}.component.html`), compHtml);
        }
      }

      currentScene = regenerated.scene;
      currentCustomSources = regenerated.customSources;
      patchAnchor = -1; // a full regen resets the patch-improvement guard

    } catch (e: any) {
      console.error(`  Critique scene ${opts.sceneIndex} attempt ${attempt} failed: ${e.message}`);
      opts.trace?.endEvent({ error: e.message });
      break; // Don't let critique failures block the pipeline
    }
  }

  // Fix 2: Hard floor -- if best score < 6 after all retries, do a full
  // template swap: force a single custom component with explicit "avoid these
  // mistakes" instructions. This prevents shipping garbage scenes.
  if (bestScore > 0 && bestScore < 6 && opts.maxRetries > 0) {
    console.log(`  Hard floor triggered: best score ${bestScore} < 6, attempting full template swap`);
    opts.trace?.beginEvent(`critique_scene_${opts.sceneIndex}_template_swap`);
    try {
      const swapFeedback = bestCritique
        ? buildCritiqueFeedback(bestCritique)
        : "Previous attempts had low quality scores. Start fresh with a simpler, bolder design.";

      const swapPlan = {
        label: currentPlanned.label || `Scene ${opts.sceneIndex + 1}`,
        duration_seconds: currentPlanned.duration_seconds || 5,
        description: currentPlanned.description || opts.prompt,
        brief: `${currentPlanned.description || opts.prompt}\n\nDESIGN MANDATE: Keep it simple. One bold visual idea. Large readable text on a high-contrast background. No more than 10 words visible. Use var(--mp-color-text) on var(--mp-color-background) for guaranteed contrast.`,
        transition_in: currentPlanned.transition_in,
        components: [],
      };

      const swapped = await generateScene({
        scene: swapPlan,
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
        creativeBible: opts.creativeBible,
        critiqueFeedback: swapFeedback,
      });

      if (swapped.customSources) {
        for (const [compName, compHtml] of swapped.customSources) {
          await fs.writeFile(path.join(opts.compDir, `${compName}.component.html`), compHtml);
        }
      }

      console.log(`  Template swap complete for scene ${opts.sceneIndex}`);
      opts.trace?.endEvent({ swapped: true, previousBest: bestScore });
      return { scene: swapped.scene, customSources: swapped.customSources, critiqueResult: bestCritique };
    } catch (e: any) {
      console.warn(`  Template swap failed (non-fatal): ${e.message}`);
      opts.trace?.endEvent({ error: e.message });
    }
  }

  // Return the best-scoring attempt, not the last one
  if (bestScore > 0 && bestScore >= (lastCritique?.score ?? 0)) {
    return { scene: bestScene, customSources: bestCustomSources, critiqueResult: bestCritique };
  }
  return { scene: currentScene, customSources: currentCustomSources, critiqueResult: lastCritique };
}

/**
 * Build a human-readable critique feedback string from a CritiqueResult.
 * This is injected into the scene generator prompt so it knows exactly
 * what went wrong in the previous attempt.
 */
function buildCritiqueFeedback(critique: CritiqueResult): string {
  const parts: string[] = [];
  parts.push(`Previous attempt scored ${critique.score}/10.`);
  if (critique.issues.length > 0) {
    parts.push("\nISSUES FOUND (you MUST fix all of these):");
    for (let i = 0; i < critique.issues.length; i++) {
      parts.push(`  ${i + 1}. ${critique.issues[i]}`);
    }
  }
  if (critique.suggestions.length > 0) {
    parts.push("\nSUGGESTED FIXES:");
    for (let i = 0; i < critique.suggestions.length; i++) {
      parts.push(`  ${i + 1}. ${critique.suggestions[i]}`);
    }
  }
  // Add systemic contrast rule since it's the #1 repeat offender
  if (critique.issues.some(iss => /contrast|readab|text.*background|dark.*text|light.*text/i.test(iss))) {
    parts.push("\nCONTRAST FIX: Use var(--mp-color-text) for ALL text on var(--mp-color-background). Do NOT use low-opacity text, muted colors for headlines, or colored text on similarly-colored backgrounds.");
  }
  return parts.join("\n");
}

// ── Unified Pipeline ──

/**
 * Convert the planner's storyboard into the persisted ProjectPlan shape, so the
 * plan/storyboard -- including each scene's suggested library component types --
 * is recorded on the project for inspection and iteration. Used by both the
 * plan-only and full generation paths so project.plan is always populated.
 */
function storyboardToPlan(
  storyboard: { name: string; scenes: Array<any> },
  voice?: string,
): ProjectPlan {
  return {
    narrative: storyboard.name,
    scenes: storyboard.scenes.map((s) => ({
      label: s.label,
      purpose: s.description || "",
      template: "",
      voiceover_text: s.voiceover_text,
      duration_seconds: s.duration_seconds,
      assets: [],
      visual_notes: s.brief || s.description || "",
      components: s.components || [],
      broll_query: s.broll_query,
      hero_image: s.hero_image,
    })),
    audio: {
      music_mood: "corporate",
      voice: voice || "nova",
      pacing: "moderate",
    },
    estimated_duration: storyboard.scenes.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0),
  };
}

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

  // 1b. Download and cache reference images
  var processedRefs: ReferenceImage[] | undefined;
  var tempProjectId: string | undefined;
  if (opts.referenceImages?.length) {
    trace?.beginEvent("process_reference_images");
    // Need a project ID for caching; create early and reuse for the project shell
    tempProjectId = `proj_${uuid().replace(/-/g, "").slice(0, 8)}`;
    processedRefs = await processReferenceImages(
      opts.referenceImages as ReferenceImage[],
      opts.tenant_id,
      tempProjectId,
    );
    trace?.endEvent({ count: processedRefs.length });
    console.log(`  Reference images: ${processedRefs.length} processed`);
  }

  // 2. Creative concept stage (generates ONE unifying idea)
  var creativeBible: CreativeBible | undefined;
  if (format !== "image") {
    opts.onProgress?.({ step: "concept", percent: 8, detail: "Designing the creative direction" });
    trace?.beginEvent("concept_director");
    try {
      creativeBible = await generateCreativeBible({
        prompt: richPrompt,
        format,
        llmConfig: opts.llmConfig,
        brandKit,
        referenceImages: processedRefs,
      });
      // Inject creative direction into the prompt for the planner
      var conceptContext = formatCreativeBibleForPlanner(creativeBible);
      richPrompt = conceptContext + "\n\n---\n\n" + richPrompt;
      console.log(`  Creative concept: "${creativeBible.concept}"`);
    } catch (err) {
      console.warn("  [concept-director] Failed, continuing without concept:", (err as Error).message);
    }
    trace?.endEvent({ concept: creativeBible?.concept });
  }
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
    hasSpeakerTrack: !!opts.speaker_source,
    referenceImages: processedRefs,
    creativeBible,
  });
  trace?.endEvent({ scenes: storyboard.scenes.length });

    // Create project shell (reuse tempProjectId from reference image processing if available)
  var projectId = tempProjectId || `proj_${uuid().replace(/-/g, "").slice(0, 8)}`;
  var project: Project = {
    project_id: projectId,
    tenant_id: opts.tenant_id,
    name: storyboard.name,
    format,
    status: "draft",
    canvas,
    brand_kit: brandKit,
    scenes: [],
    creative_bible: creativeBible,
  };

  // ── Plan-only mode: save storyboard as plan and return early ──
  if (opts.planOnly) {
    project.plan = storyboardToPlan(storyboard, opts.voice as string);
    project.brief = { prompt: opts.prompt };
    project.status = "planned";
    project.created_at = new Date().toISOString();
    project.updated_at = new Date().toISOString();
    await saveProject(project);

    console.log(`  Plan-only mode: saved plan with ${project.plan.scenes.length} scenes to project ${projectId}`);

    return {
      status: "completed",
      target: opts.target,
      project,
    };
  }

  // Apply speaker track if provided
  if (opts.speaker_source) {
    project.speaker_track = {
      clips: [{
        source: opts.speaker_source,
        start: opts.speaker_start,
        trim_start: opts.speaker_trim_start,
        trim_end: opts.speaker_trim_end,
      }],
    };
  }

  // 3. Media enrichment (images, future: video, music)
  opts.onProgress?.({ step: "media", percent: 16, detail: "Preparing imagery & assets" });
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

  // 3b. Stock footage / b-roll backgrounds -- planner-decided per scene.
  // The planner tags scenes with a broll_query when real motion footage belongs
  // behind them; we fetch a matching Pexels clip into the project's assets dir and
  // hand its URL to the codegen, which PLACES it as the scene background itself
  // (exactly like a hero image -- the agent owns the composition, no special
  // injection). Capped so b-roll stays intentional. Gated by PEXELS_API_KEY.
  var brollUrlMap = new Map<number, string>();
  if (process.env.PEXELS_API_KEY) {
    trace?.beginEvent("stock_footage");
    const assetsDir = path.join(projectDir(opts.tenant_id, projectId), "assets");
    await fs.mkdir(assetsDir, { recursive: true });
    const MAX_BROLL = 5;
    let fetched = 0;
    for (let si = 0; si < storyboard.scenes.length; si++) {
      const planned = storyboard.scenes[si];
      // A scene gets b-roll OR a hero image, never both.
      if (enrichResult.imageUrls.has(si)) continue;

      const query: string | null = planned.broll_query || null;
      if (!query) continue;
      if (fetched >= MAX_BROLL) {
        console.log(`  B-roll: cap of ${MAX_BROLL} reached, skipping "${planned.label}"`);
        continue;
      }

      const filename = `broll_scene_${si}.mp4`;
      const clip = await fetchStockFootage({
        query,
        minDuration: planned.duration_seconds,
        outputDir: assetsDir,
        filename,
      });
      if (clip) {
        brollUrlMap.set(si, `/assets/${opts.tenant_id}/projects/${projectId}/assets/${filename}`);
        fetched++;
        console.log(`  B-roll scene ${si} "${planned.label}": "${query}"`);
      }
    }
    console.log(`  Stock footage: ${brollUrlMap.size} clip(s) fetched`);
    trace?.endEvent({ clips: brollUrlMap.size });
  }

  // 3c. Enforce mandatory behaviors (voiceover, bookend detection)
  var bookendScenes = new Set<number>();
  for (let si = 0; si < storyboard.scenes.length; si++) {
    var planned = storyboard.scenes[si];

    // Detect bookend scenes (intro/outro/title/closing, or a video-only brand clip).
    var isBookend = isBookendScene(planned.label, si, storyboard.scenes.length, planned.components);

    if (isBookend) {
      bookendScenes.add(si);
    }

    // Enforce voiceover on non-bookend scenes
    if (!isBookend && !planned.voiceover_text && planned.duration_seconds >= 3) {
      // Generate voiceover text from the scene description
      var fallbackVoiceover = planned.description || planned.label || "";
      if (planned.brief) {
        // Extract a concise narration from the brief (first sentence or label)
        fallbackVoiceover = planned.label?.replace(/^Scene \d+ - /, "") || planned.description || "";
      }
      if (fallbackVoiceover && fallbackVoiceover.length > 5) {
        planned.voiceover_text = fallbackVoiceover;
        console.log(`  [enforce] Scene ${si} "${planned.label}": generated fallback voiceover`);
      }
    }
  }
  if (bookendScenes.size > 0) {
    console.log(`  [enforce] Bookend scenes (skip mandatory voiceover): ${[...bookendScenes].join(", ")}`);
  }

  // 4. Generate scenes (library + custom in one pass)
  trace?.beginEvent("generate_scenes");
  var compDir = path.join(projectDir(opts.tenant_id, projectId), "components");
  await fs.mkdir(compDir, { recursive: true });

  // Parallel scene generation + critique with concurrency pool.
  // Quality-neutral speed lever: each scene still runs its full critique/regen
  // loop; raising concurrency just runs more scenes in parallel. Configurable via
  // MP_SCENE_CONCURRENCY (default 3) -- raise it if API rate limits + machine
  // resources allow (more parallel headless-Chrome captures).
  const SCENE_CONCURRENCY = Math.max(1, parseInt(process.env.MP_SCENE_CONCURRENCY || "3", 10) || 3);
  const sceneResults: Array<{ scene: Scene; customSources?: Map<string, string> }> = new Array(storyboard.scenes.length);

  // Per-scene progress + ETA. Scene generation spans 20%->75% of the bar; each
  // scene that finishes nudges it forward and re-estimates time remaining from
  // the average per-scene wall-clock so far (the bulk of the wait lives here).
  const totalScenes = storyboard.scenes.length;
  const sceneStart = Date.now();
  let scenesDone = 0;
  opts.onProgress?.({ step: "scenes", percent: 20, detail: `Generating ${totalScenes} scene${totalScenes === 1 ? "" : "s"}` });

  for (let batchStart = 0; batchStart < storyboard.scenes.length; batchStart += SCENE_CONCURRENCY) {
    const batchEnd = Math.min(batchStart + SCENE_CONCURRENCY, storyboard.scenes.length);
    const batch: Promise<void>[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      batch.push((async () => {
        const planned = storyboard.scenes[i];
        const imageUrl = enrichResult.imageUrls.get(i);

        // Only a video-only brand clip skips the aesthetic critique -- its frames
        // can't be regenerated, so there's nothing to revise. A *content* bookend
        // (a codegen intro/outro with text/CTA) gets the FULL critique like any
        // other scene, so composition defects -- overlapping or duplicated text --
        // score low and get revised instead of shipping. (Previously every
        // label-based bookend forced the aesthetic score to 10 and ignored it,
        // which let messy outros through.)
        const plannedComps = Array.isArray(planned.components)
          ? planned.components.filter((c: any) => typeof c === "string") : [];
        const skipCritique = plannedComps.length === 1 && plannedComps[0] === "video";
        if (skipCritique) {
          console.log(`  Scene ${i + 1}: brand video clip, correctness gate only`);
        }

        const generated = await generateScene({
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
          referenceImages: processedRefs,
          creativeBible,
          brollVideoUrl: brollUrlMap.get(i),
        });

        // Save custom component HTML if needed
        if (generated.customSources) {
          for (const [compName, html] of generated.customSources) {
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
            critique: skipCritique ? false : opts.critique,
            // Bookends skip the aesthetic critique but STILL get the correctness +
            // brand-theme gate so an intro/outro can't drift off-brand (e.g. dark on a light brand).
            // (Already inside `if (opts.critique !== false)`, so critique is enabled here.)
            correctnessOnly: skipCritique,
            creativity: resolveCreativity(opts),
            critiqueLlmConfig: config.critiqueLlm,
            creativeBible,
          });
          finalScene = critiqueResult.scene;
          finalCustomSources = critiqueResult.customSources;
          if (finalCustomSources && finalCustomSources !== generated.customSources) {
            for (const [compName, html] of finalCustomSources) {
              await fs.writeFile(path.join(compDir, `${compName}.component.html`), html);
            }
          }
        }

        sceneResults[i] = { scene: finalScene, customSources: finalCustomSources };

        // Nudge progress forward + re-estimate ETA as each scene lands.
        scenesDone++;
        const elapsed = (Date.now() - sceneStart) / 1000;
        const remaining = totalScenes - scenesDone;
        const eta = scenesDone > 0 && remaining > 0 ? Math.round((elapsed / scenesDone) * remaining) : undefined;
        opts.onProgress?.({
          step: "scenes",
          percent: Math.round(20 + 55 * (scenesDone / totalScenes)),
          detail: `Scene ${scenesDone}/${totalScenes} ready`,
          etaSeconds: eta,
        });
      })());
    }

    await Promise.all(batch);
  }

  // Add scenes in order, carrying over voiceover text and stock footage from planner
  for (let si = 0; si < sceneResults.length; si++) {
    const scene = sceneResults[si].scene;
    const planned = storyboard.scenes[si];
    if (planned.voiceover_text) {
      if (!scene.audio_hints) scene.audio_hints = {};
      scene.audio_hints.voiceover_text = planned.voiceover_text;
    }
    project.scenes.push(scene);
  }


  // Apply speaker track scene-level settings after all scenes are generated
  if (project.speaker_track) {
    const FULL_FRAME_TYPES = new Set(["screencast", "browser-frame", "video", "image-showcase", "S2-screencast-pip"]);
    for (var si = 0; si < project.scenes.length; si++) {
      const scene = project.scenes[si];
      if (!scene.content_region) {
        // Check if any component is a full-frame type
        const hasFullFrame = scene.components.some(c => FULL_FRAME_TYPES.has(c.type));
        if (!hasFullFrame) {
          scene.content_region = { side: "right", width: "42%" };
        }
      }
    }

    // Set pip_source: "speaker" on S2-screencast-pip scenes so the pipeline
    // resolves the speaker video path before rendering.
    for (const scene of project.scenes) {
      for (const comp of scene.components) {
        if (comp.type === "S2-screencast-pip") {
          const d = comp.data as Record<string, unknown>;
          if (!d.pip_source) {
            d.pip_source = "speaker";
          }
        }
      }
    }
  }

  trace?.endEvent({ scenes: project.scenes.length });

  // Merge assets from enrichment
  if (enrichResult.assets.length > 0) {
    project.assets = [...(project.assets || []), ...enrichResult.assets];
  }

  // Pass 3: Editorial critique (full video flow) -- VISION + PLAN-FIDELITY.
  // Capture one frame per scene, tile into a storyboard, and ask the critique:
  // did each rendered scene actually DELIVER what the PLAN intended? Flagged
  // scenes are regenerated (bounded) with the corrective note fed back to the
  // codegen, then the whole video is scored again.
  if (opts.critique !== false && format !== "image" && project.scenes.length >= 3) {
    opts.onProgress?.({ step: "editorial", percent: 80, detail: "Reviewing the full storyboard for plan fidelity" });
    trace?.beginEvent("editorial_critique");
    try {
      const editorialExtraDirs = [compDir, tenantComponentsDir(opts.tenant_id)];

      // Capture one frame per scene, tile a storyboard, and run the plan-aware
      // vision critique (the storyboard image + each scene's planned intent).
      const runEditorial = async (): Promise<EditorialCritiqueResult> => {
        const frameDir = path.join(os.tmpdir(), `editorial_${projectId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
        await fs.mkdir(frameDir, { recursive: true });
        const framePaths: string[] = [];
        try {
          for (let i = 0; i < project.scenes.length; i++) {
            const sc = project.scenes[i];
            try {
              const sources: ComponentSource[] = [];
              for (const comp of sc.components) {
                const src = await findComponentSourceForCritique(comp.type, config.componentLibDir, editorialExtraDirs);
                if (src) sources.push({ type: comp.type, source: src });
              }
              if (sources.length === 0) continue;
              const html = await assembleSceneAuto({ scene: sc, components: sources, brandKit, canvas, gsapDir: config.gsapDir, componentLibDir: config.componentLibDir, preview: true });
              const hp = path.join(frameDir, `h${i}.html`);
              await fs.writeFile(hp, html);
              const fp = path.join(frameDir, `s${i}.png`);
              await captureSingleFrame({ htmlPath: hp, outputPath: fp, width: canvas.width, height: canvas.height, atTime: (sc.duration_seconds || 5) * 0.55 });
              framePaths.push(fp);
            } catch { /* skip a scene that won't assemble */ }
          }
          const storyboardBase64 = await tileFramesToStoryboard(framePaths);
          const sceneMeta = project.scenes.map((s, i) => ({
            label: s.label || "",
            duration_seconds: s.duration_seconds,
            transition_in: s.transition_in,
            component_types: s.components.map(c => c.type),
            word_count: estimateWordCount(s),
            intent: storyboard.scenes[i]?.brief || storyboard.scenes[i]?.description || storyboard.scenes[i]?.label,
          }));
          return await critiqueEditorial({ scenes: sceneMeta, prompt: richPrompt, llmConfig: config.critiqueLlm, format, trace, storyboardBase64: storyboardBase64 || undefined });
        } finally {
          await fs.rm(frameDir, { recursive: true, force: true }).catch(() => {});
        }
      };

      const editorial = await runEditorial();
      console.log(`  Editorial critique: overall=${editorial.overall_score}, pacing=${editorial.pacing_score}, variety=${editorial.variety_score}, coherence=${editorial.coherence_score}`);
      if (editorial.issues.length > 0) console.log(`    Editorial issues: ${editorial.issues.join(" | ")}`);
      if (editorial.fixes.length > 0) console.log(`    Suggested fixes: ${editorial.fixes.map(f => f.type + (f.scene_index != null ? ` (scene ${f.scene_index + 1})` : "") + ": " + f.detail).join(" | ")}`);

      // Structural auto-fixes (transition variety, breathing, durations).
      const editorialChanges = applyEditorialFixes(project, editorial, brandKit);

      // Plan-fidelity fixes: regenerate scenes that didn't achieve their intent
      // (bounded), feeding the corrective note back to the codegen.
      const MAX_EDITORIAL_REGEN = 2;
      const sceneFixes = (editorial.fixes || []).filter(f => f.type === "fix_scene" && typeof f.scene_index === "number" && f.detail && f.scene_index! >= 0 && f.scene_index! < project.scenes.length);
      let regen = 0;
      for (const fix of sceneFixes) {
        if (regen >= MAX_EDITORIAL_REGEN) break;
        const idx = fix.scene_index!;
        const planned = storyboard.scenes[idx];
        if (!planned) continue;
        try {
          const re = await generateScene({
            scene: planned, sceneIndex: idx, totalScenes: project.scenes.length, prompt: richPrompt, format,
            llmConfig: opts.llmConfig, brandKit, canvas, imageUrl: enrichResult.imageUrls.get(idx),
            tenantId: opts.tenant_id, projectId, referenceImages: processedRefs, creativeBible,
            brollVideoUrl: brollUrlMap.get(idx),
            critiqueFeedback: `EDITORIAL FIX -- this scene did not achieve its planned intent. ${fix.detail}`,
          });
          if (re.customSources) for (const [n, h] of re.customSources) await fs.writeFile(path.join(compDir, `${n}.component.html`), h);
          const newScene = re.scene;
          if (planned.voiceover_text) { if (!newScene.audio_hints) newScene.audio_hints = {}; newScene.audio_hints.voiceover_text = planned.voiceover_text; }
          project.scenes[idx] = newScene;
          regen++;
          console.log(`    Editorial: regenerated scene ${idx + 1} to match intent`);
        } catch (e: any) { console.warn(`    Editorial regen scene ${idx + 1} failed: ${e.message}`); }
      }

      if (editorialChanges > 0 || regen > 0) {
        await saveProject(project);
        console.log(`    Applied ${editorialChanges} structural fix(es), regenerated ${regen} scene(s)`);
      }

      // NOTE: we deliberately do NOT re-run runEditorial() to "re-score" after
      // regen. That second pass re-rendered every scene frame + made another large
      // vision call, and its result was ONLY logged -- never acted on (there is no
      // further regen round regardless of the new score). It cost ~80-150s on
      // exactly the slowest runs (the ones that regenerate a scene) for a cosmetic
      // log line, so dropping it is behavior-neutral and saves real time.
    } catch (e: any) {
      console.warn(`  Editorial critique failed (non-fatal): ${e.message}`);
    }
    trace?.endEvent();
  }

  // ── Proactive scene duration sync ──
  // Estimate TTS duration from word count BEFORE generating audio.
  // Prevents reactive extension and keeps animations/visuals in sync.
  if (opts.voiceover && (format === "video" || format === "slideshow")) {
    const WPM = 150;  // words per minute for TTS
    const BUFFER_S = 0.8;  // breathing room after narration
    let durationAdjustments = 0;

    for (const scene of project.scenes) {
      const voText = scene.audio_hints?.voiceover_text;
      if (!voText) continue;

      const wordCount = voText.trim().split(/\s+/).length;
      const estimatedDuration = (wordCount / WPM) * 60 + BUFFER_S;

      if (estimatedDuration > scene.duration_seconds) {
        const oldDur = scene.duration_seconds;
        scene.duration_seconds = Math.ceil(estimatedDuration);
        console.log(`  Duration sync: "${scene.label}" ${oldDur}s -> ${scene.duration_seconds}s (${wordCount} words, ~${estimatedDuration.toFixed(1)}s narration)`);
        durationAdjustments++;
      }
    }

    if (durationAdjustments > 0) {
      console.log(`  Duration sync: pre-adjusted ${durationAdjustments} scene(s) to fit narration`);
      await saveProject(project);
    }
  }

    // ── Voiceover generation (TTS) ──
  if (opts.voiceover && (format === "video" || format === "slideshow")) {
    trace?.beginEvent("generate_voiceover");
    try {
      const voDir = path.join(projectDir(opts.tenant_id, projectId), "voiceover");
      const voiceoverInputs = project.scenes.map(s => ({
        label: s.label,
        voiceover_text: s.audio_hints?.voiceover_text,
        duration_seconds: s.duration_seconds,
      }));

      const voicePaths = await generateSceneVoiceovers({
        scenes: voiceoverInputs,
        voice: opts.voice || project.brand_kit?.voice || "nova",
        model: "tts-1-hd",
        outputDir: voDir,
        apiKey: process.env.OPENAI_API_KEY || "",
      });

      // Add voiceover tracks to project audio
      if (!project.audio) {
        project.audio = { tracks: [] };
      }

      // Probe each clip duration and extend scenes if narration is longer
      const { execFile: execFileCb } = await import("node:child_process");
      const { promisify: promisifyFn } = await import("node:util");
      const execFileVo = promisifyFn(execFileCb);

      const voDurations: number[] = [];
      for (let i = 0; i < project.scenes.length; i++) {
        if (voicePaths[i]) {
          try {
            const probe = await execFileVo("ffprobe", [
              "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", voicePaths[i]
            ]);
            const clipDur = parseFloat(probe.stdout.trim()) || 0;
            voDurations[i] = clipDur;

            // Extend scene duration if voiceover is longer (add 0.5s buffer)
            if (clipDur > project.scenes[i].duration_seconds) {
              const oldDur = project.scenes[i].duration_seconds;
              project.scenes[i].duration_seconds = Math.ceil(clipDur + 0.5);
              console.log(`  Voiceover: extended scene ${i} from ${oldDur}s to ${project.scenes[i].duration_seconds}s (clip: ${clipDur.toFixed(1)}s)`);
            }
          } catch {
            voDurations[i] = 0;
          }
        } else {
          voDurations[i] = 0;
        }
      }

      // Calculate cumulative start times using (potentially extended) scene durations
      let cumulativeTime = 0;
      for (let i = 0; i < project.scenes.length; i++) {
        if (voicePaths[i]) {
          project.audio.tracks.push({
            id: `vo_scene_${i}`,
            type: "voiceover" as const,
            source: voicePaths[i],
            volume: 1.0,
            start_time: cumulativeTime,
            loop: false,
          });
        }
        cumulativeTime += project.scenes[i].duration_seconds;
      }

      console.log(`  Voiceover: generated ${voicePaths.filter(p => p).length} TTS clips`);

      // ── Background music with ducking ──
      if (opts.backgroundMusic) {
        try {
          const { selectMusic } = await import("../audio/music.js");

          // Determine mood from prompt
          const promptLower = richPrompt.toLowerCase();
          let mood = "corporate";
          if (promptLower.includes("exciting") || promptLower.includes("launch") || promptLower.includes("announcement")) mood = "upbeat";
          else if (promptLower.includes("calm") || promptLower.includes("elegant") || promptLower.includes("premium")) mood = "calm";
          else if (promptLower.includes("tech") || promptLower.includes("ai") || promptLower.includes("data")) mood = "electronic";
          else if (promptLower.includes("emotion") || promptLower.includes("story") || promptLower.includes("inspire")) mood = "inspiring";

          console.log(`  Background music: searching for "${mood}" mood...`);

          const totalDuration = project.scenes.reduce((sum: number, s: any) => sum + s.duration_seconds, 0);
          const track = await selectMusic({
            mood,
            brandKit,
            tenantId: opts.tenant_id,
            minDuration: Math.max(30, Math.floor(totalDuration * 0.8)),
          });

          if (track) {
            console.log(`  Background music: "${track.title}" by ${track.artist} [${track.source}] (${track.duration}s)`);

            project.audio.tracks.push({
              id: "bgm",
              type: "music" as const,
              source: track.path,
              volume: 0.12,
              start_time: 0,
              loop: true,
              fade_in: 2,
              fade_out: 3,
            });

            // Add ducking config to project audio
            (project.audio as any).ducking = {
              music_volume_during_voiceover: 0.04,
              attack: 0.3,
              release: 0.8,
            };

            console.log(`  Background music: added with ducking (0.12 -> 0.04 during voiceover)`);
          } else {
            console.log("  Background music: no tracks found from any source, skipping");
          }
        } catch (e: any) {
          console.warn(`  Background music failed (non-fatal): ${e.message}`);
        }
      }
    } catch (e: any) {
      console.warn(`  Voiceover generation failed (non-fatal): ${e.message}`);
    }
    trace?.endEvent();
  }

  // Persist the planner's storyboard (briefs + suggested components) on the
  // project so it's available for inspection and iteration after a full run,
  // not just in plan-only mode.
  project.plan = storyboardToPlan(storyboard, opts.voice as string);
  project.brief = { prompt: opts.prompt };
  project.status = "generated";
  await saveProject(project);

  return {
    status: "completed",
    target: opts.target,
    project,
  };
}

/**
 * Fix 3: Auto-apply safe editorial fixes.
 *
 * Currently handles:
 *   - vary_transition: break runs of 3+ identical transitions
 *   - add_breathing: inject a minimal breathing scene before CTA or dense scenes
 *
 * Returns the number of changes applied.
 */
function applyEditorialFixes(
  project: Project,
  editorial: EditorialCritiqueResult,
  brandKit: BrandKit,
): number {
  var changes = 0;
  const scenes = project.scenes;
  if (scenes.length < 3) return 0;

  // --- vary_transition: break runs of 3+ identical transitions ---
  const ALTERNATE_TRANSITIONS: Array<SceneTransition["type"]> = [
    "blur-crossfade", "wipe-left", "slide-up", "iris", "scale-rotate",
  ];
  for (let i = 2; i < scenes.length; i++) {
    const t0 = scenes[i - 2].transition_in?.type;
    const t1 = scenes[i - 1].transition_in?.type;
    const t2 = scenes[i].transition_in?.type;
    if (t0 && t1 && t2 && t0 === t1 && t1 === t2) {
      // Pick a different transition for the middle scene
      const alt = ALTERNATE_TRANSITIONS.find(t => t !== t0) || "blur-crossfade";
      scenes[i - 1].transition_in = {
        type: alt,
        duration_seconds: scenes[i - 1].transition_in?.duration_seconds || 0.5,
      };
      console.log(`    Transition fix: scene ${i} "${scenes[i - 1].label}" ${t0} -> ${alt}`);
      changes++;
    }
  }

  // --- add_breathing: inject a visual pause before the last scene (CTA) ---
  // Only if editorial flagged it and there isn't already a short breathing scene
  const needsBreathing = editorial.fixes.some(f => f.type === "add_breathing");
  if (needsBreathing && scenes.length >= 4) {
    // Check the second-to-last scene isn't already very short (a breathing scene)
    const preCta = scenes[scenes.length - 2];
    if (preCta.duration_seconds > 2.5) {
      const breathingScene: Scene = {
        id: `scene_breathing_${Date.now()}`,
        label: "Visual Pause",
        duration_seconds: 2,
        transition_in: { type: "blur-crossfade", duration_seconds: 0.8 },
        components: [{
          id: "comp_0",
          type: "gradient-background",
          data: {
            color_start: brandKit.colors?.background || "#0f172a",
            color_end: brandKit.colors?.surface || "#1e293b",
            direction: "135deg",
          },
          z_index: 0,
          position: { x: 0, y: 0, width: "100%", height: "100%" },
        }],
      };
      // Insert before the last scene
      scenes.splice(scenes.length - 1, 0, breathingScene);
      console.log(`    Breathing scene injected before CTA`);
      changes++;
    }
  }

  return changes;
}

/**
 * Estimate word count in a scene from component data.
 */
function estimateWordCount(scene: Scene): number {
  var words = 0;
  for (var comp of scene.components) {
    if (comp.data) {
      for (var val of Object.values(comp.data)) {
        if (typeof val === "string") {
          words += val.split(/\s+/).length;
        }
      }
    }
  }
  return words;
}
