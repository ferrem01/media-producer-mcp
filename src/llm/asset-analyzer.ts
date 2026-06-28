/**
 * Asset Analyzer
 *
 * Examines each planned scene and determines what assets would make it
 * great vs. what it can generate or mock. Populates the PlannedAsset[]
 * on each scene in the plan.
 *
 * Mostly rule-based (fast, no LLM call needed). Uses template hints and
 * scene purpose to determine asset types and priorities.
 */

import type {
  ProjectBrief,
  Storyboard,
  StoryboardScene,
  PlannedAsset,
  PlannedAssetType,
  PlannedAssetPriority,
  BrandKit,
  AvailableAsset,
} from "../core/types.js";

export interface AssetAnalyzerOptions {
  plan: Storyboard;
  brief: ProjectBrief;
  brandKit?: BrandKit | null;
}

/** Template categories that imply specific asset needs */
const DEMO_TEMPLATES = new Set(["P1", "P2", "P3", "P4", "I-SAAS2"]);
const TESTIMONIAL_TEMPLATES = new Set(["C4", "I-ECOM2"]);
const PRODUCT_TEMPLATES = new Set(["C1", "C5", "I-ECOM1", "I-RE1"]);
const DATA_TEMPLATES = new Set(["D1", "D2", "D3", "D4", "I-FIN2"]);
const INTRO_TEMPLATES = new Set(["O2", "O5"]);
const OUTRO_TEMPLATES = new Set(["E3"]);
const BREATHING_TEMPLATES = new Set(["B1", "B2", "B3"]);
const CTA_TEMPLATES = new Set(["E1", "E4"]);

/**
 * Analyze asset needs for each scene in the plan.
 * Mutates plan.scenes[].assets in place and returns the plan.
 */
export function analyzeAssets(opts: AssetAnalyzerOptions): Storyboard {
  const { plan, brief, brandKit } = opts;
  const availableAssets = brief.available_assets || [];

  for (const scene of plan.scenes) {
    scene.assets = analyzeScene(scene, availableAssets, brandKit);
  }

  const totalAssets = plan.scenes.reduce((sum, s) => sum + s.assets.length, 0);
  const needed = plan.scenes.reduce((sum, s) => sum + s.assets.filter(a => a.status === "needed").length, 0);
  const provided = plan.scenes.reduce((sum, s) => sum + s.assets.filter(a => a.status === "provided").length, 0);

  console.log(`  Asset analyzer: ${totalAssets} assets identified (${needed} needed, ${provided} pre-matched)`);

  return plan;
}

function analyzeScene(
  scene: StoryboardScene,
  availableAssets: AvailableAsset[],
  brandKit?: BrandKit | null,
): PlannedAsset[] {
  const assets: PlannedAsset[] = [];
  const template = scene.template.split("-")[0].toUpperCase(); // e.g., "P1" from "P1-product-frame"
  const templateFull = scene.template.split(" ")[0]; // Handle "D1-hero-stat + C4-testimonial"
  const purposeLower = scene.purpose.toLowerCase();
  const notesLower = scene.visual_notes.toLowerCase();

  // ── Demo / Product screenshots ──
  if (DEMO_TEMPLATES.has(template) || DEMO_TEMPLATES.has(templateFull)) {
    if (notesLower.includes("screen recording") || notesLower.includes("screencast") || purposeLower.includes("demo")) {
      assets.push(makeAsset({
        description: `Screen recording for "${scene.label}" -- ${extractVisualHint(scene)}`,
        type: "screen_recording",
        priority: "critical",
        fallback: "Will generate an HTML mockup of the UI. A real recording looks significantly more credible and dynamic.",
        recording_instructions: `Record the product UI relevant to this scene. Landscape 1920x1080, 10-15 seconds. Show real data if possible.`,
      }, availableAssets));
    } else {
      assets.push(makeAsset({
        description: `Product screenshot for "${scene.label}" -- ${extractVisualHint(scene)}`,
        type: "screenshot",
        priority: "recommended",
        fallback: "Will generate an HTML mockup component. Still looks good but less authentic than a real product shot.",
      }, availableAssets));
    }
  }

  // ── Product / Feature visuals ──
  if (PRODUCT_TEMPLATES.has(template) || PRODUCT_TEMPLATES.has(templateFull)) {
    if (!assets.some(a => a.type === "screenshot" || a.type === "screen_recording")) {
      assets.push(makeAsset({
        description: `Product visual for "${scene.label}" -- ${extractVisualHint(scene)}`,
        type: "screenshot",
        priority: "recommended",
        fallback: "Will create a component-based mockup with the brand design system.",
      }, availableAssets));
    }
  }

  // ── Testimonials / Customer stories ──
  if (TESTIMONIAL_TEMPLATES.has(template) || TESTIMONIAL_TEMPLATES.has(templateFull) || purposeLower.includes("testimonial") || purposeLower.includes("customer")) {
    // Check if there's a person mentioned
    if (purposeLower.includes("photo") || notesLower.includes("headshot") || notesLower.includes("photo")) {
      assets.push(makeAsset({
        description: `Customer photo for "${scene.label}" testimonial`,
        type: "photo",
        priority: "nice_to_have",
        fallback: "Will use a text-only quote card. Still effective, just less personal.",
      }, availableAssets));
    }

    // Camera video of the customer speaking
    if (notesLower.includes("video") || notesLower.includes("camera")) {
      assets.push(makeAsset({
        description: `Customer video clip for "${scene.label}"`,
        type: "camera_video",
        priority: "recommended",
        fallback: "Will use a quote card with text animation instead.",
      }, availableAssets));
    }
  }

  // ── Hero / Background visuals ──
  if (notesLower.includes("hero") || notesLower.includes("background image") || notesLower.includes("product shot")) {
    if (!assets.some(a => a.type === "screenshot" || a.type === "screen_recording")) {
      const hasBrandBackgrounds = brandKit?.assets?.some(a => a.type === "background") || false;
      if (!hasBrandBackgrounds) {
        assets.push(makeAsset({
          description: `Hero background image for "${scene.label}"`,
          type: "ai_image",
          priority: "nice_to_have",
          fallback: "Will use a gradient or mesh-gradient background. AI-generated image would add visual richness.",
          generation_prompt: buildImagePrompt(scene),
        }, availableAssets));
      }
    }
  }

  // ── Intro/Outro brand videos -- check brand kit ──
  if (INTRO_TEMPLATES.has(template) || INTRO_TEMPLATES.has(templateFull)) {
    const brandIntro = brandKit?.assets?.find(a => a.type === "intro");
    if (!brandIntro) {
      assets.push(makeAsset({
        description: `Brand intro video for "${scene.label}"`,
        type: "camera_video",
        priority: "recommended",
        fallback: "Will use a logo animation component instead of a video intro.",
      }, availableAssets));
    }
    // If brand intro exists, no asset needed -- it's already in the brand kit
  }

  if (OUTRO_TEMPLATES.has(template) || OUTRO_TEMPLATES.has(templateFull)) {
    const brandOutro = brandKit?.assets?.find(a => a.type === "outro");
    if (!brandOutro) {
      // No asset needed -- logo outro can be generated from brand kit logo
    }
  }

  // ── Data scenes -- generally no assets needed ──
  // DATA_TEMPLATES, BREATHING_TEMPLATES, CTA_TEMPLATES -- handled by component library

  return assets;
}

