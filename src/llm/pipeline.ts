/**
 * Pipeline Orchestrator
 *
 * Main entry point for the LLM generation pipeline. The `generate` MCP tool
 * calls this. Routes by target format and optionally runs a critiquer loop.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import type { LLMConfig } from "./client.js";
import { generateComponentLLM } from "./component-gen.js";
import { planScene } from "./scene-planner.js";
import { planProject } from "./project-planner.js";
import { critiqueScene, type CritiqueResult } from "./critiquer.js";
import { expandPrompt } from "./expander.js";
import { buildComponentCatalog, type ComponentCatalogEntry } from "./catalog.js";
import { planFreeform } from "./freeform-planner.js";
import { saveGeneratedComponent } from "../core/component-generator.js";
import { createProject, saveProject } from "../persistence/project.js";
import { loadBrandKit } from "../persistence/brand-kit.js";
import { tenantComponentsDir } from "../persistence/paths.js";
import { config } from "../config.js";
import type { BrandKit, Canvas, OutputFormat, Project } from "../core/types.js";
import { TraceBuilder } from "../trace/index.js";

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
  mode?: "freeform" | "structured";
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
  critique?: CritiqueResult;
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

      case "scene":
        result = await runScenePipeline(opts, brandKit, canvas, catalog, "video", trace);
        break;

      case "image":
        result = await runScenePipeline(opts, brandKit, canvas, catalog, "image", trace);
        break;

      case "video":
        if (opts.mode === "freeform" || opts.mode === undefined) {
          result = await runFreeformPipeline(opts, brandKit, canvas, trace);
        } else {
          result = await runProjectPipeline(opts, brandKit, canvas, catalog, "video", trace);
        }
        break;

      case "deck":
      case "presentation":
        result = await runProjectPipeline(opts, brandKit, canvas, catalog, "deck", trace);
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

// ── Scene Pipeline ──

async function runScenePipeline(
  opts: PipelineOpts,
  brandKit: BrandKit,
  canvas: Canvas,
  catalog: ComponentCatalogEntry[],
  format: OutputFormat = "video",
  trace?: TraceBuilder,
): Promise<PipelineResult> {
  // Expand thin prompts into rich creative briefs
  trace?.beginEvent("expand_prompt");
  var expanded = await expandPrompt({
    prompt: opts.prompt,
    format,
    llmConfig: opts.llmConfig,
    brandKit,
  });
  var richPrompt = expanded.prompt;
  trace?.endEvent({ expanded: expanded.expanded });
  if (expanded.expanded) {
    console.log("  Prompt expanded for scene planning");
  }

  trace?.beginEvent("plan_scene");
  var sceneResult = await planScene({
    prompt: richPrompt,
    llmConfig: opts.llmConfig,
    componentCatalog: catalog,
    brandKit,
    canvas,
    format,
  });
  trace?.endEvent({ components: sceneResult.scene.components.map((c: any) => c.type) });
  trace?.setPlanner({
    scene_count: 1,
    components: sceneResult.scene.components.map((c: any) => c.type),
    format,
  });

  // Save any custom components to tenant library
  for (var custom of sceneResult.customComponents) {
    await saveGeneratedComponent(opts.tenant_id, custom.type, custom.source, "custom");
  }

  // Create a project with one scene
  var project = await createProject({
    tenant_id: opts.tenant_id,
    name: sceneResult.scene.label || "Generated Scene",
    format,
  });

  project.scenes = [sceneResult.scene];
  project.brand_kit = brandKit;
  project.canvas = canvas;
  await saveProject(project);

  return {
    status: "completed",
    target: opts.target,
    project,
    customComponents: sceneResult.customComponents,
  };
}

// ── Project Pipeline ──

async function runProjectPipeline(
  opts: PipelineOpts,
  brandKit: BrandKit,
  canvas: Canvas,
  catalog: ComponentCatalogEntry[],
  format: OutputFormat,
  trace?: TraceBuilder,
): Promise<PipelineResult> {
  // Expand thin prompts into rich creative briefs
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
    console.log("  Prompt expanded for project planning");
  }

  trace?.beginEvent("plan_project");
  var projectResult = await planProject({
    prompt: richPrompt,
    format,
    llmConfig: opts.llmConfig,
    componentCatalog: catalog,
    brandKit,
    canvas,
    sceneCount,
  });
  trace?.endEvent({
    scene_count: projectResult.project.scenes.length,
  });
  trace?.setPlanner({
    scene_count: projectResult.project.scenes.length,
    components: projectResult.project.scenes.flatMap((s: any) => s.components?.map((c: any) => c.type) || []),
    format,
  });
  // format already flows through PlanProjectOpts into planScene

  // Fill in tenant_id
  projectResult.project.tenant_id = opts.tenant_id;

  // Save any custom components to tenant library
  for (var custom of projectResult.customComponents) {
    await saveGeneratedComponent(opts.tenant_id, custom.type, custom.source, "custom");
  }

  // Save the project
  await saveProject(projectResult.project);

  return {
    status: "completed",
    target: opts.target,
    project: projectResult.project,
    customComponents: projectResult.customComponents,
  };
}

// ── Freeform Pipeline ──

async function runFreeformPipeline(
  opts: PipelineOpts,
  brandKit: BrandKit,
  canvas: Canvas,
  trace?: TraceBuilder,
): Promise<PipelineResult> {
  // Expand thin prompts into rich creative briefs
  trace?.beginEvent("expand_prompt");
  var expanded = await expandPrompt({
    prompt: opts.prompt,
    format: "video",
    llmConfig: opts.llmConfig,
    brandKit,
    sceneCount: opts.sceneCount,
  });
  var richPrompt = expanded.prompt;
  trace?.endEvent({ expanded: expanded.expanded });
  if (expanded.expanded) {
    console.log("  Prompt expanded for freeform planning");
  }

  // One LLM call produces all scenes with full HTML
  trace?.beginEvent("plan_freeform");
  var freeformResult = await planFreeform({
    prompt: richPrompt,
    format: "video",
    llmConfig: opts.llmConfig,
    brandKit,
    canvas,
    sceneCount: expanded.sceneCount || opts.sceneCount,
    tenantId: opts.tenant_id,
    generateImages: opts.generateImages,
  });
  trace?.endEvent({
    scene_count: freeformResult.project.scenes.length,
  });
  trace?.setPlanner({
    scene_count: freeformResult.project.scenes.length,
    components: freeformResult.project.scenes.flatMap((s: any) => s.components?.map((c: any) => c.type) || []),
    format: "video",
  });

  // Save the project (freeform components already saved by planFreeform)
  await saveProject(freeformResult.project);

  return {
    status: "completed",
    target: opts.target,
    project: freeformResult.project,
  };
}
