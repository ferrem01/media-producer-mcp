/**
 * Unified Planner
 *
 * Plans a storyboard with one codegen pipeline. For each scene, the planner
 * writes a visual brief (what the viewer experiences) and lists which library
 * components to embed. The codegen LLM receives the brief + component schemas
 * and builds the scene HTML.
 */

import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import { formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import type { CreativeBible } from "./concept-director.js";
import { SCENE_PLANNER_DESIGN_RULES } from "./design-rules.js";
import { SCENE_TEMPLATES } from "./scene-templates.js";
import { COMPOSITION_PLAYBOOK } from "./cinematography.js";
import { getStorytellingGuide } from "./design-skills.js";
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
  creativeBible?: CreativeBible;
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
  brief: string;           // visual direction (what the viewer experiences, motion verbs, depth layers)
  components: string[];    // library component types to embed, e.g. ["quotient-chat", "dashboard-kpi"]
  transition_in?: { type: string; duration_seconds: number };
  hero_image?: string;
  voiceover_text?: string;  // Narration script for this scene (TTS)
  broll_query?: string;     // when set, fetch cinematic stock footage as this scene's background
}

export interface StoryboardResult {
  name: string;
  scenes: PlannedScene[];
}

/**
 * Plan a storyboard with per-component library/custom decisions.
 */