/**
 * Try to match an asset need to a caller-provided available asset.
 */
function makeAsset(
  base: Omit<PlannedAsset, "status"> & { status?: PlannedAssetStatus },
  availableAssets: AvailableAsset[],
): PlannedAsset {
  // Try to find a matching available asset
  const match = findMatchingAsset(base.description, base.type, availableAssets);

  if (match) {
    return {
      ...base,
      status: "provided",
      path: match.path || undefined,
    } as PlannedAsset;
  }

  return {
    ...base,
    status: base.type === "ai_image" ? "generating" : "needed",
  } as PlannedAsset;
}

type PlannedAssetStatus = "needed" | "provided" | "generating" | "generated" | "fallback";

/**
 * Simple keyword matching between an asset need and available assets.
 */
function findMatchingAsset(
  description: string,
  type: PlannedAssetType,
  availableAssets: AvailableAsset[],
): AvailableAsset | null {
  if (availableAssets.length === 0) return null;

  const descLower = description.toLowerCase();

  // Type-compatible mapping
  const typeCompat: Record<string, string[]> = {
    screen_recording: ["screen_recording", "camera_video"],
    screenshot: ["screenshot", "photo"],
    photo: ["photo", "screenshot"],
    camera_video: ["camera_video", "screen_recording"],
    product_shot: ["screenshot", "photo"],
  };

  const compatTypes = typeCompat[type] || [type];

  for (const available of availableAssets) {
    if (!compatTypes.includes(available.type)) continue;

    // Simple keyword overlap check
    const availLower = available.description.toLowerCase();
    const descWords = descLower.split(/\s+/).filter(w => w.length > 3);
    const matchCount = descWords.filter(w => availLower.includes(w)).length;

    if (matchCount >= 2 || availLower.includes(descLower.substring(0, 20))) {
      return available;
    }
  }

  return null;
}

/**
 * Extract a visual hint from a scene for asset descriptions.
 */
function extractVisualHint(scene: StoryboardScene): string {
  // Take the first meaningful clause from visual_notes
  const notes = scene.visual_notes;
  if (!notes) return scene.purpose;
  const firstSentence = notes.split(/[.!]/).filter(s => s.trim().length > 10)[0];
  return firstSentence?.trim() || scene.purpose;
}

/**
 * Build an AI image generation prompt from a scene.
 */
function buildImagePrompt(scene: StoryboardScene): string {
  return `Professional marketing visual for a scene titled "${scene.label}". ${scene.visual_notes}. Modern, clean, premium feel. Dark background with subtle gradients. No text in the image.`;
}
