/**
 * Freeform Planner (Two-Pass)
 *
 * Pass 1: LLM plans the storyboard (JSON: scene labels, durations, transitions, descriptions)
 * Pass 2: For each scene, LLM writes the full HTML+CSS+GSAP (raw text, no JSON escaping)
 *
 * This avoids the HTML-inside-JSON escaping nightmare.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { callLLM, type LLMConfig } from "./client.js";
import { freeformPlannerSystemPrompt, freeformSceneSystemPrompt } from "./prompts.js";
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
  tenantId?: string;
}

export interface FreeformResult {
  project: Project;
  sceneHtmlSources: string[];
}

interface StoryboardScene {
  label: string;
  duration_seconds: number;
  transition_in?: { type: string; duration_seconds: number };
  description: string;  // detailed visual description for pass 2
}

export async function planFreeform(opts: FreeformPlannerOpts): Promise<FreeformResult> {
  // ── Pass 1: Plan the storyboard ──
  console.log("  Pass 1: Planning storyboard...");

  var storyboardPrompt = `You are planning a cinematic ${opts.format} project. Output a JSON storyboard.

## Output Format (valid JSON, no markdown fences)
{
  "name": "Project Title",
  "scenes": [
    {
      "label": "Scene 1 - Hero",
      "duration_seconds": 4,
      "transition_in": { "type": "crossfade", "duration_seconds": 0.5 },
      "description": "Detailed visual description of what this scene should look like and how it should animate. Be VERY specific about typography, layout, colors, animation techniques to use (SplitText, ScrambleText, particles, etc)."
    }
  ]
}

## Rules
- ${opts.sceneCount ? opts.sceneCount + ' scenes' : '5-8 scenes'}
- First scene: no transition or "none"
- Valid transitions: crossfade, blur-crossfade, wipe-left, wipe-right, slide-up, slide-down, iris, morph-wipe, zoom-through, glitch-cut, scale-rotate, curtain
- Each description should be 2-4 sentences with SPECIFIC visual direction
- Think Apple keynote: one idea per scene, cinematic motion, premium aesthetic
- VARY scene types across the video -- don't repeat the same layout:
  * Hero text reveal (huge typography, SplitText animation)
  * Product mockup (browser frame or device with realistic UI)
  * Single giant stat (one number at 160px, counting up)
  * Visual metaphor (abstract shapes, SVG animation, particles)
  * Feature grid (3 items with SVG icons, glass cards)
  * CTA (bold headline + glowing button)
- Never have two text-on-gradient scenes in a row
- At least one scene should be a product demo with realistic UI content
- At least one scene should have a single dominant number/stat
- Output ONLY JSON, no commentary

## Brief
${opts.prompt}`;

  var storyboardRaw = await callLLM(opts.llmConfig, [
    { role: "user", content: storyboardPrompt },
  ], { temperature: 0.5, maxTokens: 4096 });

  var storyboard = parseJsonResponse(storyboardRaw);
  if (!storyboard.scenes || storyboard.scenes.length === 0) {
    throw new Error("Storyboard returned no scenes");
  }
  console.log(`  Storyboard: ${storyboard.scenes.length} scenes planned`);

  // ── Pass 2: Generate HTML for each scene ──
  var sceneSystemPrompt = freeformSceneSystemPrompt(opts.format, opts.canvas, opts.brandKit);
  var sceneHtmlSources: string[] = [];

  for (var i = 0; i < storyboard.scenes.length; i++) {
    var sceneInfo = storyboard.scenes[i] as StoryboardScene;
    console.log(`  Pass 2: Generating scene ${i + 1}/${storyboard.scenes.length}: "${sceneInfo.label}"...`);

    var scenePrompt = `Generate the HTML for this scene:

Label: ${sceneInfo.label}
Duration: ${sceneInfo.duration_seconds} seconds
Description: ${sceneInfo.description}

Overall project: ${opts.prompt}
Scene ${i + 1} of ${storyboard.scenes.length}.

Output ONLY the .component.html source. No JSON wrapping, no markdown fences.
Start with <template> and end with </script>.`;

    var sceneHtml = await callLLM(opts.llmConfig, [
      { role: "system", content: sceneSystemPrompt },
      { role: "user", content: scenePrompt },
    ], { temperature: 0.5, maxTokens: 8192 });

    // Strip any markdown fences
    sceneHtml = stripHtmlFences(sceneHtml);
    sceneHtmlSources.push(sceneHtml);
  }

  // ── Build the project ──
  var projectId = `proj_${uuid().replace(/-/g, "").slice(0, 8)}`;
  var tenantId = opts.tenantId || "freeform";

  // Save scene HTML files
  var compDir = path.join(projectDir(tenantId, projectId), "components");
  await fs.mkdir(compDir, { recursive: true });

  var scenes: Scene[] = [];
  for (var i = 0; i < storyboard.scenes.length; i++) {
    var sceneInfo = storyboard.scenes[i] as StoryboardScene;
    var compName = `scene_${String(i + 1).padStart(3, "0")}`;
    var compPath = path.join(compDir, `${compName}.component.html`);
    await fs.writeFile(compPath, sceneHtmlSources[i]);
    console.log(`  Saved: ${compPath}`);

    var transition: SceneTransition | undefined;
    if (sceneInfo.transition_in && sceneInfo.transition_in.type !== "none") {
      transition = {
        type: sceneInfo.transition_in.type as any,
        duration_seconds: sceneInfo.transition_in.duration_seconds || 0.5,
      };
    }

    scenes.push({
      id: `scene_${String(i + 1).padStart(3, "0")}`,
      label: sceneInfo.label,
      duration_seconds: sceneInfo.duration_seconds,
      transition_in: transition,
      components: [{
        id: `comp_full_${i}`,
        type: compName,
        data: {},
        z_index: 0,
      }],
    });
  }

  var project: Project = {
    project_id: projectId,
    tenant_id: tenantId,
    name: storyboard.name || "Freeform Project",
    format: opts.format,
    status: "draft",
    canvas: opts.canvas,
    brand_kit: opts.brandKit,
    scenes,
  };

  await saveProject(project);

  console.log(`  Freeform components saved: ${sceneHtmlSources.map((_, i) => `scene_${String(i + 1).padStart(3, "0")}.component.html`).join(", ")}`);

  return { project, sceneHtmlSources };
}

function parseJsonResponse(raw: string): any {
  var trimmed = raw.trim();

  // Strip markdown fences
  if (trimmed.startsWith('```')) {
    var firstNewline = trimmed.indexOf('\n');
    if (firstNewline > -1) trimmed = trimmed.substring(firstNewline + 1);
    var lastFence = trimmed.lastIndexOf('```');
    if (lastFence > -1) trimmed = trimmed.substring(0, lastFence);
    trimmed = trimmed.trim();
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Find first { and last }
    var first = trimmed.indexOf('{');
    var last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.substring(first, last + 1));
    }
    throw new Error(`Invalid JSON: ${trimmed.substring(0, 300)}`);
  }
}

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
