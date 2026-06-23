/**
 * Media Enrichment
 *
 * Single pipeline-level step that generates ALL media assets (images, future: video, music)
 * for any project type. Replaces inline image gen and the
 * separate image-enrichment module.
 *
 * Freeform path: reads hero_image hints directly from the storyboard.
 * Structured path: asks LLM to evaluate scenes and decide which need images.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { generateImage } from "../media/image-gen.js";
import { projectDir } from "../persistence/paths.js";
import type { Project, Asset } from "../core/types.js";
import type { LLMConfig } from "./client.js";
import { callLLM } from "./client.js";

export interface MediaEnrichmentOpts {
  project?: Project;
  storyboard?: any;           // storyboard with hero_image fields
  tenantId: string;
  projectId: string;
  llmConfig: LLMConfig;
  generateImages?: boolean;
}

export interface MediaEnrichmentResult {
  project?: Project;          // updated with assets (if provided)
  imageUrls: Map<number, string>;  // scene index -> HTTP URL
  assets: Asset[];            // all generated assets
}

/**
 * Enrich a project with generated media.
 *
 * Pass storyboard with hero_image fields. No project needed yet.
 * For structured: pass a project. LLM evaluates which scenes need images.
 */
export async function enrichProjectMedia(opts: MediaEnrichmentOpts): Promise<MediaEnrichmentResult> {
  var imageUrls = new Map<number, string>();
  var generatedAssets: Asset[] = [];

  if (opts.generateImages === false || !process.env.OPENAI_API_KEY) {
    return { project: opts.project, imageUrls, assets: [] };
  }

  var tenantId = opts.tenantId;
  var projectId = opts.projectId;

  // Determine which scenes need images
  var imageRequests: Array<{ index: number; prompt: string }> = [];

  if (opts.storyboard) {
    // ── Freeform path: read hero_image hints from storyboard ──
    for (var si = 0; si < opts.storyboard.scenes.length; si++) {
      var scene = opts.storyboard.scenes[si];
      if (scene.hero_image) {
        imageRequests.push({ index: si, prompt: scene.hero_image });
      }
    }
  } else if (opts.project) {
    // ── Structured path: check existing assets, ask LLM to decide ──
    var existingAiImages = opts.project.assets?.filter(a => a.type === "ai_image") || [];
    if (existingAiImages.length > 0) {
      console.log(`  Media enrichment: skipping (${existingAiImages.length} AI images already exist)`);
      return { project: opts.project, imageUrls, assets: [] };
    }

    var sceneSummaries = opts.project.scenes.map((s, i) => {
      var compTypes = s.components?.map(c => c.type).join(", ") || "none";
      var hasImageComp = s.components?.some(c =>
        c.type === "image-showcase" ||
        c.data?.src ||
        c.data?.image_url ||
        c.data?.screenshot_url ||
        c.data?.video_url
      );
      return `Scene ${i + 1}: "${s.label}" (${s.duration_seconds}s) - components: [${compTypes}] - has image: ${hasImageComp}`;
    }).join("\n");

    var decisionPrompt = `You are evaluating scenes in a ${opts.project.format} project to decide which need AI-generated hero images.

Project: "${opts.project.name}"
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

    try {
      var raw = await callLLM(opts.llmConfig, [
        { role: "user", content: decisionPrompt }
      ], { temperature: 0.3, maxTokens: 2048 });

      var trimmed = raw.trim().replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      var parsed = JSON.parse(trimmed);
      var decisions: Array<{ index: number; needs_image: boolean; image_prompt?: string }> = parsed.scenes || [];
      imageRequests = decisions.filter(d => d.needs_image && d.image_prompt).map(d => ({
        index: d.index,
        prompt: d.image_prompt!,
      }));
    } catch (e) {
      console.warn("  Media enrichment: failed to get LLM decisions, skipping", (e as Error).message);
      return { project: opts.project, imageUrls, assets: [] };
    }
  }

  if (imageRequests.length === 0) {
    console.log("  Media enrichment: no scenes need images");
    return { project: opts.project, imageUrls, assets: [] };
  }

  console.log(`  Media enrichment: generating ${imageRequests.length} image(s)...`);
  var assetsDir = path.join(projectDir(tenantId, projectId), "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  // Generate images in parallel
  var results = await Promise.allSettled(
    imageRequests.map(async (item) => {
      var imgPath = path.join(assetsDir, `hero_scene_${item.index + 1}.png`);
      console.log(`    Scene ${item.index + 1}: "${item.prompt.substring(0, 60)}..."`);
      var size = "1536x1024", quality = "high";
      var result = await generateImage({
        prompt: item.prompt,
        size: size as any,
        quality: quality as any,
        outputPath: imgPath,
      });
      return { index: item.index, result, prompt: item.prompt, size, quality };
    })
  );

  for (var r of results) {
    if (r.status === "fulfilled") {
      var { index: idx, result: imgResult, prompt: imgPrompt, size: imgSize, quality: imgQuality } = r.value;
      var imgFilename = path.basename(imgResult.path);
      var imgUrl = `/assets/${tenantId}/projects/${projectId}/assets/${imgFilename}`;

      imageUrls.set(idx, imgUrl);

      var sceneId = opts.storyboard
        ? `scene_${String(idx + 1).padStart(3, "0")}`
        : opts.project?.scenes[idx]?.id;

      var asset: Asset = {
        id: `asset_hero_${idx + 1}`,
        type: "ai_image",
        path: imgResult.path,
        name: `Hero image: scene ${idx + 1}`,
        prompt: imgPrompt,
        width: imgResult.width,
        height: imgResult.height,
        model: "gpt-image-1",
        size: imgSize,
        quality: imgQuality,
        version: 1,
        scene_id: sceneId,
        created_at: new Date().toISOString(),
      };
      generatedAssets.push(asset);

      // For structured projects, wire into scene components
      if (opts.project) {
        if (!opts.project.assets) opts.project.assets = [];
        opts.project.assets.push(asset);

        var projScene = opts.project.scenes[idx];
        if (projScene) {
          var imageComp = projScene.components?.find((c: any) => c.type === "image-showcase");
          if (imageComp) {
            imageComp.data = { ...imageComp.data, src: imgUrl };
          } else {
            projScene.components = projScene.components || [];
            projScene.components.unshift({
              id: `comp_hero_img_${idx}`,
              type: "image-showcase",
              data: { src: imgUrl, effect: "ken-burns" },
              z_index: 1,
            });
          }
        }
      }

      console.log(`    Scene ${idx + 1}: saved (${imgResult.width}x${imgResult.height})`);
    } else {
      console.warn(`    Scene image failed: ${(r.reason as Error)?.message || r.reason}`);
    }
  }

  return { project: opts.project, imageUrls, assets: generatedAssets };
}
