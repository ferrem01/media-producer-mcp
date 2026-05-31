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
import { buildComponentCatalog, type ComponentCatalogEntry } from "./catalog.js";
import { saveGeneratedComponent } from "../core/component-generator.js";
import { createProject, saveProject } from "../persistence/project.js";
import { loadBrandKit } from "../persistence/brand-kit.js";
import { tenantComponentsDir } from "../persistence/paths.js";
import { config } from "../config.js";
import type { BrandKit, Canvas, OutputFormat, Project } from "../core/types.js";

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

  // Build component catalog
  var catalog = await buildComponentCatalog(
    config.componentLibDir,
    tenantComponentsDir(opts.tenant_id),
  );

  try {
    switch (opts.target) {
      case "component":
        return await runComponentPipeline(opts, brandKit);

      case "scene":
        return await runScenePipeline(opts, brandKit, canvas, catalog);

      case "image":
        return await runScenePipeline(opts, brandKit, canvas, catalog, "image");

      case "video":
        return await runProjectPipeline(opts, brandKit, canvas, catalog, "video");

      case "deck":
      case "presentation":
        return await runProjectPipeline(opts, brandKit, canvas, catalog, "deck");
    }
  } catch (e: any) {
    return {
      status: "error",
      target: opts.target,
      error: e.message || String(e),
    };
  }
}

// ── Component Pipeline ──

async function runComponentPipeline(
  opts: PipelineOpts,
  brandKit: BrandKit,
): Promise<PipelineResult> {
  var result = await generateComponentLLM({
    prompt: opts.prompt,
    llmConfig: opts.llmConfig,
    brandKit,
  });

  // Save to tenant library
  var savedPath = await saveGeneratedComponent(
    opts.tenant_id,
    result.type,
    result.source,
    "custom",
  );

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
): Promise<PipelineResult> {
  var sceneResult = await planScene({
    prompt: opts.prompt,
    llmConfig: opts.llmConfig,
    componentCatalog: catalog,
    brandKit,
    canvas,
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
): Promise<PipelineResult> {
  var projectResult = await planProject({
    prompt: opts.prompt,
    format,
    llmConfig: opts.llmConfig,
    componentCatalog: catalog,
    brandKit,
    canvas,
    sceneCount: opts.sceneCount,
  });

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
