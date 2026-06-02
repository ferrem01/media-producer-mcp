/**
 * Unified Planner
 *
 * Single planner that replaces both the freeform storyboard planner and
 * the project/scene planner. For each scene it decides whether to use
 * library components ("library") or generate fully custom HTML ("custom").
 *
 * A `creativity` parameter (0-1) biases the per-scene decision.
 */

import { callLLM, type LLMConfig } from "./client.js";
import { formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import { SCENE_PLANNER_DESIGN_RULES } from "./design-rules.js";
import type { BrandKit, Canvas, OutputFormat } from "../core/types.js";

// ── Types ──

export interface UnifiedPlannerOpts {
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  componentCatalog: ComponentCatalogEntry[];
  sceneCount?: number;
  creativity?: number; // 0-1, default 0.5
  tenantId: string;
}

export interface PlannedScene {
  label: string;
  duration_seconds: number;
  description: string;
  transition_in?: { type: string; duration_seconds: number };
  approach: "library" | "custom";
  // For library approach:
  components?: Array<{
    type: string;
    data: Record<string, unknown>;
    position?: { x: number | string; y: number | string; width?: number | string; height?: number | string };
    z_index?: number;
  }>;
  // For custom approach:
  custom_prompt?: string;
  // For media enrichment:
  hero_image?: string;
}

export interface StoryboardResult {
  name: string;
  scenes: PlannedScene[];
}

/**
 * Plan a storyboard with per-scene library/custom decisions.
 */
export async function planStoryboard(opts: UnifiedPlannerOpts): Promise<StoryboardResult> {
  var creativity = opts.creativity ?? 0.5;
  var catalogStr = formatCatalogForPrompt(opts.componentCatalog);

  var creativityGuide: string;
  if (creativity <= 0.3) {
    creativityGuide = "STRONGLY prefer library components. Only use custom for truly unique scenes that no library component can handle.";
  } else if (creativity <= 0.6) {
    creativityGuide = "Balanced approach. Use library for standard scenes (stats, titles, CTAs, lists), custom for hero/feature scenes that need creative freedom.";
  } else {
    creativityGuide = "Prefer custom for most scenes. Use library only for simple utility scenes (backgrounds, CTAs, basic stat cards).";
  }

  var sceneCountGuide = opts.sceneCount
    ? `Exactly ${opts.sceneCount} scenes.`
    : "5-8 scenes (scale to content complexity).";

  var systemPrompt = `You are planning a ${opts.format} project. For each scene, decide the best approach:

**approach: "library"** - Use existing components from the catalog. Fill in their data fields.
Best for: title slides, stat cards, CTAs, text lists, standard layouts, data viz, backgrounds.

**approach: "custom"** - Generate a fully custom HTML+CSS+GSAP component.
Best for: unique product demos, complex animations, custom visualizations, scenes that need creative freedom, hero reveals with dramatic typography.

Creativity level: ${creativity} (0 = prefer library, 1 = prefer custom)
${creativityGuide}

For "library" scenes: list the components with their data fields filled in. Always include a background component (gradient-background or mesh-gradient) at z_index 0.
For "custom" scenes: provide a detailed custom_prompt describing the visual, layout, and animation. Be VERY specific about typography sizes, animation techniques (SplitText, ScrambleText, DrawSVG, particles), colors, and layout.

You can also include "hero_image" with a DALL-E prompt for any scene that would benefit from an AI-generated visual (regardless of approach).

## Available Components

${catalogStr}

## Output Format (valid JSON, no markdown fences)

{
  "name": "Project Title",
  "scenes": [
    {
      "label": "Scene 1 - Hero",
      "duration_seconds": 5,
      "description": "Brief description of scene purpose",
      "approach": "custom",
      "custom_prompt": "A dramatic hero reveal with huge 120px typography saying 'QUOTIENT'. Dark background (#0f172a) with ambient purple glow orbs. Title enters with SplitText per-character animation (chars stagger 0.03s, back.out ease). Subtitle at 24px fades in below. Floating particles in background. Exit: title chars scatter outward.",
      "hero_image": "A futuristic AI command center with holographic displays, purple and blue neon lighting, cinematic depth of field",
      "transition_in": { "type": "none", "duration_seconds": 0 }
    },
    {
      "label": "Scene 2 - Key Stats",
      "duration_seconds": 4,
      "description": "Show impressive metrics",
      "approach": "library",
      "components": [
        { "type": "gradient-background", "data": { "colors": ["#0f172a", "#1e1b4b"] }, "z_index": 0 },
        { "type": "stat-card", "data": { "number": "340%", "label": "ROI Increase" }, "z_index": 10 }
      ],
      "transition_in": { "type": "slide-up", "duration_seconds": 0.5 }
    }
  ]
}

## Rules

- ${sceneCountGuide}
- First scene: transition "none" or omit transition_in.
- Valid transitions: crossfade, blur-crossfade, wipe-left, wipe-right, slide-up, slide-down, iris, morph-wipe, zoom-through, glitch-cut, scale-rotate, curtain, none.
- VARY scene types: don't repeat the same layout. Mix hero text, product demos, stats, visual metaphors, grids, CTAs.
- Never have two identical layout types in a row.
- For library scenes: fill ALL required data fields. Use realistic content, not placeholder text.
- For custom scenes: custom_prompt must be 3-5 sentences with SPECIFIC visual direction (exact sizes, colors, animation names, layout positions).
- hero_image is OPTIONAL. Use for hero visuals, product illustrations, abstract art. Skip for text-only, stats, code demos.
- hero_image prompts describe the IMAGE itself, not the scene layout.
- Think Apple keynote: one powerful idea per scene, cinematic motion, premium aesthetic.
- Output ONLY valid JSON. No commentary.

${SCENE_PLANNER_DESIGN_RULES}`;

  var userPrompt = `Create a ${opts.format} project.\n\n${opts.prompt}`;

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { temperature: 0.5, maxTokens: 8192 });

  var storyboard = parseJsonResponse(raw);

  if (!storyboard.scenes || storyboard.scenes.length === 0) {
    throw new Error("Unified planner returned no scenes");
  }

  // Validate and normalize each scene
  for (var scene of storyboard.scenes) {
    if (!scene.approach) {
      // Default based on creativity
      scene.approach = creativity >= 0.5 ? "custom" : "library";
    }
    if (scene.approach === "library" && (!scene.components || scene.components.length === 0)) {
      // LLM said library but gave no components -- flip to custom
      console.warn(`  Scene "${scene.label}": marked library but no components, switching to custom`);
      scene.approach = "custom";
      if (!scene.custom_prompt) {
        scene.custom_prompt = scene.description || scene.label;
      }
    }
    if (scene.approach === "custom" && !scene.custom_prompt) {
      scene.custom_prompt = scene.description || scene.label;
    }
  }

  console.log(`  Unified planner: ${storyboard.scenes.length} scenes (${storyboard.scenes.filter((s: PlannedScene) => s.approach === "library").length} library, ${storyboard.scenes.filter((s: PlannedScene) => s.approach === "custom").length} custom)`);

  return storyboard as StoryboardResult;
}

// ── Helpers ──

function parseJsonResponse(raw: string): any {
  var trimmed = raw.trim();

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
    var first = trimmed.indexOf('{');
    var last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.substring(first, last + 1));
    }
    throw new Error(`Invalid JSON from unified planner: ${trimmed.substring(0, 300)}`);
  }
}
