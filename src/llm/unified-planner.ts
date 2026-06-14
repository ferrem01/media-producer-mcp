/**
 * Unified Planner
 *
 * Unified planner that decides per-scene whether to use library components or
 * the project/scene planner. Each scene contains a components array where
 * EACH component is independently either a library ref or a custom component.
 *
 * A `creativity` parameter (0-1) biases how many components go custom.
 */

import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import { formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import { SCENE_PLANNER_DESIGN_RULES } from "./design-rules.js";
import { SCENE_TEMPLATES } from "./scene-templates.js";
import { COMPOSITION_PLAYBOOK } from "./cinematography.js";
import { getStorytellingGuide } from "./freeform-skills.js";
import { formatTemplateCatalogForPrompt } from "./template-catalog.js";
import type { BrandKit, Canvas, OutputFormat, ReferenceImage } from "../core/types.js";
import {
  buildReferenceImageParts,
  buildReferenceImageSummary,
} from "./reference-images.js";

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
  hasSpeakerTrack?: boolean;
  referenceImages?: ReferenceImage[];
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
  // Template scene
  template?: string;  // template ID, e.g. "O1-big-statement"
  template_data?: Record<string, unknown>;  // content for template slots
}

export interface PlannedScene {
  label: string;
  duration_seconds: number;
  description: string;
  transition_in?: { type: string; duration_seconds: number };
  components: PlannedComponent[];
  hero_image?: string;
  voiceover_text?: string;  // Narration script for this scene (TTS)
  // Template scene (entire scene uses a pre-built template)
  template?: string;  // template ID, e.g. "O1-big-statement"
  template_data?: Record<string, unknown>;  // content for template slots
  // Freeform scene (full bespoke HTML generation)
  freeform?: boolean;  // true = generate full scene HTML from rich storyboard description
  freeform_brief?: string;  // detailed storyboard-quality scene description
  // Blocks: suggest library blocks for codegen to read and compose
  suggested_blocks?: string[];  // block type names the codegen should study
  // Sequence: multi-beat continuous scene
  beats?: PlannedBeat[];  // when present, freeform_brief is ignored; beats provide per-beat briefs
}

export interface PlannedBeat {
  label: string;
  brief: string;
  duration_seconds: number;
  voiceover_text?: string;
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

  var templateCatalogStr = formatTemplateCatalogForPrompt();

  var storytellingGuide = getStorytellingGuide();