export async function planStoryboard(opts: UnifiedPlannerOpts): Promise<StoryboardResult> {
  var catalogStr = formatCatalogForPrompt(opts.componentCatalog);

  var sceneCountGuide = opts.sceneCount
    ? `Exactly ${opts.sceneCount} scenes.`
    : "5-8 scenes (scale to content complexity).";

  var templateCatalogStr = formatTemplateCatalogForPrompt();

  var storytellingGuide = getStorytellingGuide();

  var systemPrompt = `You are a creative director planning a ${opts.format} project.

You think in visual STORIES, not slide decks. Every scene should feel like something the viewer wants to watch, not endure.

${storytellingGuide ? `## Visual Storytelling Guide\n\n${storytellingGuide}\n\n` : ""}Every scene follows the same format:

## Scene Format

Each scene has a brief (visual direction) and a list of component types from the catalog.

{
  "label": "Scene 1 - Connector Discovery",
  "duration_seconds": 5,
  "description": "User discovers and activates the connector feature",
  "brief": "A clean workspace fills the frame — warm off-white background with subtle grid lines pulsing faintly. A cursor GLIDES from below toward a plus icon at center. On click, a circular button BLOOMS outward with a soft shadow spreading beneath it. The circle MORPHS into a rounded card panel. Menu items STAGGER in from the right — each row has a thin icon, label text, and a chevron. The cursor DRIFTS to Connectors, which highlights with a warm rounded fill. BG: subtle grid with breathing glow. MG: UI card with menu items. FG: cursor with drop shadow, particle hints.",
  "components": [],
  "voiceover_text": "Discover the connector that changes everything.",
  "transition_in": { "type": "none", "duration_seconds": 0 }
}

### Writing Great Briefs
Briefs MUST be 5+ sentences with specific motion verbs, depth layers (BG/MG/FG), and choreography.
NOT "show the feature" — describe what HAPPENS frame by frame.
Think like a storyboard director. Describe what the viewer EXPERIENCES, not the layout.
Use motion verbs (SLAMS, DRIFTS, MORPHS, SNAPS, ASSEMBLES). Include BG/MG/FG layers.
Describe choreography and timing relationships between elements.

### Picking Components
List library component types from the catalog that the scene should embed.
The codegen LLM will receive the component schemas and use <component> tags.
If no library components fit, leave "components" as an empty array [].
For scenes with existing UI elements (chat panels, dashboards, code editors), always list the matching library component types.

### Background Strategy -- decide this FIRST, per scene, by INTENT
Before writing any background, decide which of FOUR strategies the moment wants. Do this BEFORE reaching for b-roll -- b-roll is ONE option, not the default for every atmospheric beat:
1. **B-roll video (broll_query)** -- real-world energy, atmosphere, a place, a human moment that should feel ALIVE and MOVING. Opener "set the world", emotional/aspirational/lifestyle beats WITH motion. Must visibly move (see B-Roll below).
2. **Generated image (hero_image)** -- a calm, composed, contemplative, or singular striking visual; a beat that should feel STILL and intentional. A photograph never reads as "broken" the way a frozen video does, so this -- NOT a slowed/static video -- is the correct tool for quiet/still/atmospheric moments. Use hero_image when you want the cinematic b-roll *feeling* (real, emotional, beautiful) but the scene should HOLD STILL.
3. **Motion graphics / mesh (animated background, the default)** -- product, UI, data, abstract, branded scenes. HTML/CSS/GSAP gradients, glow orbs, particles.
4. **Plain gradient** -- when nothing else is earned.
**DECISION GATE:** Is this beat moving or still? MOVING/kinetic/alive -> b-roll. STILL/calm/contemplative/composed -> hero_image. If you catch yourself wanting a "slow", "still", "perfectly calm", "stationary camera", "resting", or "barely moving" video, STOP -- that is a hero_image, not a broll_query. A meditative/dawn/quiet/serene opener is almost always a hero_image, NOT slow b-roll.

### B-Roll (atmospheric stock footage) -- when the beat MOVES
Once the gate above says this beat is MOVING, add a "broll_query": a SPECIFIC, cinematic stock-footage search phrase that matches the scene's mood and the brand. The clip plays as a darkened background BEHIND your content (it does not replace the foreground).
- A brand film, a product launch's emotional opener/closer, or any prompt about a feeling, place, or aspiration that should feel ALIVE wants b-roll on at least one scene. Do NOT default to a plain gradient on those moving moments -- reach for real footage.
- MOTION IS MANDATORY: b-roll is a VIDEO clip, so the clip must have clear, continuous on-screen movement -- drifting clouds, flowing or crashing water, a moving/drone/tracking camera, traffic or people in motion, rippling light, blowing grass. NEVER request a static, stationary-camera, locked-off, freeze-frame, or photo-like shot as a broll_query -- a frozen-looking video reads as a broken render. (If the beat should be still, you skipped the gate -- use hero_image.)
- Good queries are concrete, shot-like, AND describe the movement: "drone flying forward over a rugged coastline, waves crashing below, overcast", "fast timelapse of clouds rolling over mountains at dawn", "first-person driving an open mountain road at sunrise, trees rushing past", "close-up of hands typing on a laptop, fingers moving, shallow depth of field", "macro of flowing deep-blue ink swirling". Prefer normal-speed or sweeping motion; use "slow motion" only when the subject still clearly moves.
- Budget: 1-3 scenes across the video (it should still feel special, not every scene).
- Do NOT use broll_query on data/metrics, UI/feature, logo, or CTA scenes -- those need a clean generated background. Omit the field entirely on those.

### Continuous / Multi-Step Scenes (walkthroughs, demos)
There is no separate "sequence" type. A continuous multi-step moment — a
walkthrough, demo flow, step-by-step, or "single take" where elements persist and
transform — is just a normal scene with a LONGER duration (e.g. 12-30s) and a
brief that describes the progression as one continuous motion. Write the brief as
an ordered flow (e.g. "chat panel SLIDES left as the editor DRIFTS in from the
right, then both resolve into the published post"), list the library components
involved, and the codegen LLM will choreograph it on one master timeline with
labeled steps (elements morph/move rather than disappear). Set transition_in to
"none" for these so the take stays unbroken.

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
      "brief": "A dramatic hero reveal — huge 120px typography saying 'QUOTIENT' SLAMS in from below with SplitText per-character animation (chars stagger 0.03s, back.out ease). Background uses brand colors with ambient glow orbs in the accent color drifting slowly. Subtitle at 24px FADES in below the headline. Floating particles in background add depth. BG: gradient with glow orbs. MG: subtitle text. FG: headline with particle hints.",
      "components": [],
      "voiceover_text": "Introducing Quotient. The future of demand generation.",
      "broll_query": "abstract flowing deep-blue and violet ink in slow motion, macro, dark background",
      "transition_in": { "type": "none", "duration_seconds": 0 }
    },
    {
      "label": "Scene 2 - Key Stats",
      "duration_seconds": 4,
      "description": "Show impressive metrics with animated stat cards",
      "brief": "Two stat cards STAGGER in from below — first '340% ROI Increase' lands with a bounce, then '2.5M Users Reached' follows 0.3s later. Each card has a large animated counter that rolls up to its final number. Subtle gradient background with brand colors. Cards have rounded corners with soft shadows. BG: gradient. FG: stat cards with counter animations.",
      "components": ["stat-card"],
      "transition_in": { "type": "slide-up", "duration_seconds": 0.5 }
    },
    {
      "label": "Scene 3 - Quiet Moment",
      "duration_seconds": 5,
      "description": "A still, contemplative beat that should HOLD STILL (uses a generated image, not a video)",
      "brief": "A serene, composed beat. The hero_image fills the frame as a deliberate still; a single line of 32px text FADES in slowly over it. BG: hero image. FG: one calm line of copy.",
      "components": [],
      "voiceover_text": "Find your calm.",
      "hero_image": "a perfectly still misty mountain lake at dawn, soft violet and amber light, mirror-like reflection, serene and contemplative, cinematic photograph",
      "transition_in": { "type": "blur-crossfade", "duration_seconds": 0.6 }
    }
  ]
}

