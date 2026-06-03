/**
 * Unified Planner
 *
 * Unified planner that decides per-scene whether to use library components or
 * the project/scene planner. Each scene contains a components array where
 * EACH component is independently either a library ref or a custom component.
 *
 * A `creativity` parameter (0-1) biases how many components go custom.
 */

import { callLLM, type LLMConfig } from "./client.js";
import { formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import { SCENE_PLANNER_DESIGN_RULES } from "./design-rules.js";
import type { BrandKit, Canvas, OutputFormat } from "../core/types.js";

function isLightBrand(brandKit: BrandKit): boolean {
  var bg = brandKit.colors?.background || "#0f172a";
  var hex = bg.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

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
    { "type": "mesh-gradient", "data": { "colors": ["var(--mp-color-background)", "var(--mp-color-primary)"] }, "z_index": 0 },
    { "custom": true, "custom_prompt": "Dramatic product visualization with floating UI cards, holographic effects, 3D perspective transforms. Huge 120px typography saying 'QUOTIENT' with SplitText per-character animation. Ambient purple glow orbs in background.", "z_index": 10 },
    { "type": "stat-card", "data": { "number": "340%", "label": "ROI" }, "z_index": 20, "position": { "x": 1400, "y": 800, "width": 400, "height": 200 } }
  ],
  
  "transition_in": { "type": "none", "duration_seconds": 0 }
}

Creativity level: ${creativity} (0 = prefer library, 1 = prefer custom)
- At LOW creativity: use library components for most things. Only go custom when the library genuinely can't express what's needed.
- At HIGH creativity (0.7-1.0): prefer ONE custom component per scene that owns the entire canvas. The custom component should handle its own background, layout, typography, and animation as one cohesive composition. Do NOT layer library backgrounds under custom components -- let the custom component be self-contained. This produces the most cinematic, Apple keynote-level results.
- The library is your toolkit -- use it when it fits. Custom is your escape hatch AND your creative tool.

For library components: use the EXACT type name from the catalog above (e.g. "cta-card" not "cta", "stat-card" not "stat", "title-slide" not "title"). Fill in their data fields. Always include a background component (gradient-background or mesh-gradient) at z_index 0.
For background component colors: ALWAYS use CSS var references from the brand kit (e.g. "var(--mp-color-background)", "var(--mp-color-primary)", "var(--mp-color-surface)"). NEVER hardcode hex colors for backgrounds.
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
        { "type": "gradient-background", "data": { "colors": ["var(--mp-color-background)", "var(--mp-color-surface)"] }, "z_index": 0 },
        { "custom": true, "custom_prompt": "A dramatic hero reveal with huge 120px typography saying 'QUOTIENT'. Background uses brand colors with ambient glow orbs in the accent color. Title enters with SplitText per-character animation (chars stagger 0.03s, back.out ease). Subtitle at 24px fades in below. Floating particles in background.", "z_index": 10 }
      ],
      
      "transition_in": { "type": "none", "duration_seconds": 0 }
    },
    {
      "label": "Scene 2 - Key Stats",
      "duration_seconds": 4,
      "description": "Show impressive metrics with multiple stat cards",
      "components": [
        { "type": "gradient-background", "data": { "colors": ["var(--mp-color-background)", "var(--mp-color-surface)"] }, "z_index": 0 },
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
- For library components: use the EXACT type name from the Available Components catalog. Do not abbreviate or shorten names. Fill ALL required data fields. Use realistic content, not placeholder text.
- At HIGH creativity: each scene should have ONE self-contained custom component that handles everything (background, layout, text, animation). Do NOT add separate library background components -- the custom component IS the entire scene.
- For custom components: custom_prompt must be 3-5 sentences with SPECIFIC visual direction (exact sizes, colors, animation names, layout positions).
- hero_image is OPTIONAL and should be RARE (0-1 per project, not every scene). Only use when a real photograph or illustration would dramatically improve the scene. Most scenes should rely on HTML/CSS/GSAP visuals, not AI images. Skip for: text scenes, stats, code demos, CTAs, dashboards, lists.
- hero_image prompts describe the IMAGE itself, not the scene layout.
- Every scene MUST have a components array with at least one component.
- Think Apple keynote: one powerful idea per scene, cinematic motion, premium aesthetic.
- Output ONLY valid JSON. No commentary.

${SCENE_PLANNER_DESIGN_RULES}`;

  // Inject brand asset info into the system prompt if available
  var brandAssetsSection = "";
  if (opts.brandKit.assets?.backgrounds?.length) {
    brandAssetsSection += `\n\n## Brand Background Images (MANDATORY)\nThese are pre-approved brand backgrounds. PREFER these over mesh-gradient or gradient-background when a matching background exists.\n`;
    for (var bg of opts.brandKit.assets.backgrounds) {
      brandAssetsSection += `- "${bg.name}": ${bg.url} [tags: ${bg.tags.join(", ")}]\n`;
    }
    brandAssetsSection += `\nTo use a brand background as a full-bleed scene background at z_index 0, use the image component:\n{ "type": "image", "data": { "src": "${opts.brandKit.assets.backgrounds[0].url}" }, "z_index": 0 }\nOptional data props: overlay_opacity (0-1 for text readability), overlay_color, drift (true/false for ken-burns).\n`;
  }
  if (opts.brandKit.logos?.length) {
    var isLight = isLightBrand(opts.brandKit);
    var bestLogo = opts.brandKit.logos.find(l => l.theme === (isLight ? "light" : "dark")) || opts.brandKit.logos[0];
    brandAssetsSection += `\n\n## Brand Logos\nAvailable logo variants:\n`;
    for (var logo of opts.brandKit.logos) {
      brandAssetsSection += `- "${logo.name}" (${logo.variant}, ${logo.theme} theme): ${logo.url}\n`;
    }
    brandAssetsSection += `\nRecommended logo for current background: ${bestLogo.url}\nTo include a logo, use the image component at z_index 30 with blend mode to remove white backgrounds:\n{ "type": "image", "data": { "src": "${bestLogo.url}", "fit": "contain", "blend": "multiply", "drift": false }, "z_index": 30, "position": { "x": 40, "y": 30, "width": 120, "height": 40 } }\n\nFollow the brand guidelines below for when and where to place logos.\n`;
  }
  if (brandAssetsSection) {
    systemPrompt += brandAssetsSection;
  }

  // Inject brand guidelines (tenant-defined rules)
  if (opts.brandKit.guidelines) {
    systemPrompt += `\n\n## Brand Guidelines (FOLLOW THESE RULES)\n${opts.brandKit.guidelines}\n`;
  }

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