  var systemPrompt = `You are a creative director planning a ${opts.format} project.

You think in visual STORIES, not slide decks. Every scene should feel like something the viewer wants to watch, not endure.

${storytellingGuide ? `## Visual Storytelling Guide\n\n${storytellingGuide}\n\n` : ""}You have FOUR options for each scene:

## Option 1: Freeform Scene (BEST QUALITY — use for hero moments, product demos, visual storytelling)
Full bespoke HTML+CSS+GSAP generated from a rich storyboard description. Write a detailed visual brief describing what the viewer EXPERIENCES — with motion verbs, depth layers, choreography. This produces the highest quality output.

{
  "label": "Scene 1 - Connector Discovery",
  "duration_seconds": 5,
  "description": "User discovers and activates the connector feature",
  "freeform": true,
  "freeform_brief": "A clean workspace fills the frame — warm off-white background with subtle grid lines pulsing faintly. A cursor GLIDES from below toward a plus icon at center. On click, a circular button BLOOMS outward with a soft shadow spreading beneath it. The circle MORPHS into a rounded card panel. Menu items STAGGER in from the right — each row has a thin icon, label text, and a chevron. The cursor DRIFTS to Connectors, which highlights with a warm rounded fill. BG: subtle grid with breathing glow. MG: UI card with menu items. FG: cursor with drop shadow, particle hints.",
  "components": [],
  "voiceover_text": "Discover the connector that changes everything.",
  "transition_in": { "type": "none", "duration_seconds": 0 }
}

Freeform briefs MUST be 5+ sentences with specific motion verbs, depth layers (BG/MG/FG), and choreography. NOT "show the feature" — describe what HAPPENS frame by frame.

## Option 2: Template Scene (GOOD — use for standard layouts like titles, stats, CTAs)
Use a pre-built scene template. These have premium Apple-level visuals baked in. You only provide the content.

{
  "label": "Scene 1 - Hero",
  "duration_seconds": 5,
  "description": "Bold opening statement",
  "template": "O1-big-statement",
  "template_data": { "badge": "INTRODUCING", "headline": "The Future of Marketing", "subtitle": "AI-powered demand generation" },
  "components": [],
  "transition_in": { "type": "none", "duration_seconds": 0 }
}

## Option 2: Library Components
Compose a scene from pre-built components. Each component has a type and data.

{
  "label": "Scene 2 - Stats",
  "duration_seconds": 4,
  "description": "Key metrics",
  "components": [
    { "type": "gradient-background", "data": { "from": "var(--mp-color-background)", "to": "var(--mp-color-surface)" }, "z_index": 0 },
    { "type": "stat-card", "data": { "number": "340%", "label": "ROI" }, "z_index": 10 }
  ],
  "transition_in": { "type": "crossfade", "duration_seconds": 0.5 }
}

## Option 5: Sequence Scene (BEST for walkthroughs, multi-step demos, cause-and-effect)
A sequence is a scene with MULTIPLE BEATS and REAL COMPONENTS on one continuous stage. Components persist and transform across beats -- no cuts, no transitions. This produces the premium "single take" feel.

**Component-Based Sequence (PREFERRED):** Use existing library components with choreography.
The system places all components on stage and orchestrates when each appears, moves, and exits.
Each component's built-in animation runs at the right beat. You only define the choreography.

{
  "label": "Canva Connector Walkthrough",
  "duration_seconds": 30,
  "description": "Full walkthrough: chat to Canva to published post",
  "beats": [
    { "label": "chat", "brief": "User types a request in Quotient chat", "duration_seconds": 8, "voiceover_text": "Start with a simple request." },
    { "label": "connect", "brief": "Chat slides left, Canva editor appears from right", "duration_seconds": 8, "voiceover_text": "The Canva connector activates." },
    { "label": "design", "brief": "Canva editor generates a design", "duration_seconds": 7, "voiceover_text": "The design assembles itself." },
    { "label": "publish", "brief": "Both panels slide out, social post preview centers", "duration_seconds": 7, "voiceover_text": "Published. Live. Done." }
  ],
  "components": [
    { "type": "quotient-chat", "data": { "messages": [...] }, "z_index": 10, "position": { "x": "10%", "y": "10%", "width": "80%", "height": "80%" } },
    { "type": "canva-editor", "data": { "design_type": "social" }, "z_index": 10, "position": { "x": "55%", "y": "10%", "width": "40%", "height": "80%" } },
    { "type": "quotient-social", "data": { "platform": "linkedin" }, "z_index": 10, "position": { "x": "20%", "y": "10%", "width": "60%", "height": "80%" } }
  ],
  "choreography": [
    {
      "label": "chat",
      "visibleComponents": ["comp_0"],
      "transitions": { "comp_0": { "enter": { "from": { "opacity": 0, "y": 40 }, "duration": 0.6 } } }
    },
    {
      "label": "connect",
      "visibleComponents": ["comp_0", "comp_1"],
      "transitions": {
        "comp_0": { "move": { "to": { "left": "5%", "width": "40%" }, "duration": 0.8 } },
        "comp_1": { "enter": { "from": { "opacity": 0, "x": 200 }, "duration": 0.8 } }
      }
    },
    {
      "label": "design",
      "visibleComponents": ["comp_0", "comp_1"]
    },
    {
      "label": "publish",
      "visibleComponents": ["comp_2"],
      "transitions": {
        "comp_0": { "exit": { "to": { "opacity": 0, "x": -200 }, "duration": 0.6 } },
        "comp_1": { "exit": { "to": { "opacity": 0, "x": 200 }, "duration": 0.6 } },
        "comp_2": { "enter": { "from": { "opacity": 0, "scale": 0.8 }, "duration": 0.8 } }
      }
    }
  ],
  "transition_in": { "type": "none", "duration_seconds": 0 }
}

**Freeform Sequence (fallback):** When no library components match, use freeform=true with beats.
The LLM generates one HTML doc with all elements and a multi-beat timeline.

Use sequences when:
- Multiple related steps should flow as one continuous motion (walkthroughs, demos)
- Elements should persist and transform (a panel that morphs, a cursor that navigates)
- The story has cause-and-effect beats that feel choppy as separate scenes

Each beat gets a label, a brief (what happens), a duration, and optional voiceover.
Total duration_seconds = sum of beat durations.

## Option 6: Blocks Composition (BEST for multi-component scenes — walkthroughs, split-screen demos)

Instead of rigid component data-binding, suggest which library blocks the codegen should study and compose. The system reads the block sources, and the codegen adapts them into one custom scene with full creative control over layout, choreography, and transitions.

{
  "label": "Canva Connector Walkthrough",
  "duration_seconds": 30,
  "description": "Full walkthrough: chat to Canva to published post in one continuous take",
  "freeform": true,
  "freeform_brief": "Three panels orchestrated in sequence. Beat 1 (0-8s): Quotient chat fills the frame, user types a request for a LinkedIn post. Beat 2 (8-16s): Chat slides left to 45% width, Canva editor slides in from right showing a design being created. Beat 3 (16-22s): Both panels slide out, LinkedIn social post preview fades up center showing the published result. Beat 4 (22-30s): Post card scales down slightly, stats animate in below.",
  "suggested_blocks": ["quotient-chat", "canva-editor", "quotient-social"],
  "beats": [
    { "label": "chat", "brief": "User types request in Quotient chat", "duration_seconds": 8 },
    { "label": "design", "brief": "Chat slides left, Canva editor appears", "duration_seconds": 8 },
    { "label": "publish", "brief": "Panels exit, social post preview centers", "duration_seconds": 6 },
    { "label": "celebrate", "brief": "Stats animate in", "duration_seconds": 8 }
  ],
  "components": [],
  "voiceover_text": "From idea to published post in one conversation.",
  "transition_in": { "type": "none", "duration_seconds": 0 }
}

The key difference from component-based sequences: codegen gets full creative control. It reads the block HTML, adapts it, and writes its own GSAP choreography. No auto-generated choreography, no rigid data-binding. Much higher quality output.

Use blocks composition when:
- You want to combine 2+ existing UI mockups (quotient-chat, canva-editor, slack-workspace, etc.)
- The scene needs multi-beat choreography (panels sliding, appearing, transforming)
- You want the quality of freeform with the reusability of library components

## Option 3: Custom Component (escape hatch)
Single custom HTML component within the standard structure. Use when no template or library component fits.

{
  "label": "Scene 3 - Custom Demo",
  "duration_seconds": 5,
  "description": "Unique product visualization",
  "components": [
    { "custom": true, "custom_prompt": "Detailed visual description...", "z_index": 10 }
  ],
  "transition_in": { "type": "blur-crossfade", "duration_seconds": 0.5 }
}

QUALITY RANKING: Blocks Composition > Freeform > Templates > Library > Custom.
Use BLOCKS COMPOSITION when combining existing UI mockups (quotient-chat, canva-editor, etc.) into multi-step demos.
Use suggested_blocks to hint which library blocks the codegen should study.
Use FREEFORM for scenes that tell a visual story — product demos, UI walkthroughs, interaction sequences, before/after transformations, cause-and-effect cascades, metaphors made visual. These produce the highest quality, most impressive output.
Use TEMPLATES for standard layouts (big statements, stat displays, simple CTAs).
Use LIBRARY for data-heavy scenes with standard components.
Use CUSTOM as a last resort.

For product/feature videos, at LEAST 50% of scenes should be freeform. For demos and walkthroughs, aim for 70%+ freeform. Only fall back to templates for simple title/CTA scenes.

When writing freeform_brief: think like a storyboard director. Describe what the viewer EXPERIENCES, not the layout. Use motion verbs (SLAMS, DRIFTS, MORPHS, SNAPS, ASSEMBLES). Include BG/MG/FG layers. Describe choreography and timing relationships between elements.

When using a template: set "template" to the template ID, "template_data" with the slot values, and leave "components" as an empty array [].
You can MIX approaches across scenes -- template for the opener, library for stats, custom for a unique demo.

For library components: use the EXACT type name from the catalog above (e.g. "cta-card" not "cta", "stat-card" not "stat", "title-slide" not "title"). Fill in their data fields. Always include a background component (gradient-background or mesh-gradient) at z_index 0.
For background component colors: ALWAYS use CSS var references from the brand kit (e.g. "var(--mp-color-background)", "var(--mp-color-primary)", "var(--mp-color-surface)"). NEVER hardcode hex colors for backgrounds.
For custom components: provide a detailed custom_prompt describing the visual, layout, and animation. Be VERY specific about typography sizes, animation techniques (SplitText, ScrambleText, DrawSVG, particles), colors, and layout.

You can also include "hero_image" with an image generation prompt for any scene that would benefit from an AI-generated visual.

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
        { "type": "gradient-background", "data": { "from": "var(--mp-color-background)", "to": "var(--mp-color-surface)" }, "z_index": 0 },
        { "custom": true, "custom_prompt": "A dramatic hero reveal with huge 120px typography saying 'QUOTIENT'. Background uses brand colors with ambient glow orbs in the accent color. Title enters with SplitText per-character animation (chars stagger 0.03s, back.out ease). Subtitle at 24px fades in below. Floating particles in background.", "z_index": 10 }
      ],
      
      "voiceover_text": "Introducing Quotient. The future of demand generation.",
      "transition_in": { "type": "none", "duration_seconds": 0 }
    },
    {
      "label": "Scene 2 - Key Stats",
      "duration_seconds": 4,
      "description": "Show impressive metrics with multiple stat cards",
      "components": [
        { "type": "gradient-background", "data": { "from": "var(--mp-color-background)", "to": "var(--mp-color-surface)" }, "z_index": 0 },
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
- Valid transitions: crossfade, blur-crossfade, wipe-left, wipe-right, slide-up, slide-down, iris, morph-wipe, zoom-through, glitch-cut, scale-rotate, curtain, shader-crosswarp, shader-ripple, shader-radial, shader-directional-warp, shader-burn, shader-chromatic, shader-lens-distortion, none.
- SHADER transitions (shader-*) use WebGL for premium visual effects. Use them for hero transitions between key scenes. shader-crosswarp: warped crossfade, shader-ripple: ripple wave, shader-radial: radial wipe, shader-directional-warp: directional warp morph, shader-burn: warm burn blend, shader-chromatic: RGB split aberration, shader-lens-distortion: gravitational lens. Use 1-3 shader transitions per video for maximum impact. Do not overuse.
- VARY scene types: don't repeat the same layout. Mix hero text, product demos, stats, visual metaphors, grids, CTAs.
- Never have two identical layout types in a row.
- For library components: use the EXACT type name from the Available Components catalog. Do not abbreviate or shorten names. Fill ALL required data fields. Use realistic content, not placeholder text.
- NEVER DUPLICATE CONTENT across components. Each piece of content belongs to exactly ONE component:
  * If a custom component renders a stat (e.g. "340% ROI"), do NOT also add a stat-card library component for the same stat.
  * If a custom component renders a CTA button, do NOT also add a cta-card library component.
  * If a custom component renders a headline, do NOT also add a kinetic-text or section-header for the same text.
- When a custom component handles the main visual content of a scene, the ONLY library components you should add alongside it are:
  * Background: image, gradient-background, or mesh-gradient at z_index 0
  * Logo: image component at z_index 30
  * Do NOT add stat-card, cta-card, or other content components alongside a custom component that already renders that content.
- At HIGH creativity: you MUST output exactly ONE component with custom=true. Zero library components. The custom component handles EVERYTHING (background, layout, text, animation, logo, CTA). If you output any library components at creativity >= 0.7, the pipeline will fail.
- For custom components: custom_prompt must be 3-5 sentences with SPECIFIC visual direction (exact sizes, colors, animation names, layout positions). EXPLICITLY STATE what content the custom component should render and what other library components in the scene already handle.
- hero_image is OPTIONAL and should be RARE (0-1 per project, not every scene). Only use when a real photograph or illustration would dramatically improve the scene. Most scenes should rely on HTML/CSS/GSAP visuals, not AI images. Skip for: text scenes, stats, code demos, CTAs, dashboards, lists.
- hero_image prompts describe the IMAGE itself, not the scene layout.
- Every scene MUST have a components array with at least one component.
- Think Apple keynote: one powerful idea per scene, cinematic motion, premium aesthetic.
- MANDATORY: For EACH scene (except intro/outro/breathing), you MUST include a "voiceover_text" field with narration that FITS the scene duration. Missing voiceover is a plan failure. CRITICAL: at ~150 words per minute, a 5-second scene fits ~12 words (1 short sentence), a 6-second scene fits ~15 words, a 7-second scene fits ~17 words. NEVER write more words than the scene duration allows. Keep narration punchy -- one idea per scene. Skip voiceover_text for intro/outro brand asset scenes and breathing pauses.
- For IMAGE format: use ONE custom component for all content (headline, subheadline, stats, CTA button, any text). The custom component handles the entire visual composition. Do NOT use library components for images -- the custom component renders everything as one cohesive layout.
- For PRESENTATION/DECK format: treat each slide like an image. Each slide MUST use ONE custom component that handles everything (background, layout, text, icons, CTA). No library components per slide. Each slide is a self-contained visual composition.
- For VIDEO: you CAN mix library + custom components across scenes. Just follow the no-duplicate rule.
- **Interactive Scripts (for mockup/UI components):** Some library components are marked 🎬 Scriptable. For these, you can add "script" and "cursor_targets" to their data to create interactive product demo animations (cursor clicking, typing, zooming). Use scripts for product walkthroughs, UI demos, and feature showcases.

Example of a scripted chat-simulator component:
{
  "type": "chat-simulator",
  "data": {
    "platform": "slack",
    "channel": "product",
    "messages": [],
    "script": [
      { "action": "move-cursor", "target": "chat-input", "at": 0.5, "duration": 0.5 },
      { "action": "click", "target": "chat-input", "at": 1.0 },
      { "action": "type", "target": "chat-input", "text": "Show me last week's metrics", "at": 1.3, "speed": 25 },
      { "action": "move-cursor", "target": "send-button", "at": 3.5, "duration": 0.4 },
      { "action": "click", "target": "send-button", "at": 3.9 },
      { "action": "wait", "at": 4.2, "duration": 0.8 },
      { "action": "hide-cursor", "at": 5.0 }
    ],
    "cursor_targets": {
      "chat-input": { "x": "50%", "y": "90%" },
      "send-button": { "x": "92%", "y": "90%" }
    }
  },
  "z_index": 10
}

Script actions: move-cursor, click, double-click, hover, drag, type, type-delete, zoom-to, zoom-out, wait, show-element, hide-element, highlight, scroll, hide-cursor, show-cursor, parallel.
Each action needs "action" and "at" (seconds). Optional: "duration", "target" (named cursor target), "text" (for type), "scale" (for zoom-to).
When using scripts, set scene duration_seconds long enough for the full script to play (last action at + duration + 1s buffer).
Only add scripts when the scene calls for an interactive demo. Not every mockup needs a script -- static mockups are fine for feature overviews.
- Output ONLY valid JSON. No commentary.
- **COMPONENT-BASED SEQUENCES (CRITICAL):** When the user prompt mentions SPECIFIC component names from the catalog (e.g. "quotient-chat", "canva-editor", "quotient-social"), you MUST use a component-based sequence scene with those components, beats, and choreography. Do NOT regenerate these components as freeform HTML. The existing components are high-fidelity and their built-in animations will be triggered automatically at each beat.
- When a prompt asks for a "walkthrough", "demo flow", "step by step", or "continuous take" involving multiple existing components, ALWAYS use a sequence with choreography.

${SCENE_PLANNER_DESIGN_RULES}

${templateCatalogStr}

${SCENE_TEMPLATES}

${COMPOSITION_PLAYBOOK}`;

  // Inject brand asset info into the system prompt if available
  var brandAssetsSection = "";
  var guidelinesLower = (opts.brandKit.guidelines || "").toLowerCase();
  var brandAssets = opts.brandKit.assets || [];
  var backgrounds = brandAssets.filter(a => a.type === "background");
  var intros = brandAssets.filter(a => a.type === "intro");
  var outros = brandAssets.filter(a => a.type === "outro");
  var brandMusic = brandAssets.filter(a => a.type === "music");

  if (backgrounds.length) {
    brandAssetsSection += `\n\n## Brand Background Images (MANDATORY)\nThese are pre-approved brand backgrounds. PREFER these over mesh-gradient or gradient-background when a matching background exists.\n`;
    for (var bg of backgrounds) {
      brandAssetsSection += `- "${bg.name}": ${bg.url}${bg.tags?.length ? ` [tags: ${bg.tags.join(", ")}]` : ""}\n`;
    }
    brandAssetsSection += `\nTo use a brand background as a full-bleed scene background at z_index 0, use the image component:\n{ "type": "image", "data": { "src": "${backgrounds[0].url}" }, "z_index": 0 }\nOptional data props: overlay_opacity (0-1 for text readability), overlay_color, drift (true/false for ken-burns).\n`;
  }

  if (intros.length) {
    brandAssetsSection += `\n\n## Brand Intro Videos\nAvailable intro clips that can be used as the first scene of a video. Use the "video" component to play them.\n`;
    for (var intro of intros) {
      brandAssetsSection += `- "${intro.name}": ${intro.url} (${intro.duration ? intro.duration.toFixed(1) + "s" : "unknown duration"}${intro.width ? `, ${intro.width}x${intro.height}` : ""})\n`;
    }
    // Check if guidelines mandate intro usage
    var introRequired = guidelinesLower.includes("intro") && (guidelinesLower.includes("always") || guidelinesLower.includes("must") || guidelinesLower.includes("required"));
    if (introRequired) {
      brandAssetsSection += `\n⚠️ REQUIRED: Brand guidelines mandate this intro as the FIRST scene. You MUST include it.\nAdd this as scene 1:\n{ "label": "Intro", "duration_seconds": ${intros[0].duration || 5}, "components": [{ "type": "video", "data": { "src": "${intros[0].url}" }, "z_index": 0 }] }\nDo NOT skip this. Do NOT replace it with a custom component.\n`;
    } else {
      brandAssetsSection += `\nTo use a brand intro, add it as the first scene with a video component:\n{ "label": "Intro", "duration_seconds": ${intros[0].duration || 5}, "components": [{ "type": "video", "data": { "src": "${intros[0].url}" }, "z_index": 0 }] }\nAdd intros when brand guidelines specify to use them.\n`;
    }
  }

  if (outros.length) {
    brandAssetsSection += `\n\n## Brand Outro Videos\nAvailable outro clips that can be used as the last scene of a video. Use the "video" component to play them.\n`;
    for (var outro of outros) {
      brandAssetsSection += `- "${outro.name}": ${outro.url} (${outro.duration ? outro.duration.toFixed(1) + "s" : "unknown duration"})\n`;
    }
    // Check if guidelines mandate outro usage
    var outroRequired = guidelinesLower.includes("outro") && (guidelinesLower.includes("always") || guidelinesLower.includes("must") || guidelinesLower.includes("required"));
    if (outroRequired) {
      brandAssetsSection += `\n⚠️ REQUIRED: Brand guidelines mandate this outro as the LAST scene. You MUST include it.\nAdd this as the final scene:\n{ "label": "Outro", "duration_seconds": ${outros[0].duration || 5}, "components": [{ "type": "video", "data": { "src": "${outros[0].url}" }, "z_index": 0 }] }\nDo NOT skip this. Do NOT replace it with a custom component.\n`;
    } else {
      brandAssetsSection += `\nTo use a brand outro, add it as the last scene with a video component.\nAdd outros when brand guidelines specify to use them.\n`;
    }
  }

  if (brandMusic.length) {
    brandAssetsSection += `\n\n## Brand Music\nAvailable music tracks for audio.\n`;
    for (var m of brandMusic) {
      brandAssetsSection += `- "${m.name}": ${m.url} (${m.duration ? m.duration.toFixed(1) + "s" : "unknown duration"}${m.tags?.length ? `, tags: ${m.tags.join(", ")}` : ""})\n`;
    }
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

  // Inject reference image summary into system prompt
  if (opts.referenceImages?.length) {
    systemPrompt += buildReferenceImageSummary(opts.referenceImages);
    systemPrompt += "\nReference images are provided. Study them carefully and write freeform_brief descriptions that match the visual design, layout, spacing, and style shown in these references.\n";
  }

  // Inject speaker track mode instructions if applicable
  if (opts.hasSpeakerTrack) {
    systemPrompt += `\n\n## Speaker Track Mode
This video uses a speaker track -- a continuous speaker video plays as the base layer.
Scene content will overlay on top of the speaker.

For content scenes (where the speaker is visible behind):
- Use Speaker templates (S1-speaker-spotlight, S3-speaker-lowerthird) when they fit
- Content appears in a region beside the speaker, not full-screen
- Backgrounds are transparent -- the speaker video shows through

For demo/screencast scenes (where content fills the whole frame):
- The speaker appears as a small PiP circle
- Use regular templates (C7-picture-in-picture, S2-screencast-pip) or full-frame content
- Content has its own opaque background

Prefer Speaker templates over regular templates when the speaker should be visible.`;
  }

  var userPrompt = `Create a ${opts.format} project.\n\n${opts.prompt}`;

  // Build user message: multi-part with vision content if reference images exist
  var userContent: string | LLMContentPart[];
  if (opts.referenceImages?.length) {
    var refParts = buildReferenceImageParts(opts.referenceImages);
    userContent = [
      { type: "text" as const, text: userPrompt },
      ...refParts,
    ];
  } else {
    userContent = userPrompt;
  }

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ], { temperature: 0.5, maxTokens: 8192 });

  var storyboard = parseJsonResponse(raw);

  if (!storyboard.scenes || storyboard.scenes.length === 0) {
    throw new Error("Unified planner returned no scenes");
  }

  // Build a set of valid library component types for validation
  var validTypes = new Set(opts.componentCatalog.map((c: PlannedComponent) => c.type));
  // Also allow "image" which is a built-in renderer component
  validTypes.add("image");

  // Validate and normalize each scene
  for (var scene of storyboard.scenes) {
    if (!scene.components || !Array.isArray(scene.components)) {
      scene.components = [];
    }

    // Template scenes: skip component validation, the template owns the scene
    if (scene.template) {
      console.log(`  Scene "${scene.label}": using template ${scene.template}`);
      continue;
    }

    // At high creativity (>=0.7), enforce all-custom: convert any library components to custom
    // EXCEPT video components (brand intro/outro) -- those are pre-made assets, not creative content.
    if (creativity >= 0.7) {
      var isVideoScene = scene.components.length === 1 &&
        scene.components[0].type === "video" &&
        scene.components[0].data?.src;
      if (isVideoScene) {
        // Preserve video scenes as-is (brand intro/outro)
      } else {
        var hasCustom = scene.components.some((c: PlannedComponent) => c.custom);
        if (!hasCustom) {
          // No custom component -- convert the whole scene to one custom component
          // But preserve any video components (brand assets)
          var videoComps = scene.components.filter((c: PlannedComponent) => c.type === "video" && c.data?.src);
          var nonVideoComps = scene.components.filter((c: PlannedComponent) => !(c.type === "video" && c.data?.src));
          if (nonVideoComps.length > 0) {
            console.warn(`  Scene "${scene.label}": creativity=${creativity} but no custom component, converting to custom`);
            var libDescriptions = nonVideoComps
              .filter((c: PlannedComponent) => !c.custom && c.type)
              .map((c: PlannedComponent) => `${c.type}: ${JSON.stringify(c.data || {})}`)
              .join("; ");
            scene.components = [
              ...videoComps,
              {
                custom: true,
                custom_prompt: (scene.description || scene.label) + (libDescriptions ? ". Include these elements: " + libDescriptions : ""),
                z_index: 10,
              },
            ];
          }
        } else {
          // Has custom -- strip library components EXCEPT video (brand assets)
          var stripped = scene.components.filter((c: PlannedComponent) => c.custom || (c.type === "video" && c.data?.src));
          if (stripped.length < scene.components.length) {
            console.warn(`  Scene "${scene.label}": creativity=${creativity}, stripped ${scene.components.length - stripped.length} library components (all-custom mode)`);
            scene.components = stripped;
          }
        }
      }
    } else {
      // At lower creativity, validate library component types exist
      var validatedComponents: PlannedComponent[] = [];
      for (var comp of scene.components) {
        if (comp.custom) {
          validatedComponents.push(comp);
        } else if (comp.type && validTypes.has(comp.type)) {
          validatedComponents.push(comp);
        } else if (comp.type) {
          // Unknown library type -- convert to custom
          console.warn(`  Scene "${scene.label}": unknown component type "${comp.type}", converting to custom`);
          validatedComponents.push({
            custom: true,
            custom_prompt: `Render a "${comp.type}" element with data: ${JSON.stringify(comp.data || {})}. ${scene.description || ""}`,
            z_index: comp.z_index || 10,
            position: comp.position,
          });
        }
      }
      scene.components = validatedComponents;
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
  var templateCount = 0;
  for (var scene of storyboard.scenes) {
    if (scene.template) {
      templateCount++;
      continue;
    }
    for (var comp of scene.components) {
      if (comp.custom) customCount++;
      else libraryCount++;
    }
  }
  console.log(`  Unified planner: ${storyboard.scenes.length} scenes, ${templateCount} template, ${libraryCount} library, ${customCount} custom`);

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
