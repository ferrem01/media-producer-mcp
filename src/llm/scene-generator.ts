/**
 * Unified Scene Generator
 *
 * Handles both library and custom scenes from the unified planner.
 * - Library scenes: builds Scene object directly from planned components (no LLM call).
 * - Custom scenes: calls LLM with the custom_prompt to generate .component.html.
 */

import { callLLM, type LLMConfig } from "./client.js";
import { freeformSceneSystemPrompt } from "./prompts.js";
import type { PlannedScene } from "./unified-planner.js";
import type { BrandKit, Canvas, OutputFormat, Scene, SceneComponent, SceneTransition } from "../core/types.js";

// ── Types ──

export interface SceneGeneratorOpts {
  scene: PlannedScene;
  sceneIndex: number;
  totalScenes: number;
  prompt: string;           // original project prompt
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  imageUrl?: string;        // from media enrichment
  tenantId: string;
  projectId: string;
}

export interface GeneratedScene {
  scene: Scene;
  customComponentSource?: string;  // if custom, the .component.html source
}

/**
 * Generate a single scene, either from library components or via custom LLM generation.
 */
export async function generateScene(opts: SceneGeneratorOpts): Promise<GeneratedScene> {
  var planned = opts.scene;

  // Build transition
  var transition: SceneTransition | undefined;
  if (planned.transition_in && planned.transition_in.type !== "none") {
    transition = {
      type: planned.transition_in.type as SceneTransition["type"],
      duration_seconds: planned.transition_in.duration_seconds || 0.5,
    };
  }

  var sceneId = `scene_${String(opts.sceneIndex + 1).padStart(3, "0")}`;

  if (planned.approach === "library") {
    return generateLibraryScene(planned, sceneId, transition, opts);
  } else {
    return generateCustomScene(planned, sceneId, transition, opts);
  }
}

// ── Library Scene ──

function generateLibraryScene(
  planned: PlannedScene,
  sceneId: string,
  transition: SceneTransition | undefined,
  opts: SceneGeneratorOpts,
): GeneratedScene {
  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (library)`);

  var components: SceneComponent[] = (planned.components || []).map((c, idx) => ({
    id: `comp_${idx + 1}`,
    type: c.type,
    data: c.data || {},
    z_index: c.z_index ?? (idx + 1) * 10,
    position: c.position,
  }));

  // If an image was generated for this scene, wire it into an image-showcase component
  if (opts.imageUrl) {
    var hasImageComp = components.some(c =>
      c.type === "image-showcase" || c.data?.src || c.data?.image_url
    );
    if (hasImageComp) {
      // Update existing image component
      var imgComp = components.find(c => c.type === "image-showcase");
      if (imgComp) {
        imgComp.data = { ...imgComp.data, src: opts.imageUrl };
      }
    } else {
      // Add image-showcase component
      components.unshift({
        id: `comp_hero_img_${opts.sceneIndex}`,
        type: "image-showcase",
        data: { src: opts.imageUrl, effect: "ken-burns" },
        z_index: 1,
      });
    }
  }

  var scene: Scene = {
    id: sceneId,
    label: planned.label,
    duration_seconds: planned.duration_seconds || 5,
    transition_in: transition,
    components,
  };

  return { scene };
}

// ── Custom Scene ──

async function generateCustomScene(
  planned: PlannedScene,
  sceneId: string,
  transition: SceneTransition | undefined,
  opts: SceneGeneratorOpts,
): Promise<GeneratedScene> {
  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (custom)`);

  var sceneSystemPrompt = freeformSceneSystemPrompt(opts.format, opts.canvas, opts.brandKit);

  var imageContext = "";
  if (opts.imageUrl) {
    imageContext = `\n\nA hero image has been generated for this scene. Use it as the main visual.\nImage URL: ${opts.imageUrl}\nUse an <img> tag with this URL as src. Style it to fill the scene or use as a dramatic background.\nExample: <img src='${opts.imageUrl}' style='width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0'>\nLayer your text/UI ON TOP with z-index and text-shadow for readability.`;
  }

  var scenePrompt = `Generate the HTML for this scene:

Label: ${planned.label}
Duration: ${planned.duration_seconds} seconds
Visual Direction: ${planned.custom_prompt || planned.description}
${imageContext}

Overall project: ${opts.prompt}
Scene ${opts.sceneIndex + 1} of ${opts.totalScenes}.

Output ONLY the .component.html source. No JSON wrapping, no markdown fences.
Start with <template> and end with </script>.`;

  var sceneHtml = await callLLM(opts.llmConfig, [
    { role: "system", content: sceneSystemPrompt },
    { role: "user", content: scenePrompt },
  ], { temperature: 0.5, maxTokens: 8192 });

  sceneHtml = stripHtmlFences(sceneHtml);

  var compName = `scene_${String(opts.sceneIndex + 1).padStart(3, "0")}`;

  var scene: Scene = {
    id: sceneId,
    label: planned.label,
    duration_seconds: planned.duration_seconds || 5,
    transition_in: transition,
    components: [{
      id: `comp_full_${opts.sceneIndex}`,
      type: compName,
      data: {},
      z_index: 0,
    }],
  };

  return { scene, customComponentSource: sceneHtml };
}

// ── Helpers ──

function stripHtmlFences(raw: string): string {
  var trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    var firstNewline = trimmed.indexOf('\n');
    if (firstNewline > -1) trimmed = trimmed.substring(firstNewline + 1);
    var lastFence = trimmed.lastIndexOf('```');
    if (lastFence > -1) trimmed = trimmed.substring(0, lastFence);
    trimmed = trimmed.trim();
  }
  return trimmed;
}
