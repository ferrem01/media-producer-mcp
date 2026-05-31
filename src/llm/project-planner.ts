/**
 * Project Planner
 *
 * Plans a full multi-scene project (video, deck, slideshow).
 * Uses the scene planner for each scene.
 */

import { callLLM, type LLMConfig } from "./client.js";
import { projectPlannerSystemPrompt } from "./prompts.js";
import { planScene } from "./scene-planner.js";
import { formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import type { BrandKit, Canvas, OutputFormat, Project, Scene, SceneTransition } from "../core/types.js";
import { v4 as uuid } from "uuid";

export interface PlanProjectOpts {
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  componentCatalog: ComponentCatalogEntry[];
  brandKit: BrandKit;
  canvas: Canvas;
  sceneCount?: number;
}

interface ProjectPlannerOutput {
  name: string;
  scene_count: number;
  scenes: Array<{
    label: string;
    prompt: string;
    duration_seconds: number;
    transition_in?: {
      type: "crossfade" | "wipe-left" | "wipe-right" | "slide-up" | "slide-down" | "iris" | "none";
      duration_seconds: number;
    };
  }>;
}

/**
 * Plan a full multi-scene project.
 * Returns a Project with all scenes populated.
 */
export async function planProject(opts: PlanProjectOpts): Promise<{
  project: Project;
  customComponents: Array<{ type: string; source: string }>;
}> {
  var catalogStr = formatCatalogForPrompt(opts.componentCatalog);
  var systemPrompt = projectPlannerSystemPrompt(catalogStr);

  var userPrompt = `Create a ${opts.format} project.\n\n${opts.prompt}`;
  if (opts.sceneCount) {
    userPrompt += `\n\nTarget scene count: ${opts.sceneCount}.`;
  }

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { temperature: 0.5 });

  // Parse JSON response
  var plan: ProjectPlannerOutput;
  try {
    plan = JSON.parse(stripJsonFences(raw));
  } catch (e) {
    throw new Error(`Project planner returned invalid JSON: ${raw.substring(0, 200)}`);
  }

  // Plan each scene using the scene planner
  var allScenes: Scene[] = [];
  var allCustomComponents: Array<{ type: string; source: string }> = [];

  for (var i = 0; i < plan.scenes.length; i++) {
    var scenePlan = plan.scenes[i];

    var sceneResult = await planScene({
      prompt: scenePlan.prompt,
      llmConfig: opts.llmConfig,
      componentCatalog: opts.componentCatalog,
      brandKit: opts.brandKit,
      canvas: opts.canvas,
      duration: scenePlan.duration_seconds,
    });

    // Apply the label and transition from the project plan
    sceneResult.scene.label = scenePlan.label;
    if (scenePlan.transition_in) {
      sceneResult.scene.transition_in = scenePlan.transition_in;
    }

    allScenes.push(sceneResult.scene);
    allCustomComponents.push(...sceneResult.customComponents);
  }

  // Assemble the project
  var projectId = `proj_${uuid().substring(0, 8)}`;
  var project: Project = {
    project_id: projectId,
    tenant_id: "", // Caller fills this in
    name: plan.name || "Untitled Project",
    format: opts.format,
    status: "draft",
    canvas: opts.canvas,
    brand_kit: opts.brandKit,
    scenes: allScenes,
  };

  return { project, customComponents: allCustomComponents };
}

function stripJsonFences(raw: string): string {
  var trimmed = raw.trim();
  var match = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (match) return match[1].trim();
  return trimmed;
}