## Rules

- ${sceneCountGuide}
- **CONTINUOUS-TAKE OVERRIDE (takes priority over the scene count above):** If the prompt asks for a "walkthrough", "demo", "demo flow", "step by step", "continuous take", "single take", "one take", or any unbroken multi-step flow where elements should persist and transform, output **EXACTLY ONE scene** spanning the full requested duration (12-30s) -- do NOT split it into multiple scenes. Its brief must describe the whole flow as an ordered progression (step 1 → step 2 → step 3 …, each as motion: SLIDES, MORPHS, ASSEMBLES), set transition_in to "none", and list every library component the flow touches. The codegen LLM lays it all out on one master timeline with persistent, transforming elements. A walkthrough split across scenes reads as a slideshow and is a plan failure.
- B-ROLL: if the prompt is a brand film, or has an emotional/aspirational/lifestyle opener or closer, or any "feeling / place / human moment" scene, you MUST add a "broll_query" (a specific cinematic stock-footage phrase) to at least one such scene -- see the B-Roll section. Don't default those moments to a flat gradient. (Skip b-roll entirely for pure data/UI/feature/logo/CTA videos.)
- First scene: transition "none" or omit transition_in.
- Valid transitions: crossfade, blur-crossfade, wipe-left, wipe-right, slide-up, slide-down, iris, morph-wipe, zoom-through, glitch-cut, scale-rotate, curtain, shader-crosswarp, shader-ripple, shader-radial, shader-directional-warp, shader-burn, shader-chromatic, shader-lens-distortion, none.
- SHADER transitions (shader-*) use WebGL for premium visual effects. Use them for hero transitions between key scenes. shader-crosswarp: warped crossfade, shader-ripple: ripple wave, shader-radial: radial wipe, shader-directional-warp: directional warp morph, shader-burn: warm burn blend, shader-chromatic: RGB split aberration, shader-lens-distortion: gravitational lens. Use 1-3 shader transitions per video for maximum impact. Do not overuse.
- VARY scene types: don't repeat the same layout. Mix hero text, product demos, stats, visual metaphors, grids, CTAs.
- Never have two identical layout types in a row.
- For library components: use the EXACT type name from the Available Components catalog. Do not abbreviate or shorten names. Fill ALL required data fields. Use realistic content, not placeholder text.


