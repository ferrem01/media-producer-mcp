/**
 * Scene Planner
 *
 * Plans a single scene: picks components from the library, fills in data,
 * and optionally generates custom components when nothing fits.
 */

import { callLLM, type LLMConfig } from "./client.js";
import { scenePlannerSystemPrompt } from "./prompts.js";
import { generateComponentLLM } from "./component-gen.js";
import { formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import type { BrandKit, Canvas, Scene, SceneComponent, SceneTransition } from "../core/types.js";
import { v4 as uuid } from "uuid";

export interface PlanSceneOpts {
  prompt: string;
  llmConfig: LLMConfig;
  componentCatalog: ComponentCatalogEntry[];
  brandKit: BrandKit;
  canvas: Canvas;
  duration?: number;
  format?: string;
}

interface ScenePlannerOutput {
  label?: string;
  duration_seconds: number;
  background?: string;
  components: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    z_index?: number;
    position?: {
      x: number | string;
      y: number | string;
      width?: number | string;
      height?: number | string;
    };
  }>;
  custom_components_needed?: Array<{
    description: string;
    suggested_type: string;
  }>;
}

/**
 * Plan a single scene using the LLM.
 * Returns a fully populated Scene with components from the library
 * and any custom-generated components.
 */
export async function planScene(opts: PlanSceneOpts): Promise<{
  scene: Scene;
  customComponents: Array<{ type: string; source: string }>;
}> {
  var catalogStr = formatCatalogForPrompt(opts.componentCatalog);
  var systemPrompt = scenePlannerSystemPrompt(catalogStr);

  var userPrompt = opts.prompt;
  if (opts.duration) {
    userPrompt += `\n\nTarget duration: ${opts.duration} seconds.`;
  }

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { temperature: 0.5 });

  // Parse JSON response
  var plan: ScenePlannerOutput;
  try {
    plan = JSON.parse(stripJsonFences(raw));
  } catch (e) {
    throw new Error(`Scene planner returned invalid JSON: ${raw.substring(0, 200)}`);
  }

  // Generate custom components if needed
  var customComponents: Array<{ type: string; source: string }> = [];

  if (plan.custom_components_needed && plan.custom_components_needed.length > 0) {
    for (var custom of plan.custom_components_needed) {
      var result = await generateComponentLLM({
        prompt: custom.description,
        llmConfig: opts.llmConfig,
        brandKit: opts.brandKit,
        duration: plan.duration_seconds,
        format: opts.format,
      });

      customComponents.push({
        type: custom.suggested_type || result.type,
        source: result.source,
      });

      // Add the custom component to the scene's component list if not already there
      var hasIt = plan.components.some((c) => c.type === custom.suggested_type);
      if (!hasIt) {
        plan.components.push({
          id: `comp_custom_${customComponents.length}`,
          type: custom.suggested_type || result.type,
          data: {},
          z_index: (plan.components.length + 1) * 10,
        });
      }
    }
  }

  // Build the Scene object
  var sceneId = `scene_${uuid().substring(0, 8)}`;
  var scene: Scene = {
    id: sceneId,
    label: plan.label,
    duration_seconds: plan.duration_seconds || opts.duration || 5,
    background: plan.background,
    components: plan.components.map((c): SceneComponent => ({
      id: c.id,
      type: c.type,
      data: c.data || {},
      z_index: c.z_index,
      position: c.position,
    })),
  };

  return { scene, customComponents };
}

function stripJsonFences(raw: string): string {
  var trimmed = raw.trim();
  // Remove ```json ... ``` or ``` ... ```
  var match = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (match) return match[1].trim();
  return trimmed;
}
