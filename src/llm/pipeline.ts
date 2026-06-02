/**
 * Pipeline Orchestrator
 *
 * Main entry point for the LLM generation pipeline. The \`generate\` MCP tool
 * calls this. Routes by target format.
 *
 * All multi-scene formats (video, deck, presentation, image, scene) go through
 * the unified pipeline: one planner decides per-scene whether to use library
 * components or generate custom HTML. A \`creativity\` parameter (0-1) biases
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
import { saveProject } from "../persistence/project.js";
import { loadBrandKit } from "../persistence/brand-kit.js";
import { tenantComponentsDir, projectDir } from "../persistence/paths.js";
import { config } from "../config.js";
import type { BrandKit, Canvas, OutputFormat, Project } from "../core/types.js";
import { TraceBuilder } from "../trace/index.js";

// Keep old imports for backwards compat (deprecated functions still exist in their files)
// import { planScene } from "./scene-planner.js";
// import { planProject } from "./project-planner.js";
// import { planFreeformStoryboard, generateFreeformScenes } from "./freeform-planner.js";

export type PipelineTarget = "component" | "scene" | "video" | "image" | "deck" | "presentation";

export interface PipelineOpts {
  prompt: string;
  target: PipelineTarget;
  tenant_id: string;
  project_id?: string;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  critique?: boolean;
  maxRevisions?: number;
  sceneCount?: number;
  generateImages?: boolean;
  /** @deprecated Use creativity instead. Mapped: freeform -> 0.9, structured -> 0.2 */
  mode?: "freeform" | "structured";
  creativity?: number; // 0-1, default 0.5
  trace?: TraceBuilder;
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
  if (opts.mode === "freeform") return 0.9;
  if (opts.mode === "structured") return 0.2;
  return 0.5;
}

/**
 * Run the full generation pipeline.
 */
export async function runGeneratePipeline(opts: PipelineOpts): Promise<PipelineResult> {
  var brandKit = opts.brandKit || DEFAULT_BRAND_KIT;
  var canvas = opts.canvas || DEFAULT_CANVAS;

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
      case "deck":
      case "presentation":
      case "image":
      case "scene":
        result = await runUnifiedPipeline(opts, brandKit, canvas, catalog, opts.target === "scene" ? "video" : opts.target as OutputFormat, trace);
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
  var sceneCount = expanded.sceneCount || opts.sceneCount;
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
    if (generated.customComponentSource) {
      var compName = `scene_${String(i + 1).padStart(3, "0")}`;
      await fs.writeFile(path.join(compDir, `${compName}.component.html`), generated.customComponentSource);
      console.log(`  Saved: ${compDir}/${compName}.component.html`);
    }

    project.scenes.push(generated.scene);
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
