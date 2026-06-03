/**
 * Image Enrichment
 *
 * Pipeline-level step that scans a project's scenes and generates AI hero
 * images where needed. Works for any project regardless of how it was planned
 * Handles hero image generation for any pipeline target.
 * since HTML references them during generation.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { generateImage } from "../media/image-gen.js";
import { projectDir } from "../persistence/paths.js";
import { saveProject } from "../persistence/project.js";
import type { Project, Asset } from "../core/types.js";
import type { LLMConfig } from "./client.js";
import { callLLM } from "./client.js";

export interface ImageEnrichmentOpts {
  project: Project;
  llmConfig: LLMConfig;
  generateImages?: boolean;
}

/**
 * Scan a project's scenes and generate AI images where needed.
 * Works for any project regardless of how it was planned.
 *
 * Asks the LLM which scenes would benefit from a hero image, generates them,
 * and wires the results into the scene components + project assets.
 */
export async function enrichProjectWithImages(opts: ImageEnrichmentOpts): Promise<Project> {
  if (opts.generateImages === false || !process.env.OPENAI_API_KEY) {
    return opts.project;
  }

  const project = opts.project;

  // Skip if project already has AI-generated images
  const existingAiImages = project.assets?.filter(a => a.type === "ai_image") || [];
  if (existingAiImages.length > 0) {
    console.log(`  Image enrichment: skipping (${existingAiImages.length} AI images already exist)`);
    return project;
  }

  const tenantId = project.tenant_id;
  const projectId = project.project_id;

  console.log("  Image enrichment: scanning scenes...");

  // Build scene summaries for the LLM
  const sceneSummaries = project.scenes.map((s, i) => {
    const compTypes = s.components?.map(c => c.type).join(", ") || "none";
    const hasImageComp = s.components?.some(c =>
      c.type === "image-showcase" ||
      c.data?.src ||
      c.data?.image_url ||
      c.data?.screenshot_url ||
      c.data?.video_url
    );
    return `Scene ${i + 1}: "${s.label}" (${s.duration_seconds}s) - components: [${compTypes}] - has image: ${hasImageComp}`;
  }).join("\n");

  const decisionPrompt = `You are evaluating scenes in a ${project.format} project to decide which need AI-generated hero images.

Project: "${project.name}"
Scenes:
${sceneSummaries}

For each scene, respond with JSON (no fences):
{
  "scenes": [
    { "index": 0, "needs_image": true, "image_prompt": "A detailed DALL-E prompt..." },
    { "index": 1, "needs_image": false }
  ]
}

Rules:
- Only generate images for scenes that would DRAMATICALLY benefit from a real visual
- Scenes that already have image components (image-showcase, screenshot_url, video_url) do NOT need one
- Good candidates: hero/intro scenes, product visuals, abstract art, dramatic photographs
- Bad candidates: text-only slides, stat cards, code demos, CTA cards, terminal demos
- Image prompts should describe the IMAGE itself, not the scene layout
- Be selective: usually only 1-2 scenes in a project need generated images
- For presentations: hero image for the title slide is good
- Output ONLY JSON`;

  let imageDecisions: Array<{ index: number; needs_image: boolean; image_prompt?: string }> = [];

  try {
    const raw = await callLLM(opts.llmConfig, [
      { role: "user", content: decisionPrompt }
    ], { temperature: 0.3, maxTokens: 2048 });

    const trimmed = raw.trim().replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(trimmed);
    imageDecisions = parsed.scenes || [];
  } catch (e) {
    console.warn("  Image enrichment: failed to get decisions, skipping", (e as Error).message);
    return project;
  }

  const needsImages = imageDecisions.filter(d => d.needs_image && d.image_prompt);
  if (needsImages.length === 0) {
    console.log("  Image enrichment: no scenes need images");
    return project;
  }

  console.log(`  Image enrichment: generating ${needsImages.length} image(s)...`);
  const assetsDir = path.join(projectDir(tenantId, projectId), "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  if (!project.assets) project.assets = [];

  // Generate images in parallel
  const results = await Promise.allSettled(
    needsImages.map(async (decision) => {
      const imgPath = path.join(assetsDir, `hero_scene_${decision.index + 1}.png`);
      console.log(`    Scene ${decision.index + 1}: "${decision.image_prompt!.substring(0, 60)}..."`);
      const result = await generateImage({
        prompt: decision.image_prompt!,
        size: "1536x1024",
        quality: "high",
        outputPath: imgPath,
      });
      return { index: decision.index, result, prompt: decision.image_prompt! };
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      const { index, result: imgResult, prompt: imgPrompt } = r.value;
      const scene = project.scenes[index];

      // Register asset
      project.assets.push({
        id: `asset_hero_${index + 1}`,
        type: "ai_image",
        path: imgResult.path,
        name: `Hero image: ${scene?.label || "scene " + (index + 1)}`,
        prompt: imgPrompt,
        width: imgResult.width,
        height: imgResult.height,
        model: "gpt-image-1",
        scene_id: scene?.id,
        created_at: new Date().toISOString(),
      });

      // Build HTTP URL for the image
      const imgFilename = path.basename(imgResult.path);
      const imgUrl = `http://localhost:3200/assets/${tenantId}/projects/${projectId}/assets/${imgFilename}`;

      // If scene has image-showcase component, set its src; otherwise add one
      if (scene) {
        const imageComp = scene.components?.find(c => c.type === "image-showcase");
        if (imageComp) {
          imageComp.data = { ...imageComp.data, src: imgUrl };
        } else {
          scene.components = scene.components || [];
          scene.components.unshift({
            id: `comp_hero_img_${index}`,
            type: "image-showcase",
            data: { src: imgUrl, effect: "ken-burns" },
            z_index: 1,
          });
        }
      }

      console.log(`    Scene ${index + 1}: saved (${imgResult.width}x${imgResult.height})`);
    } else {
      console.warn(`    Scene image failed: ${(r.reason as Error)?.message || r.reason}`);
    }
  }

  // Save updated project
  await saveProject(project);
  return project;
}
