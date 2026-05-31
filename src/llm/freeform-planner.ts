/**
 * Freeform Planner
 *
 * A single LLM call that plans AND writes all scenes at once.
 * Instead of selecting from a component library, the LLM writes
 * full HTML+CSS+GSAP per scene with complete creative freedom.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { callLLM, type LLMConfig } from "./client.js";
import { freeformPlannerSystemPrompt } from "./prompts.js";
import { createProject, saveProject } from "../persistence/project.js";
import { projectDir } from "../persistence/paths.js";
import type { BrandKit, Canvas, OutputFormat, Project, Scene, SceneTransition } from "../core/types.js";

export interface FreeformPlannerOpts {
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  sceneCount?: number;
}

export interface FreeformResult {
  project: Project;
  /** One .component.html source per scene, saved to project dir */
  sceneHtmlSources: string[];
}

interface FreeformLLMOutput {
  name: string;
  scenes: Array<{
    label: string;
    duration_seconds: number;
    transition_in?: {
      type: string;
      duration_seconds: number;
    };
    html: string;
  }>;
}

/**
 * Plan a full project in freeform mode.
 * One LLM call produces all scenes with complete HTML source.
 */
export async function planFreeform(opts: FreeformPlannerOpts): Promise<FreeformResult> {
  var systemPrompt = freeformPlannerSystemPrompt(opts.format, opts.canvas, opts.brandKit);

  var userPrompt = `Create a ${opts.format} project.\n\n${opts.prompt}`;
  if (opts.sceneCount) {
    userPrompt += `\n\nTarget scene count: ${opts.sceneCount}.`;
  }

  console.log("  Freeform planner: generating all scenes in one call...");

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { temperature: 0.5, maxTokens: 16384 });

  // Parse JSON response
  var plan: FreeformLLMOutput;
  try {
    plan = JSON.parse(stripJsonFences(raw));
  } catch (e) {
    throw new Error(`Freeform planner returned invalid JSON: ${raw.substring(0, 500)}`);
  }

  if (!plan.scenes || plan.scenes.length === 0) {
    throw new Error("Freeform planner returned no scenes");
  }

  console.log(`  Freeform planner: ${plan.scenes.length} scenes generated`);

  // Create the project
  var project = await createProject({
    tenant_id: "", // caller fills in
    name: plan.name || "Untitled Project",
    format: opts.format,
  });

  project.brand_kit = opts.brandKit;
  project.canvas = opts.canvas;

  // Build scenes and save HTML sources to project directory
  var scenes: Scene[] = [];
  var htmlSources: string[] = [];

  for (var i = 0; i < plan.scenes.length; i++) {
    var scenePlan = plan.scenes[i];
    var sceneId = `scene_${String(i + 1).padStart(3, "0")}`;
    var componentType = sceneId; // component type matches the scene file name

    // Validate and clean the HTML
    var html = scenePlan.html;
    if (!html || html.trim().length === 0) {
      console.warn(`  Scene ${i + 1} has empty HTML, skipping`);
      continue;
    }

    htmlSources.push(html);

    var scene: Scene = {
      id: sceneId,
      label: scenePlan.label || `Scene ${i + 1}`,
      duration_seconds: scenePlan.duration_seconds || 4,
      components: [
        {
          id: `comp_full`,
          type: componentType,
          data: {},
          z_index: 0,
        },
      ],
    };

    if (scenePlan.transition_in) {
      scene.transition_in = {
        type: scenePlan.transition_in.type as SceneTransition["type"],
        duration_seconds: scenePlan.transition_in.duration_seconds,
      };
    }

    scenes.push(scene);
  }

  project.scenes = scenes;

  return { project, sceneHtmlSources: htmlSources };
}

/**
 * Save freeform scene HTML sources to the project's local component directory.
 * Returns the directory path where components were saved.
 */
export async function saveFreeformComponents(
  tenantId: string,
  projectId: string,
  scenes: Scene[],
  htmlSources: string[],
): Promise<string> {
  var componentsDir = path.join(
    projectDir(tenantId, projectId),
    "components",
  );
  await fs.mkdir(componentsDir, { recursive: true });

  for (var i = 0; i < scenes.length; i++) {
    var scene = scenes[i];
    var componentType = scene.components[0]?.type;
    if (!componentType || !htmlSources[i]) continue;

    var filePath = path.join(componentsDir, `${componentType}.component.html`);
    await fs.writeFile(filePath, htmlSources[i]);
    console.log(`  Saved freeform component: ${filePath}`);
  }

  return componentsDir;
}

function stripJsonFences(raw: string): string {
  var trimmed = raw.trim();
  // Strip leading ```json and trailing ```
  if (trimmed.startsWith('```')) {
    // Remove first line (```json or ```)
    var firstNewline = trimmed.indexOf('\n');
    if (firstNewline > -1) trimmed = trimmed.substring(firstNewline + 1);
    // Remove trailing ```
    var lastFence = trimmed.lastIndexOf('```');
    if (lastFence > -1) trimmed = trimmed.substring(0, lastFence);
    return trimmed.trim();
  }
  return trimmed;
}
