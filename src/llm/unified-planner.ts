/**
 * Unified Planner
 *
 * Single planner that replaces both the freeform storyboard planner and
 * the project/scene planner. Each scene contains a components array where
 * EACH component is independently either a library ref or a custom component.
 *
 * A `creativity` parameter (0-1) biases how many components go custom.
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

export interface PlannedComponent {
  // Library component
  type?: string;  // e.g. "stat-card", "gradient-background"
  data?: Record<string, unknown>;
  position?: { x: number | string; y: number | string; width?: number | string; height?: number | string };
  z_index?: number;
  // Custom component
  custom?: boolean;  // true = generate custom HTML
  custom_prompt?: string;  // visual description for custom generation
}

export interface PlannedScene {
  label: string;
  duration_seconds: number;
  description: string;
  transition_in?: { type: string; duration_seconds: number };
  components: PlannedComponent[];
  hero_image?: string;
}

export interface StoryboardResult {
  name: string;
  scenes: PlannedScene[];
}

/**
 * Plan a storyboard with per-component library/custom decisions.
 */
export async function planStoryboard(opts: UnifiedPlannerOpts): Promise<StoryboardResult> {
  var creativity = opts.creativity ?? 0.5;
  var catalogStr = formatCatalogForPrompt(opts.componentCatalog);

  var sceneCountGuide = opts.sceneCount
    ? `Exactly ${opts.sceneCount} scenes.`
    : "5-8 scenes (scale to content complexity).";

  var systemPrompt = `You are planning a ${opts.format} project.

For each scene, list the components it needs. Each component is EITHER:
- A **library component**: { "type": "stat-card", "data": { ... }, "z_index": 10 }
- A **custom component**: { "custom": true, "custom_prompt": "Detailed visual description...", "z_index": 10 }

You can MIX library and custom components in a single scene.

Example: A scene with a library background + custom hero visual + library stat card:
{
  "label": "Scene 1 - Hero",
  "duration_seconds": 5,
  "description": "Hero reveal with key metric",
  "components": [
    { "type": "mesh-gradient", "data": { "colors": ["#0f172a", "#1e1b4b"] }, "z_index": 0 },
    { "custom": true, "custom_prompt": "Dramatic product visualization with floating UI cards, holographic effects, 3D perspective transforms. Huge 120px typography saying 'QUOTIENT' with SplitText per-character animation. Ambient purple glow orbs in background.", "z_index": 10 },
    { "type": "stat-card", "data": { "number": "340%", "label": "ROI" }, "z_index": 20, "position": { "x": 1400, "y": 800, "width": 400, "height": 200 } }
  ],
  
  "transition_in": { "type": "none", "duration_seconds": 0 }
}

Creativity level: ${creativity} (0 = prefer library, 1 = prefer custom)
- At LOW creativity: use library components for most things. Only go custom when the library genuinely can't express what's needed.
- At HIGH creativity (0.7-1.0): prefer ONE custom component per scene that owns the entire canvas. The custom component should handle its own background, layout, typography, and animation as one cohesive composition. Do NOT layer library backgrounds under custom components -- let the custom component be self-contained. This produces the most cinematic, Apple keynote-level results.
- The library is your toolkit -- use it when it fits. Custom is your escape hatch AND your creative tool.

For library components: fill in their data fields. Always include a background component (gradient-background or mesh-gradient) at z_index 0.
For custom components: provide a detailed custom_prompt describing the visual, layout, and animation. Be VERY specific about typography sizes, animation techniques (SplitText, ScrambleText, DrawSVG, particles), colors, and layout.

You can also include "hero_image" with a DALL-E prompt for any scene that would benefit from an AI-generated visual.

## Available Components

${catalogStr}

## Output Format (valid JSON, no markdown fences)

{
  "name": "Project Title",
  "scenes": [
    {
      "label": "Scene 1 - Hero",
      "duration_seconds": 5,
      "description": "Dramatic hero reveal with product visualization",
      "components": [
        { "type": "gradient-background", "data": { "colors": ["#0f172a", "#1e1b4b"] }, "z_index": 0 },
        { "custom": true, "custom_prompt": "A dramatic hero reveal with huge 120px typography saying 'QUOTIENT'. Dark background with ambient purple glow orbs. Title enters with SplitText per-character animation (chars stagger 0.03s, back.out ease). Subtitle at 24px fades in below. Floating particles in background.", "z_index": 10 }
      ],
      
      "transition_in": { "type": "none", "duration_seconds": 0 }
    },
    {
      "label": "Scene 2 - Key Stats",
      "duration_seconds": 4,
      "description": "Show impressive metrics with multiple stat cards",
      "components": [
        { "type": "gradient-background", "data": { "colors": ["#0f172a", "#1e1b4b"] }, "z_index": 0 },
        { "type": "stat-card", "data": { "number": "340%", "label": "ROI Increase" }, "z_index": 10, "position": { "x": 100, "y": 400, "width": 400, "height": 200 } },
        { "type": "stat-card", "data": { "number": "2.5M", "label": "Users Reached" }, "z_index": 10, "position": { "x": 760, "y": 400, "width": 400, "height": 200 } }
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
- For library components: fill ALL required data fields. Use realistic content, not placeholder text.
- For custom components: custom_prompt must be 3-5 sentences with SPECIFIC visual direction (exact sizes, colors, animation names, layout positions).
- hero_image is OPTIONAL and should be RARE (0-1 per project, not every scene). Only use when a real photograph or illustration would dramatically improve the scene. Most scenes should rely on HTML/CSS/GSAP visuals, not AI images. Skip for: text scenes, stats, code demos, CTAs, dashboards, lists.
- hero_image prompts describe the IMAGE itself, not the scene layout.
- Every scene MUST have a components array with at least one component.
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
    if (!scene.components || !Array.isArray(scene.components)) {
      scene.components = [];
    }

    // If components array is empty, create a single custom component from the description
    if (scene.components.length === 0) {
      console.warn(`  Scene "${scene.label}": no components, adding custom fallback`);
      scene.components.push({
        custom: true,
        custom_prompt: scene.description || scene.label,
        z_index: 10,
      });
    }

    // Normalize each component
    for (var comp of scene.components) {
      if (comp.custom && !comp.custom_prompt) {
        comp.custom_prompt = scene.description || scene.label;
      }
    }
  }

  var libraryCount = 0;
  var customCount = 0;
  for (var scene of storyboard.scenes) {
    for (var comp of scene.components) {
      if (comp.custom) customCount++;
      else libraryCount++;
    }
  }
  console.log(`  Unified planner: ${storyboard.scenes.length} scenes, ${libraryCount} library components, ${customCount} custom components`);

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