- For custom components: custom_prompt must be 3-5 sentences with SPECIFIC visual direction (exact sizes, colors, animation names, layout positions). EXPLICITLY STATE what content the custom component should render and what other library components in the scene already handle.
- hero_image is the tool for an INTENTIONAL STILL: a calm/composed/atmospheric beat that wants a real, cinematic visual but should hold still rather than move. It is the correct alternative to a "slow" or "still" b-roll video (a photo looks deliberate; a frozen video looks broken). Reach for it whenever a scene wants the b-roll feeling but stillness -- typically 0-2 per video, not every scene. Most UI/data/branded scenes should still rely on HTML/CSS/GSAP visuals. Skip for: stats, code demos, CTAs, dashboards, lists, logo scenes.
- hero_image and broll_query are MUTUALLY EXCLUSIVE on a single scene -- pick one (moving footage OR a still image), never both.
- hero_image prompts describe the IMAGE itself, not the scene layout.
- Every scene MUST have a components array with at least one component.
- Think Apple keynote: one powerful idea per scene, cinematic motion, premium aesthetic.
- MANDATORY: For EACH scene (except intro/outro/breathing), you MUST include a "voiceover_text" field with narration that FITS the scene duration. Missing voiceover is a plan failure. CRITICAL: at ~150 words per minute, a 5-second scene fits ~12 words (1 short sentence), a 6-second scene fits ~15 words, a 7-second scene fits ~17 words. NEVER write more words than the scene duration allows. Keep narration punchy -- one idea per scene. Skip voiceover_text for intro/outro brand asset scenes and breathing pauses.
- For IMAGE format: write a comprehensive brief covering the entire visual composition. List components only if library UI elements fit.
- For PRESENTATION/DECK format: treat each slide as a self-contained visual composition. Write a detailed brief per slide.
- For VIDEO: write rich briefs per scene and list matching library components for UI elements.
- **Interactive Scripts:** Some library components are 🎬 Scriptable. Mention scripting needs in the brief and the codegen LLM will handle the details.
- Output ONLY valid JSON. No commentary.
- When a prompt asks for a "walkthrough", "demo flow", "step by step", or "continuous take" involving multiple existing components, make ONE longer scene (12-30s) with a progression-style brief that lists those components (see "Continuous / Multi-Step Scenes" above) rather than several short scenes.

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

  // Inject the brand's resolved THEME so scenes MATCH the brand instead of
  // defaulting to dark. A light brand must render light -- inverting it (using
  // the brand's dark ink as a background) is the #1 "looks like AI" giveaway.
  {
    const light = isLightBrand(opts.brandKit);
    const c = opts.brandKit.colors;
    systemPrompt += `\n\n## Brand Theme (MATCH THIS -- do NOT default to dark)\n`;
    systemPrompt += `This brand is ${light ? "LIGHT" : "DARK"}. background=${c?.background}, text=${c?.text}, primary=${c?.primary}, accent=${c?.accent}.\n`;
    if (light) {
      systemPrompt += `This is a LIGHT, airy, premium aesthetic -- think Linear / Stripe / Notion / Apple light mode -- NOT a dark cinematic look.\n`;
      systemPrompt += `- Scene and mesh-gradient backgrounds MUST be built from the brand's LIGHT colors: base ${c?.background}, with subtle ${c?.surface} and FAINT ${c?.primary}/${c?.accent} tints. Soft gradient washes on light -- never a dark base.\n`;
      systemPrompt += `- ${c?.text} is the brand's TEXT color (dark ink). Use it for TEXT ONLY. It must NEVER be a background or mesh-gradient base color -- using a dark color as the background inverts the brand and is the #1 "looks like AI slop" giveaway.\n`;
      systemPrompt += `- Glow orbs, radial blooms, and "light sources in the dark" are DARK-theme devices -- do NOT use them. For light scenes use soft color washes, a subtle grid, generous whitespace, crisp shadows, and ${c?.primary} accents.\n`;
      systemPrompt += `- Cards/panels on light backgrounds need a solid ${c?.surface} fill or a 1px border + soft shadow to be visible (glassmorphism only works on dark).\n`;
    } else {
      systemPrompt += `Build scenes on the brand's dark background (${c?.background}) with light text (${c?.text}); glow orbs and blooms are appropriate here.\n`;
    }
  }

  // Inject reference image summary into system prompt
  if (opts.referenceImages?.length) {
    systemPrompt += buildReferenceImageSummary(opts.referenceImages);
    systemPrompt += "\nReference images are provided. Study them carefully and write brief descriptions that match the visual design, layout, spacing, and style shown in these references.\n";
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
  var validTypes = new Set(opts.componentCatalog.map((c: ComponentCatalogEntry) => c.type));
  validTypes.add("image");

  // Validate and normalize each scene
  for (var scene of storyboard.scenes) {
    // Ensure components is a string array
    if (!scene.components || !Array.isArray(scene.components)) {
      scene.components = [];
    }
    // Normalize: if LLM returned old-style objects, extract type names
    scene.components = scene.components
      .map((c: any) => typeof c === "string" ? c : (c.type || ""))
      .filter((t: string) => t.length > 0);

    // Filter to valid component types only
    var validated = scene.components.filter((t: string) => validTypes.has(t));
    if (validated.length < scene.components.length) {
      var removed = scene.components.filter((t: string) => !validTypes.has(t));
      console.warn(`  Scene "${scene.label}": removed unknown component types: ${removed.join(", ")}`);
    }
    scene.components = validated;

    // Ensure brief exists
    if (!scene.brief) {
      scene.brief = scene.description || scene.label || "";
    }
  }

  var componentHints = 0;
  for (var scene of storyboard.scenes) {
    componentHints += scene.components.length;
  }
  console.log(`  Unified planner: ${storyboard.scenes.length} scenes, ${componentHints} component hints`);

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
