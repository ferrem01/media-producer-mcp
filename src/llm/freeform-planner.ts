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
import type { BrandKit, Canvas, OutputFormat, Project, Scene, SceneTransition, Asset } from "../core/types.js";
import { generateImage } from "../media/image-gen.js";

export interface FreeformPlannerOpts {
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  sceneCount?: number;
  tenantId?: string;
  generateImages?: boolean;
}

export interface FreeformResult {
  project: Project;
  sceneHtmlSources: string[];
}

interface StoryboardScene {
  label: string;
  duration_seconds: number;
  transition_in?: { type: string; duration_seconds: number };
  description: string;
  hero_image?: string;  // DALL-E prompt for AI-generated hero image
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
      "description": "Detailed visual description of what this scene should look like and how it should animate. Be VERY specific about typography, layout, colors, animation techniques to use (SplitText, ScrambleText, particles, etc).",
      "hero_image": "(OPTIONAL) A detailed DALL-E image prompt if this scene would benefit from an AI-generated visual. Describe the IMAGE, not the scene layout."
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
- OPTIONAL: Include "hero_image" with a DALL-E prompt if the scene would benefit from an AI-generated image
  * Use for: hero visuals, product illustrations, abstract art, dramatic photographs
  * Do NOT use for: text-only scenes, stat cards, code demos, pure UI mockups
  * hero_image prompts should describe the IMAGE itself, not the scene layout
  * Example: "A futuristic holographic marketing dashboard floating in a dark room, purple and blue neon lighting, cinematic depth of field"
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

  // ── Pass 1.5: Generate hero images (if enabled) ──
  var canGenerateImages = opts.generateImages !== false && !!process.env.OPENAI_API_KEY;
  var heroImages: Map<number, { path: string; width: number; height: number }> = new Map();
  var projectId = `proj_${uuid().replace(/-/g, "").slice(0, 8)}`;
  var tenantId = opts.tenantId || "freeform";
  var projectAssets: Asset[] = [];

  if (canGenerateImages) {
    var imagePromises: Array<{ index: number; prompt: string }> = [];
    for (var si = 0; si < storyboard.scenes.length; si++) {
      var sceneData = storyboard.scenes[si] as StoryboardScene;
      if (sceneData.hero_image) {
        imagePromises.push({ index: si, prompt: sceneData.hero_image });
      }
    }

    if (imagePromises.length > 0) {
      console.log(`  Pass 1.5: Generating ${imagePromises.length} hero image(s)...`);
      var assetsDir = path.join(projectDir(tenantId, projectId), "assets");
      await fs.mkdir(assetsDir, { recursive: true });

      var results = await Promise.allSettled(
        imagePromises.map(async (item) => {
          var imgPath = path.join(assetsDir, `hero_scene_${item.index + 1}.png`);
          console.log(`    Scene ${item.index + 1}: "${item.prompt.substring(0, 60)}..."`);
          var result = await generateImage({
            prompt: item.prompt,
            size: "1536x1024",
            quality: "high",
            outputPath: imgPath,
          });
          return { index: item.index, result };
        })
      );

      for (var r of results) {
        if (r.status === "fulfilled") {
          var { index: idx, result: imgResult } = r.value;
          heroImages.set(idx, { path: imgResult.path, width: imgResult.width, height: imgResult.height });
          projectAssets.push({
            id: `asset_hero_${idx + 1}`,
            type: "ai_image",
            path: imgResult.path,
            name: `Hero image: scene ${idx + 1}`,
            prompt: (storyboard.scenes[idx] as StoryboardScene).hero_image,
            width: imgResult.width,
            height: imgResult.height,
            model: "gpt-image-1",
            scene_id: `scene_${String(idx + 1).padStart(3, "0")}`,
            created_at: new Date().toISOString(),
          });
          console.log(`    Scene ${idx + 1}: saved (${imgResult.width}x${imgResult.height})`);
        } else {
          console.warn(`    Scene ${(r as any).reason?.index || "?"}: FAILED - ${(r.reason as Error)?.message || r.reason}`);
        }
      }
    }
  }

  // ── Pass 2: Generate HTML for each scene ──
  var sceneSystemPrompt = freeformSceneSystemPrompt(opts.format, opts.canvas, opts.brandKit);
  var sceneHtmlSources: string[] = [];

  for (var i = 0; i < storyboard.scenes.length; i++) {
    var sceneInfo = storyboard.scenes[i] as StoryboardScene;
    console.log(`  Pass 2: Generating scene ${i + 1}/${storyboard.scenes.length}: "${sceneInfo.label}"...`);

    var imageContext = "";
    if (heroImages.has(i)) {
      var heroImg = heroImages.get(i)!;
      // Serve via HTTP so Playwright can load it (file:// and data URIs have issues)
      var imgFilename = path.basename(heroImg.path);
      var imgUrl = `http://localhost:3200/assets/${tenantId}/projects/${projectId}/assets/${imgFilename}`;
      imageContext = `\n\nA hero image has been generated for this scene. Use it as the main visual.\nImage URL: ${imgUrl}\nDimensions: ${heroImg.width}x${heroImg.height}\nUse an <img> tag with this URL as src. Style it to fill the scene or use as a dramatic background.\nExample: <img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0">\nLayer your text/UI ON TOP with z-index and text-shadow for readability.`;
    }

    var scenePrompt = `Generate the HTML for this scene:

Label: ${sceneInfo.label}
Duration: ${sceneInfo.duration_seconds} seconds
Description: ${sceneInfo.description}
${imageContext}

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
  // projectId and tenantId already set in Pass 1.5

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
    assets: projectAssets.length > 0 ? projectAssets : undefined,
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
