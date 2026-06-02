/**
 * Unified Scene Generator
 *
 * Handles mixed library and custom components within each scene.
 * - Library components: added to Scene directly (no LLM call).
 * - Custom components: each gets its own LLM call to generate .component.html.
 */

import { callLLM, type LLMConfig } from "./client.js";
import { freeformSceneSystemPrompt } from "./prompts.js";
import type { PlannedScene, PlannedComponent } from "./unified-planner.js";
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
  customSources?: Map<string, string>;  // compName -> HTML source (multiple custom components per scene)
}

/**
 * Generate a single scene with mixed library and custom components.
 */
export async function generateScene(opts: SceneGeneratorOpts): Promise<GeneratedScene> {
  var planned = opts.scene;
  var sceneId = `scene_${String(opts.sceneIndex + 1).padStart(3, "0")}`;
  var sceneComponents: SceneComponent[] = [];
  var customSources: Map<string, string> = new Map();

  // Build transition
  var transition: SceneTransition | undefined;
  if (planned.transition_in && planned.transition_in.type !== "none") {
    transition = {
      type: planned.transition_in.type as SceneTransition["type"],
      duration_seconds: planned.transition_in.duration_seconds || 0.5,
    };
  }

  var libraryCount = 0;
  var customCount = 0;

  for (var ci = 0; ci < planned.components.length; ci++) {
    var comp = planned.components[ci];

    if (comp.custom) {
      // Generate custom component via LLM
      customCount++;
      var compName = `custom_${sceneId}_${ci}`;
      var html = await generateCustomComponent({
        customPrompt: comp.custom_prompt || planned.description,
        sceneLabel: planned.label,
        sceneIndex: opts.sceneIndex,
        totalScenes: opts.totalScenes,
        prompt: opts.prompt,
        format: opts.format,
        llmConfig: opts.llmConfig,
        brandKit: opts.brandKit,
        canvas: opts.canvas,
        imageUrl: opts.imageUrl,
        duration: planned.duration_seconds,
      });
      customSources.set(compName, html);
      sceneComponents.push({
        id: `comp_${ci}`,
        type: compName,
        data: {},
        z_index: comp.z_index ?? (ci + 1) * 10,
        position: comp.position,
      });
    } else {
      // Library component - use directly
      libraryCount++;
      sceneComponents.push({
        id: `comp_${ci}`,
        type: comp.type!,
        data: comp.data || {},
        z_index: comp.z_index ?? (ci + 1) * 10,
        position: comp.position,
      });
    }
  }

  // Wire image into appropriate component if available
  if (opts.imageUrl) {
    var imgComp = sceneComponents.find(c => c.type === "image-showcase");
    if (imgComp) {
      imgComp.data = { ...imgComp.data, src: opts.imageUrl };
    }
  }

  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (${libraryCount} library, ${customCount} custom)`);

  var scene: Scene = {
    id: sceneId,
    label: planned.label,
    duration_seconds: planned.duration_seconds || 5,
    transition_in: transition,
    components: sceneComponents,
  };

  return { scene, customSources: customSources.size > 0 ? customSources : undefined };
}

// ── Custom Component Generation ──

interface CustomComponentOpts {
  customPrompt: string;
  sceneLabel: string;
  sceneIndex: number;
  totalScenes: number;
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  imageUrl?: string;
  duration: number;
}

async function generateCustomComponent(opts: CustomComponentOpts): Promise<string> {
  var sceneSystemPrompt = freeformSceneSystemPrompt(opts.format, opts.canvas, opts.brandKit);

  var imageContext = "";
  if (opts.imageUrl) {
    imageContext = `\n\nA hero image has been generated for this scene. Use it as the main visual.\nImage URL: ${opts.imageUrl}\nUse an <img> tag with this URL as src. Style it to fill the scene or use as a dramatic background.\nExample: <img src='${opts.imageUrl}' style='width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0'>\nLayer your text/UI ON TOP with z-index and text-shadow for readability.`;
  }

  var scenePrompt = `Generate the HTML for this component:

Scene: ${opts.sceneLabel}
Duration: ${opts.duration} seconds
Visual Direction: ${opts.customPrompt}
${imageContext}

Overall project: ${opts.prompt}
Scene ${opts.sceneIndex + 1} of ${opts.totalScenes}.

Output ONLY the .component.html source. No JSON wrapping, no markdown fences.
Start with <template> and end with </script>.`;

  var sceneHtml = await callLLM(opts.llmConfig, [
    { role: "system", content: sceneSystemPrompt },
    { role: "user", content: scenePrompt },
  ], { temperature: 0.5, maxTokens: 8192 });

  return stripHtmlFences(sceneHtml);
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
