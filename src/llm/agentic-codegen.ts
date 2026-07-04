/**
 * Agentic Scene Codegen
 *
 * Multi-turn agentic loop for scene generation. The LLM gets tools
 * to search and read our component library, studies relevant
 * references, then writes the scene HTML. Like Claude Code reading files
 * before writing code.
 */

import {
  callLLMAgentic,
  type LLMConfig,
  type LLMMessage,
  type LLMTool,
  type LLMContentPart,
} from "./client.js";
import { buildComponentCatalog, type ComponentCatalogEntry } from "./catalog.js";
// Component discovery is handled by the storyboard builder. The codegen LLM receives schemas in the spec.
// import { SCENE_TEMPLATES, TEMPLATES_DIR } from "./template-catalog.js";
import { getDesignSkills } from "./design-skills.js";
import type { BrandKit, Canvas, ReferenceImage } from "../core/types.js";
import type { Treatment } from "./creative-director.js";
import {
  buildReferenceImageParts,
  buildReferenceImageSummary,
} from "./reference-images.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTS_ROOT = path.resolve(__dirname, "..", "components");

// ── Types ──

export interface AgenticCodegenOpts {
  sceneSpec: string;
  sceneLabel: string;
  sceneDescription: string;
  sceneDuration: number;
  sceneIndex: number;
  totalScenes: number;
  prompt: string;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  /** URL of a b-roll stock clip to place as this scene's full-bleed video background. */
  brollVideoUrl?: string;
  /** URL of a generated hero image to use as this scene's full-bleed still background. */
  heroImageUrl?: string;
  critiqueFeedback?: string;
  referenceImages?: ReferenceImage[];
  treatment?: Treatment;
  /** Structured element inventory from the storyboard -- finish_design
   *  statically verifies every element's copy is present in the template. */
  elements?: Array<{ name: string; kind: string; content: string; motion?: string }>;
}

// ── Tool Definitions ──

// Incremental submission: NEVER ask for the whole scene document in one tool
// call (the failure class that truncated a beats-heavy scene mid-tag). Each
// tool call only needs to hold ONE section, and a long GSAP timeline can be
// built up across several append_script calls -- the same pattern Claude Code
// uses to write a large file (Write once, then many small Edits) rather than
// emitting the entire thing in a single turn.
const TOOLS: LLMTool[] = [
  {
    name: "write_template",
    description: "Write the scene's <template> section: the HTML markup, including any <component> tags. Call this ONCE with the complete markup (just the inner content -- do not include the <template> tags themselves).",
    input_schema: {
      type: "object",
      properties: { html: { type: "string", description: "HTML markup for inside <template>...</template>" } },
      required: ["html"],
    },
  },
  {
    name: "write_style",
    description: "Write the scene's <style scoped> section: all CSS. Call this ONCE with the complete stylesheet (just the inner content -- do not include the <style> tags themselves).",
    input_schema: {
      type: "object",
      properties: { css: { type: "string", description: "CSS for inside <style scoped>...</style>" } },
      required: ["css"],
    },
  },
  {
    name: "write_script",
    description: "Write (or restart) the scene's <script> section -- the createTimeline(el, data, ctx) function and any helpers (just the inner content -- do not include <script> tags). For a scene with MANY beats, write the setup plus the first beat or two here, then call append_script repeatedly to add the rest, ONE OR TWO BEATS AT A TIME. Never try to fit an entire long multi-beat timeline in a single call.",
    input_schema: {
      type: "object",
      properties: { js: { type: "string", description: "JavaScript for inside <script>...</script>" } },
      required: ["js"],
    },
  },
  {
    name: "append_script",
    description: "Append more JavaScript to the END of the <script> section already written by write_script/append_script -- use this to continue a long GSAP timeline across multiple calls (e.g. one call per remaining beat) instead of writing it all at once.",
    input_schema: {
      type: "object",
      properties: { js: { type: "string", description: "JavaScript to append immediately after everything written so far" } },
      required: ["js"],
    },
  },
  {
    name: "finish_design",
    description: "DESIGN PHASE terminal: call when the STATIC design (template + style) is complete -- every element fully dressed with its real content, styled in its FINAL RESTING state. Validates the design (all inventory copy present, color discipline) and LOCKS it; the animation phase follows. No script exists yet at this point.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "finish_scene",
    description: "ANIMATION PHASE terminal: call when write_script (plus any append_script calls) is done and the timeline is complete. This assembles and validates the final document.",
    input_schema: { type: "object", properties: {} },
  },
  // Edit tools -- the Claude Code Write-then-Edit pattern. During REVISION
  // (critique feedback on an already-built scene) the model patches the banked
  // sections with minimal exact-match replacements instead of re-emitting whole
  // sections: a contrast fix is ~20 output tokens instead of a 6k-token rewrite.
  {
    name: "edit_template",
    description: "Replace ONE exact occurrence of `search` with `replace` in the template (HTML) section you already wrote. `search` must match the existing text EXACTLY (including whitespace) and exactly once -- add surrounding context if it matches more than once. Use for minimal, targeted revisions; use write_template only when the whole section must change.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Exact existing text to find (must match exactly once)" },
        replace: { type: "string", description: "Replacement text" },
      },
      required: ["search", "replace"],
    },
  },
  {
    name: "edit_style",
    description: "Replace ONE exact occurrence of `search` with `replace` in the style (CSS) section you already wrote. Same exact-match rules as edit_template.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Exact existing text to find (must match exactly once)" },
        replace: { type: "string", description: "Replacement text" },
      },
      required: ["search", "replace"],
    },
  },
  {
    name: "edit_script",
    description: "Replace ONE exact occurrence of `search` with `replace` in the script (JavaScript) section you already wrote. Same exact-match rules as edit_template.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Exact existing text to find (must match exactly once)" },
        replace: { type: "string", description: "Replacement text" },
      },
      required: ["search", "replace"],
    },
  },
];

/** A resumable codegen conversation: the full message history plus the banked
 *  template/style/script sections. Returned by generateSceneAgentic and fed
 *  back to reviseSceneInSession so critique revisions are small in-context
 *  edits (with the spec + the model's own build reasoning still in the
 *  prompt-cached prefix) instead of context-blind full regenerations. */
export interface CodegenSession {
  messages: LLMMessage[];
  parts: { template: string; style: string; script: string };
}

// ── Tool Implementations ──

let _componentCatalog: ComponentCatalogEntry[] | null = null;

async function executeReadSource(
  name: string,
  _kind?: string,
): Promise<string> {
  // Find component by type name
  // Walk component directories to find the matching .component.html
  try {
    var categories = await fs.readdir(COMPONENTS_ROOT, {
      withFileTypes: true,
    });
    for (var catDir of categories) {
      if (!catDir.isDirectory() || catDir.name === "shared") continue;
      var catPath = path.join(COMPONENTS_ROOT, catDir.name);
      var files = await fs.readdir(catPath);
      var htmlFile = files.find(
        (f) =>
          f === `${name}.component.html` ||
          f.toLowerCase() === `${name.toLowerCase()}.component.html`,
      );
      if (htmlFile) {
        var filePath = path.join(catPath, htmlFile);
        var source = await fs.readFile(filePath, "utf-8");

        // Also try to load the schema for a data example
        var schemaFile = files.find(
          (f) =>
            f === `${name}.schema.json` ||
            f.toLowerCase() === `${name.toLowerCase()}.schema.json`,
        );
        var schemaInfo = "";
        if (schemaFile) {
          try {
            var schemaPath = path.join(catPath, schemaFile);
            var schemaRaw = await fs.readFile(schemaPath, "utf-8");
            var schema = JSON.parse(schemaRaw);
            schemaInfo = `\n\n# DATA SCHEMA (use these fields in your <component> data attribute):\n${JSON.stringify(schema.data || schema.properties || {}, null, 2)}`;
          } catch {
            // Schema parse failed, skip
          }
        }

        return `# Component: ${name}\n# Category: ${catDir.name}\n# File: ${catDir.name}/${htmlFile}\n#\n# HOW TO USE:\n#   <component type="${name}" data='{"field1": "value1", ...}' />\n#\n# Read the createTimeline(el, data, ctx) function to see what data fields are used.\n# Fill the data attribute with your scene's actual content.${schemaInfo}\n\n${source}`;
      }
    }
    return `Component "${name}" not found. Check the component type name in the spec.`;
  } catch (e: any) {
    return `Error reading component: ${e.message}`;
  }
}

export function executeSubmitScene(html: string): { valid: boolean; html: string; error?: string } {
  var hasTemplate = /<template[^>]*>/i.test(html);
  var hasStyle = /<style[^>]*>/i.test(html);
  var hasScript = /<script[^>]*>/i.test(html);

  if (!hasTemplate || !hasScript) {
    return {
      valid: false,
      html,
      error: `Missing required sections: ${!hasTemplate ? "<template> " : ""}${!hasScript ? "<script> " : ""}. Resubmit with all three sections: <template>, <style scoped>, and <script>.`,
    };
  }

  // Warn but accept if no style
  if (!hasStyle) {
    console.warn("  [agentic] submit_scene: no <style> section (acceptable but unusual)");
  }

  // Static JS syntax gate: parse (without executing) the script section. A
  // syntax error here previously shipped silently -- nothing between codegen
  // and the BROWSER parsed the script, so a malformed edit/patch surfaced as
  // a render-worker ready-timeout ("Unexpected token") on a scene every other
  // gate had passed. new Function() parses declarations as a function body,
  // which is exactly how the runtime evals the section.
  var scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    try {
      new Function(scriptMatch[1]);
    } catch (e: any) {
      return {
        valid: false,
        html,
        error: `The <script> section has a JavaScript SYNTAX error and cannot run: ${e.message}. Re-read the script you wrote (especially around any recent edit/append boundaries -- unbalanced braces, a statement spliced mid-expression) and fix it, then finish again.`,
      };
    }
  }

  // Reject remote media URLs. Every legitimate asset (b-roll, hero image, logo)
  // is handed to the agent as a LOCAL /assets/... path; a remote http(s) media
  // URL means the agent invented one (e.g. a Pexels clip from training) when no
  // local clip was provided. Remote media breaks render -- a streaming <video>
  // stalls networkidle, dead URLs 403 -- so it must never reach the scene HTML.
  // (Font/GSAP CDN URLs have no media extension and are unaffected.)
  var remoteMedia = html.match(/https?:\/\/[^\s"'`)<>]+\.(?:mp4|webm|mov|m4v|ogv|jpg|jpeg|png|webp|gif|avif)(?:[?#][^\s"'`)<>]*)?/i);
  if (remoteMedia) {
    return {
      valid: false,
      html,
      error: `Remote media URL not allowed: "${remoteMedia[0].slice(0, 80)}". Never reference external URLs for video or images. Use ONLY the local asset paths provided in the spec (the b-roll/hero/logo /assets/... paths). If this scene was given no footage or image, do NOT invent one -- compose the background with brand colors, gradients, and typography instead. Resubmit.`,
    };
  }

  return { valid: true, html };
}

// ── System Prompt Builder ──

function buildAgenticSystemPrompt(opts: AgenticCodegenOpts): string {
  var designSkills = getDesignSkills();
  var brandVarsContext = buildBrandContext(opts.brandKit);

  return `You are an expert motion graphics designer creating a single video scene as HTML+CSS+GSAP.
Your output will be captured frame-by-frame by Playwright at ${opts.canvas.width}x${opts.canvas.height} and encoded to video.

## NON-NEGOTIABLES (these override everything below — and any mood words in the visual notes)

These are the failures that make a scene look broken. Violate none of them.

1. **LEGIBILITY OVER MOOD — INCLUDING SURFACES.** The visual notes' mood words — "muted", "desaturated", "faded", "gray-tinted", "tired", "the color of exhaustion" — describe SATURATION and fill color, NEVER contrast or visibility. This applies to CONTAINERS as much as text: every card / window / panel / surface must be a clearly distinct VALUE from the page background — pull from the brand surface color, or shift its lightness at least ~8% off the background — and carry a visible border (≥1.5px in a mid-value color, NOT a 4–8%-opacity hairline) and a real multi-layer shadow. A panel that is only a hair lighter/darker than the background is INVISIBLE and is the #1 failure. Body/label text ≥4.5:1 contrast; headlines and key shapes read instantly. If a viewer would squint to find a panel's edges or read a word, the scene has FAILED.

2. **FILL THE WHOLE FRAME — NO DEAD ZONES.** Content must be distributed across the entire ${opts.canvas.width}×${opts.canvas.height} canvas, not pooled in one region. No empty band taller than ~25% of the frame height, and no whole quadrant left bare. Fill ≥70% of the frame. AND when the visual notes say dense / overlapping / colliding / stacked / chaotic, the elements MUST actually overlap and crowd each other — tidy, evenly-spaced, non-touching islands are a failure even if they're large. If it says one bold hero, make it genuinely big and centered with intent. Timid, half-empty, clustered-in-a-corner layouts fail.

3. **REAL CONTENT, NEVER SKELETONS.** UI windows, cards, dashboards, and panels must contain believable, specific content — real-looking headlines, rows, labels, metrics drawn from the product. Empty placeholder bars and wireframe skeletons read as unfinished and are a failure.

4. **RENDER EVERY ELEMENT THE VISUAL NOTES NAME.** If the visual notes name a concrete element or beat — a spark, a cursor, a glow, a connecting line, a badge, a specific transition — it MUST appear in the scene. You decide HOW it looks and moves, but you may NOT silently drop a specified element. Missing called-for elements is a failure.

5. **MAKE THE EMOTION VISIBLE.** The scene's Purpose names a feeling (overwhelm, relief, momentum, confidence). That feeling must be legible in the composition and the motion — not merely labeled. Chaos must look chaotic; calm must look calm.

6. **BRAND THEME IS NOT NEGOTIABLE.** This brand is ${isLightBrand(opts.brandKit) ? "LIGHT" : "DARK"}. ${isLightBrand(opts.brandKit) ? "Every composed surface (root background, cards, panels) renders LIGHT with DARK text -- no exceptions." : "Every composed surface renders DARK with LIGHT text -- no exceptions."} Visual notes and creative-direction "color mood" language ("night", "dawn", "dark warm background", "glow orbs on black", "moody") describe LIGHTING and ACCENT COLOR ONLY -- they NEVER license inverting the base theme. The single exception is real footage/photo backgrounds (see FOOTAGE-FORWARD / HERO-IMAGE sections below if present) -- a composed CSS background is not footage and must obey the brand theme. If you catch yourself writing a dark hex for a ${isLightBrand(opts.brandKit) ? "root background or card fill" : "text color"} on this brand, stop and re-read this rule -- that is the single most common failure in this system.

Design for a viewer watching a finished video, not a designer reading a spec.

## Component Tags (USE THESE FIRST)

Your scene MUST use <component> tags for any UI element that exists in the component library.
Do NOT rebuild from scratch what already exists. Writing custom HTML for a library component is a bug.

### How It Works
1. Read the component schemas from the spec
2. Embed components using \`<component type="name" data='{...}' />\` with the data fields from the schema
3. Write custom code only for layout, transitions, backgrounds, and elements with no library match

The result is HYBRID: <component> tags for known UI + custom code for everything else.

### Syntax
\`\`\`html
<component type="quotient-chat" data='{
  "conversation_title": "My Chat",
  "messages": [
    { "role": "user", "text": "Hello" },
    { "role": "agent", "text": "Hi there!" }
  ]
}' />
\`\`\`

### Rules
- The \`type\` must match a component listed in the spec
- The \`data\` attribute is a JSON string — fill fields from the schema provided in the spec
- Components auto-generate internal GSAP timelines
- Access component timelines via: ctx.getComponentTimeline('comp_0')
- **WIRE EVERY COMPONENT YOU EMBED.** For each <component> in your template, you MUST call \`tl.add(ctx.getComponentTimeline('comp_N'), <time>)\` in createTimeline. If you don't, the block's animation -- including ambient background motion -- never plays and the frame sits dead-static. This applies to backgrounds too (gradient-background, mesh-gradient, depth-blur all have ambient loops): wire them at t=0.
- Component IDs are auto-assigned: comp_0, comp_1, comp_2... in DOM order
- You can add \`class\` and \`style\` attributes to the <component> tag for positioning
- Chat scenes MUST use a chat component. Dashboard scenes MUST use dashboard components.
- Code editor scenes MUST use a code editor component. Chart scenes MUST use chart components.

### Timeline Integration
\`\`\`javascript
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();
  tl.add(ctx.getComponentTimeline('comp_0'), 0);    // chat animates from t=0
  tl.add(ctx.getComponentTimeline('comp_1'), 5);    // editor animates from t=5
  gsap.set('[data-comp-id="comp_1"]', { opacity: 0 });
  tl.to('[data-comp-id="comp_1"]', { opacity: 1, duration: 0.8 }, 5);
  return tl;
}
\`\`\`

### Example: Hybrid Scene (component tags + custom code)
\`\`\`html
<template>
  <div class="scene">
    <div class="bg"></div>
    <div class="left-panel">
      <component type="quotient-chat" data='{
        "conversation_title": "Q3 Campaign",
        "messages": [
          {"role": "user", "text": "Write a LinkedIn post about our Q3 results"},
          {"role": "agent", "text": "Here is a draft post highlighting your Q3 growth metrics..."}
        ],
        "user_avatar": "MF",
        "mode": "panel"
      }' />
    </div>
    <div class="right-panel">
      <component type="code-editor" data='{
        "filename": "post.html",
        "language": "html",
        "code": "<article>\\n  <h2>Q3 Results</h2>\\n</article>"
      }' />
    </div>
    <div class="beam"></div>
  </div>
</template>
<style scoped>
  .scene { width: 100%; height: 100%; position: relative; overflow: hidden; }
  .bg { position: absolute; inset: 0; background: linear-gradient(135deg, #0f172a, #1e1b4b); }
  .left-panel { position: absolute; left: 40px; top: 40px; width: 45%; height: calc(100% - 80px); }
  .right-panel { position: absolute; right: 40px; top: 40px; width: 45%; height: calc(100% - 80px); opacity: 0; }
  .beam { position: absolute; top: 50%; left: 47%; width: 6%; height: 2px; background: #818cf8; opacity: 0; }
</style>
<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    tl.add(ctx.getComponentTimeline('comp_0'), 0);
    tl.to(el.querySelector('.beam'), { opacity: 1, scaleX: 2, duration: 0.4 }, 3.5);
    tl.to(el.querySelector('.right-panel'), { opacity: 1, duration: 0.6 }, 4);
    tl.add(ctx.getComponentTimeline('comp_1'), 4.5);
    return tl;
  }
</script>
\`\`\`

Notice: quotient-chat and code-editor use <component> tags, and BOTH timelines are wired (comp_0 at 0, comp_1 at 4.5). Only the background, layout, and beam are custom.

## Your Process

1. READ the spec below — it includes which components to use and their data schemas
2. BUILD your scene HTML using <component> tags for every listed component, filling data from the provided schemas
3. WRITE custom code around the components: layout, positioning, backgrounds, transitions, decorative elements
4. DESIGN first: write_template + write_style with EVERY element fully dressed in its final resting state, then finish_design (locks the design)
5. ANIMATE second: write_script (+ append_script per beat) against the locked design, then finish_scene

You have everything you need in the spec. Go straight to writing.

## Two phases: DESIGN, then ANIMATION (like a real studio)

PHASE 1 -- DESIGN (set dressing). Build the complete STATIC scene: write_template (all
markup, every inventoried element present with its REAL content -- an empty card is a
rejected design) and write_style (all CSS, styling everything in its FINAL RESTING state
-- how the scene looks at its held moment, fully composed and legible). Do NOT hide
elements with opacity:0 or off-screen positions in CSS; entrances happen in the animation
phase via gsap.from(). When the design is complete, call finish_design -- it verifies all
inventory copy is present and color discipline holds, then LOCKS the design.

PHASE 2 -- ANIMATION (the timeline). The design is locked; template/style edits are
rejected. Write createTimeline implementing the beat sheet: gsap.set()/gsap.from() at
time 0 to establish initial states, then the beats in order with tl.addLabel per beat.
Write the setup plus the first beat or two with write_script, then continue ONE OR TWO
BEATS per append_script call. Never the whole multi-beat timeline in one call. Call
finish_scene when the timeline is complete -- it assembles and validates the document.

Batching a FEW small calls into one response is fine (e.g. write_template + write_style).
What you must NEVER do is put an entire phase's output in one response -- a response's
combined output across ALL its tool calls is what risks truncation.

## COLOR DISCIPLINE (statically ENFORCED -- finish_scene rejects violations)

Text colors are TOKENS ONLY. Every \`color:\` (and \`-webkit-text-fill-color:\`) declaration
must use a brand var -- raw hex/rgb/named colors are rejected because you cannot verify
contrast by eye and low-contrast text is the #1 recurring defect. The vocabulary covers
every legitimate case:

- var(--mp-color-text) / var(--mp-color-text-muted) -- text on the scene background or on
  var(--mp-color-surface) cards. This is the DEFAULT; when in doubt, use these.
- var(--mp-color-on-dark) / var(--mp-color-on-dark-muted) -- ONLY inside a panel you
  explicitly styled dark (e.g. a terminal/code window on a light scene).
- var(--mp-color-on-accent) / var(--mp-color-on-primary) -- text sitting on an accent or
  primary fill (buttons, badges, highlighted chips).
- transparent / inherit / currentColor -- allowed (e.g. gradient text via background-clip).
- Do NOT de-emphasize text with opacity (any opacity below 0.85 on a rule that sets a text
  color is rejected) -- opacity multiplies the token's validated contrast back down. Use
  var(--mp-color-text-muted) / var(--mp-color-on-dark-muted) at full opacity instead.

Decorative properties (backgrounds, gradients, borders, shadows, glows) remain free -- this
rule is about TEXT legibility, not your palette. Surfaces still need real separation from
the backdrop (fill difference, border, shadow), per the design rules below.

## Design Skills (FOLLOW THESE RULES)

${designSkills}

## Output Format

Once assembled from write_template + write_style + write_script/append_script, the scene
is a single .scene.html document with three sections -- this is the SHAPE of the content
you write into each tool call (do not include the outer tags yourselves, just the content
that goes inside them):

\`\`\`html
<template><!-- HTML with <component> tags and custom elements --></template>
<style scoped>/* CSS for layout, backgrounds, custom elements */</style>
<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    // Wire component timelines and add custom animations
    tl.add(ctx.getComponentTimeline('comp_0'), 0);
    return tl;
  }
</script>
\`\`\`

## Technical Rules

1. The createTimeline(el, data, ctx) function:
   - el: the component's root DOM element
   - data: JSON data object
   - ctx: { duration, fps, canvas: {width, height}, motion, beats }
   - ctx.beats: the scene's beat timeline as [{label, start, end}] in seconds ([] when the scene has no beats). When the spec includes a Beat Sheet, anchor each beat's animations at its ctx.beats start time and call tl.addLabel('beat_N', start) for each.
   - Must return a GSAP timeline (NOT paused)
2. Canvas: ${opts.canvas.width}x${opts.canvas.height}px. ALL content MUST be visible.
3. GSAP is available globally. You can use: gsap.to(), gsap.from(), gsap.fromTo(), gsap.set(), gsap.timeline().
4. Use 'var' for all variable declarations in component code (not const/let).
5. Load Google Fonts in <template> with <link> tags.
6. Build-Breathe-Resolve: stagger entrances (0-30%), hold for readability (30-70%), exit/transition (70-100%).
7. Scene duration: ${opts.sceneDuration}s. Time your animations to fit.
8. Lottie animations are available via CDN (lottie-web 5.12.2). Use them for complex icon animations, micro-interactions, and decorative elements. Always sync to the GSAP timeline with goToAndStop() -- never use autoplay. See the design skills doc for patterns.
9. Do NOT use ghost/watermark text (large semi-transparent background words like "DATA", "CONNECT"). Use radial glows, grid patterns, accent lines, or grain for background texture instead.
10. All text MUST have correct spacing. Never concatenate words.
11. Use gsap.from() for entrances (elements arrive at their CSS position). IMPORTANT: set initial CSS to the FINAL state (opacity: 1, transform: none). Let GSAP animate FROM the hidden state.
12. CONTINUITY: build ONE master GSAP timeline for the whole scene. For multi-step scenes, keep elements PERSISTENT -- morph/move/transform them across the scene using tl.addLabel('step-name', time) markers, rather than removing and rebuilding the DOM between steps. Aim for one continuous camera-take feel that BUILDS, BREATHES, then RESOLVES across the duration.
13. NO RUNTIME ERRORS: the timeline is seeked to arbitrary times during render, which FIRES every callback. Any element you reference MUST exist. NEVER call .textContent/.style/.classList or pass a target to gsap on a querySelector/getElementById result without confirming it is non-null first (e.g. \`var b = el.querySelector('#badge'); if (b) b.textContent = n;\`). Only animate selectors that match elements actually present in your <template>. A scene that throws while seeking is a failure.

${brandVarsContext}
${opts.referenceImages?.length ? buildReferenceImageSummary(opts.referenceImages) + "\nReference images show the target visual design. Your HTML+CSS should match the layout, colors, typography, spacing, and component hierarchy shown in these references.\n" : ""}
## This Scene
${opts.brollVideoUrl ? `
## FOOTAGE-FORWARD SCENE (place real video b-roll as this scene's background)
This scene has a real cinematic video clip that MUST be the full-bleed background -- a film establishing shot, the hero of the scene. YOU place it (just like any video).
- THEME EXCEPTION: the LIGHT-brand "light background / dark text only" rule above is for COMPOSED surfaces. Here the background is real footage, so white/near-white text over a scrim is CORRECT and expected -- it is NOT a theme violation. Do not force dark text or a light background onto the footage.
- Place it as the FIRST element in your <template>, filling the frame:
  \`<video class="mp-broll" src="${opts.brollVideoUrl}" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;"></video>\`
  (Keep the src EXACTLY as given -- the system resolves it to the real file at render time and an http URL in preview.)
- DO NOT add any OTHER full-screen background (NO gradient-background, mesh, particles, grids, glow orbs) -- the footage IS the background. Keep your root container transparent.
- Keep the foreground MINIMAL: a headline/tagline and at most one small supporting element. Lots of negative space. Place foreground content at z-index:2+.

### TEXT OVER VIDEO -- legibility treatment is MANDATORY
The footage MOVES, so the brightness behind the text changes every frame. You CANNOT rely on the clip being dark/light enough where the words happen to sit -- part of the text will wash out on some frames. Every text run over the video MUST have a backing that travels with it and reads on EVERY frame. Pick ONE of these three techniques (whichever fits the look) and execute it fully:

  (A) ANCHORED SCRIM -- a contained dark gradient behind the text block (NOT a thin global top/bottom vignette). Size it to the caption with generous padding so the darkening extends ~1 line beyond the text on all sides. e.g. a div at z-index:1 positioned where the text sits:
      \`background: radial-gradient(ellipse at center, rgba(0,0,0,0.66) 0%, rgba(0,0,0,0.45) 55%, transparent 80%);\`

  (B) FROSTED / SOLID CAPTION PANEL -- the text lives inside a card directly behind it:
      \`background: rgba(10,14,30,0.58); backdrop-filter: blur(10px); border-radius: 14px; padding: 22px 34px;\`

  (C) GRADE THE FOOTAGE during the text beat -- calm the whole clip so it becomes a backdrop: a full-frame overlay at z-index:1 (e.g. \`background: rgba(8,10,24,0.5);\` or a brand-tinted gradient), or a filter on the video (\`filter: brightness(0.55) saturate(0.9);\`).

PLUS, always (regardless of A/B/C):
- White / near-white text (#ffffff or #f5f7ff), heavy weight (700-800).
- A real text-shadow for edge definition: \`text-shadow: 0 2px 12px rgba(0,0,0,0.7);\`
- The backing must cover the text's FULL box -- all lines, including descenders -- not just a band.
- NEVER place bare text on the footage with no backing, and NEVER use dark text over footage. Light text + a real backing only.
- Animate the text in/out; do not animate the footage.
` : ""}
${opts.heroImageUrl ? `
## HERO-IMAGE SCENE (a generated still image is THIS scene's background)
This scene has a real, cinematic AI-generated image that MUST be the full-bleed background. It is a deliberate STILL -- the calm, composed beat of the video. You MUST draw it.
- THEME EXCEPTION: the LIGHT-brand "light background / dark text only" rule above is for COMPOSED surfaces. Here the background is a real photo, so light text over a scrim is CORRECT and expected -- it is NOT a theme violation.
- Place it as the FIRST element in your <template>, filling the frame:
  \`<img class="mp-hero-img" src="${opts.heroImageUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;" />\`
  (The system rewrites that URL to a local file at render time -- keep it EXACTLY as given.)
- DO NOT add any of your own full-screen background (NO gradient-background, mesh, particles, grids, glow orbs) -- the image IS the background. Add only a soft legibility scrim if text needs it (e.g. a subtle linear-gradient overlay at z-index:1).
- Keep the foreground MINIMAL and let the image breathe: a headline/tagline and at most one small supporting element. Lots of negative space.
- This is a STILL beat: a slow, gentle Ken-Burns drift (scale 1.0 -> 1.06 over the full duration) on the image is welcome, but NOTHING should pop, bounce, or rebuild. Animate text gently (fade/slow rise); do not animate a competing background.
` : ""}
## ASSETS: LOCAL PATHS ONLY (hard rule)
NEVER reference an external/remote URL (http://, https://) for a video, image, or any media. The ONLY media you may use are the local /assets/... paths explicitly handed to you above (b-roll, hero image, logos). Do NOT invent stock-footage URLs (Pexels, Unsplash, etc.) -- remote media breaks the renderer.
${!opts.brollVideoUrl && !opts.heroImageUrl ? `This scene was given NO footage or hero image. Even if the visual notes mention "real footage" or "b-roll", do NOT add a <video> with an external src -- compose the background entirely from brand colors, gradients, and typography.` : ""}

Duration: ${opts.sceneDuration} seconds
Scene ${opts.sceneIndex + 1} of ${opts.totalScenes}
Project: ${opts.prompt}
${opts.treatment ? `
## Creative Direction (MUST FOLLOW)
Concept: ${opts.treatment.concept}
Color mood: ${opts.treatment.visualStyle.colorMood}
Typography: ${opts.treatment.visualStyle.typographyAttitude}
Motion: ${opts.treatment.visualStyle.motionPersonality}
Spatial: ${opts.treatment.visualStyle.spatialStrategy}
Through-line: ${opts.treatment.throughLine}${opts.treatment.visualDevices?.length ? `
Visual devices (recurring, build them as specified): ${opts.treatment.visualDevices.join("; ")}` : ""}
` : ""}
`;
}

/** True if the brand's background color is light (luminance > 0.5). */
function isLightBrand(brandKit: BrandKit): boolean {
  var bgHex = (brandKit.colors?.background || "#0f172a").replace("#", "");
  if (bgHex.length === 3) bgHex = bgHex.split("").map(c => c + c).join("");
  var lum = (0.299 * parseInt(bgHex.substring(0, 2), 16) + 0.587 * parseInt(bgHex.substring(2, 4), 16) + 0.114 * parseInt(bgHex.substring(4, 6), 16)) / 255;
  return lum > 0.5;
}

function buildBrandContext(brandKit: BrandKit): string {
  var lines: string[] = ["## Brand Kit (MANDATORY -- use these CSS variables)"];
  if (brandKit.colors) {
    lines.push(
      "The following CSS custom properties are pre-defined in :root.",
      "You MUST use var(--mp-color-*) in your CSS. Do NOT hardcode hex color values.",
      "",
      "Available color tokens:",
    );
    for (var [key, val] of Object.entries(brandKit.colors)) {
      lines.push(`  var(--mp-color-${key.replace(/_/g, "-")})  <- use this`);
    }
    lines.push(
      "",
      "Also available: var(--mp-color-glow), var(--mp-color-cta), var(--mp-color-text-muted)",
      "",
      "Examples:",
      "  background: var(--mp-color-background);",
      "  color: var(--mp-color-text);",
      "  border: 1px solid var(--mp-color-primary);",
      "  box-shadow: 0 0 40px var(--mp-color-glow);",
      "",
      "NEVER write raw hex like #6366f1 or #0f172a. Always use the var() token.",
    );
    // State the brand's theme so the scene matches it instead of defaulting to
    // dark. A light brand must render light; inverting it (a dark background on a
    // light brand) is the #1 "looks like generic AI" giveaway.
    var _light = isLightBrand(brandKit);
    lines.push(
      "",
      `THEME: this brand is ${_light ? "LIGHT" : "DARK"}.`,
      _light
        ? "The root/scene background MUST be var(--mp-color-background) (a LIGHT color) with var(--mp-color-text) (DARK) text. Do NOT build a dark scene. Do NOT hardcode ANY dark hex anywhere in this scene -- no #17171c, #0f172a, #0d0d1a, #1e293b, etc. -- not for the background, not for cards/panels, not for title treatments. Every surface uses var(--mp-color-surface) (LIGHT); all text uses var(--mp-color-text) (DARK); NEVER white/#fff/#f0eefc text (it's invisible on light). THIS THEME OVERRIDES THE SCENE'S VISUAL NOTES: if the visual notes name a dark background, a dark card, 'glow orbs on dark', or light text, IGNORE it and render light -- soft washes/tints of var(--mp-color-primary) on var(--mp-color-background), subtle grid, generous whitespace, dark text. Cards need a solid var(--mp-color-surface) fill or a 1px border + soft shadow to be visible (glassmorphism only works on dark)."
        : "The root/scene background is var(--mp-color-background) (dark) with var(--mp-color-text) (light) text.",
    );
    if (_light) {
      lines.push(
        "",
        "WORKED EXAMPLE -- visual notes say \"a dark, pre-dawn cityscape, quiet and moody, warm cream text drifting in\":",
        "  WRONG (theme inversion -- do not do this):",
        "    .scene { background: #0a0e1a; }  .headline { color: #fdf6e3; }",
        "  RIGHT (same mood, correct theme -- dawn/mood becomes a warm ACCENT wash and gradient art on a light base, not the base itself):",
        "    .scene { background: var(--mp-color-background); }",
        "    .dawn-wash { position:absolute; inset:0; background: radial-gradient(ellipse at 20% 80%, rgba(251,191,36,0.14), transparent 60%); }",
        "    .headline { color: var(--mp-color-text); }",
        "  The 'pre-dawn / moody / warm' feeling now lives in the radial wash, a muted amber accent line, and soft shadows -- not in a black canvas.",
      );
    }
  }
  if (brandKit.fonts?.length) {
    lines.push(
      "",
      "Fonts (also available as var(--mp-font-family)):",
    );
    for (var f of brandKit.fonts) {
      lines.push(
        `  ${f.family} (weights: ${f.weights?.join(", ") || "400, 700"})`,
      );
    }
  }
  if (brandKit.style) {
    lines.push(
      "",
      `Border radius: use var(--mp-border-radius) [default: ${brandKit.style.border_radius || "12px"}]`,
      `Motion: ${brandKit.style.motion || "cinematic"}`,
    );
  }
  if (brandKit.logos?.length) {
    lines.push(
      "",
      "## Brand Logos (render the REAL asset -- never redraw, invent, or approximate the logo)",
      "When a logo belongs in the scene, render it as a real image element pointing at the EXACT url below:",
      '  <img src="<url>" alt="logo" style="height:64px;width:auto;display:block;" />',
      "Available logo variants:",
    );
    for (var logo of brandKit.logos) {
      lines.push(`  - ${logo.name} (${logo.variant}, ${logo.theme} theme): ${logo.url}`);
    }
    lines.push(
      "Placement rules:",
      "  - Opening, closing, and brand/CTA scenes: feature the 'full' or 'wordmark' variant prominently and animate it in.",
      "  - Other content scenes: optionally place the 'icon' variant small (~36-48px) in a top or bottom corner as a subtle, low-opacity watermark.",
      "  - Pick the variant whose theme fits the background: dark background -> 'light' or 'any'; light background -> 'dark' or 'any'.",
      "  - Animate the logo's container (opacity/scale/position) -- do NOT distort the logo image itself.",
    );
  }
  return lines.join("\n");
}

// ── Main Agentic Loop ──

// Incremental submission (write_template/write_style/write_script/append_script/
// finish_scene) trades one big tool call for several small ones -- a typical
// scene now takes 2-4 turns to complete instead of 1, and a long multi-beat
// scene may use several append_script turns. More headroom than the old
// single-tool-call flow needed.
const MAX_ITERATIONS = 14;

// Component discovery is handled by the storyboard builder; codegen receives schemas in the spec

export async function generateSceneAgentic(
  opts: AgenticCodegenOpts,
): Promise<{ html: string; session: CodegenSession }> {
  var systemPrompt = buildAgenticSystemPrompt(opts);

  // Component schemas are provided in the spec by the storyboard builder

  var userPrompt = `Create this scene:

Label: ${opts.sceneLabel}
Description: ${opts.sceneDescription}

## Scene Spec

${opts.sceneSpec}

${!opts.brollVideoUrl && !opts.heroImageUrl ? `REMINDER before you write CSS: this brand is ${isLightBrand(opts.brandKit) ? "LIGHT -- render a light background with dark text, no matter what mood words appear above" : "DARK -- render a dark background with light text"}. Any "night", "dawn", "dark", "moody", or "glow on black" language above describes an ACCENT wash / gradient art, not the base surface color.\n` : ""}
## Requirements
- Follow the scene spec closely. Every motion verb in the visual notes should map to a GSAP tween.
- Create a visually stunning, polished scene. This is motion graphics, not a web page.
- Use the design skills rules: multi-layer shadows, varied easing, video-scale typography (64px+ headlines), background depth.
- Fill the frame. Two focal points minimum. Anchor to edges, not center-float.
- Every decorative element must have ambient animation (drift, breathe, pulse).
- All text MUST have correct spacing. Never concatenate words. Check every text string for missing spaces.
- Word wrapping: ensure headlines have enough room. Use max-width constraints and test that no word breaks mid-word.
${opts.critiqueFeedback ? `\n## Previous Attempt Feedback (FIX THESE)\n${opts.critiqueFeedback}\n` : ""}
CRITICAL: If the spec lists components with schemas, use <component type=... data='...' /> tags with the data fields from the schemas. Do NOT rebuild from scratch what the spec says to use as a component.
Read the spec, then write your scene using write_template / write_style / write_script (+ append_script for a long multi-beat timeline), then finish_scene.`;

  // Build user message: include reference images as vision content if available
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

  var messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  console.log(
    `  [agentic] Scene ${opts.sceneIndex + 1}: starting codegen for "${opts.sceneLabel}"`,
  );

  var parts = { template: "", style: "", script: "" };
  var session: CodegenSession = { messages, parts };

  // ── PHASE 1: DESIGN (the studio's set-dressing step) ──
  // The scene is fully designed -- every inventoried element dressed with its
  // real content, styled in its final resting state -- and statically gated
  // (copy presence + color discipline) BEFORE a single tween exists. The
  // animator then works against a locked design with nothing else on its
  // plate. Fail-soft: if the model never calls finish_design but banked a
  // template+style, proceed (the animation-phase gates still apply).
  var designResult = await runAgenticLoop({
    messages, parts, opts,
    maxIterations: 10,
    phase: "design",
  });
  if (!designResult.designDone) {
    if (!parts.template) {
      throw new Error(`Design phase produced no template for scene ${opts.sceneIndex + 1} ("${opts.sceneLabel}")`);
    }
    console.warn(`  [agentic] Scene ${opts.sceneIndex + 1}: design phase ended without finish_design -- proceeding with the banked design.`);
  }

  // ── PHASE 2: ANIMATION (design locked, timeline only) ──
  messages.push({
    role: "user",
    content: `The design is LOCKED. Now write ONLY the animation: the createTimeline(el, data, ctx) function implementing the beat sheet. The design shows every element in its FINAL RESTING state -- create entrances with gsap.from() / gsap.set() at the top of the timeline (never by editing the template or style). Wire component timelines via ctx.getComponentTimeline(...) where components are used. Write the setup plus the first beat with write_script, then ONE OR TWO BEATS per append_script call, then finish_scene.`,
  });

  var result = await runAgenticLoop({
    messages, parts, opts,
    maxIterations: MAX_ITERATIONS,
    phase: "animation",
  });
  if (result.html) return { html: result.html, session };

  // Max iterations reached without an accepted finish_scene.
  console.warn(
    `  [agentic] Scene ${opts.sceneIndex + 1}: ⚠️ max iterations (${MAX_ITERATIONS}) reached`,
  );

  // Prefer whatever got assembled in the accumulator over a stray text blob --
  // it's more likely to be a coherent (if incomplete) document.
  if (parts.template && parts.script) {
    console.log(
      `  [agentic] Scene ${opts.sceneIndex + 1}: using accumulated sections (template ${parts.template.length}, style ${parts.style.length}, script ${parts.script.length} chars)`,
    );
    return { html: assemblePartsHtml(parts), session };
  }

  if (result.lastHtml) {
    console.log(
      `  [agentic] Scene ${opts.sceneIndex + 1}: using last available HTML`,
    );
    return { html: result.lastHtml, session };
  }

  throw new Error(
    `Agentic codegen failed after ${MAX_ITERATIONS} iterations without producing HTML`,
  );
}

/**
 * Verify every inventoried element's copy is actually present in the template.
 * "Empty cards" happen when the codegen builds the container and abandons the
 * contents -- this makes that unshippable: finish_design lists exactly which
 * copy is missing, and the fix is a cheap in-conversation edit. Matching is
 * tag-stripped, whitespace-collapsed, case-insensitive; content segments are
 * split on ' / ' and newlines (short fragments under 4 chars are skipped).
 */
export function findMissingElementContents(
  template: string,
  elements: Array<{ name: string; kind: string; content: string }> | undefined,
): string[] {
  if (!elements || elements.length === 0) return [];
  var haystack = template.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").toLowerCase();
  var rawHaystack = template.replace(/\s+/g, " ").toLowerCase(); // for copy living in component data='...' attributes
  var missing: string[] = [];
  for (var elm of elements) {
    if (!elm || !elm.content || elm.kind === "decoration") continue;
    var segments = String(elm.content).split(/\s\/\s|\n/).map((x) => x.trim()).filter((x) => x.length >= 4);
    for (var seg of segments) {
      var needle = seg.replace(/\s+/g, " ").toLowerCase();
      if (!haystack.includes(needle) && !rawHaystack.includes(needle)) {
        missing.push(`${elm.name}: "${seg}"`);
      }
    }
  }
  return missing;
}

function assemblePartsHtml(parts: { template: string; style: string; script: string }): string {
  return `<template>\n${parts.template}\n</template>\n<style scoped>\n${parts.style}\n</style>\n<script>\n${parts.script}\n</script>`;
}

/**
 * Static color discipline: find text-color declarations (`color:` /
 * `-webkit-text-fill-color:`) whose value is a raw literal instead of a brand
 * token. Tokens are pre-validated for contrast by the assembler; raw literals
 * are how ~2:1-contrast gray-on-white text keeps shipping. Checked at
 * finish_scene so a violation costs a same-conversation edit, not a
 * render+measure revision round. Scans the model-authored style section and
 * inline style="" attributes in the template (library components are vetted
 * separately and are not part of these sections).
 */
export function findRawTextColors(parts: { template: string; style: string }): string[] {
  var violations: string[] = [];
  var ALLOWED = /^\s*(var\(--mp-|transparent\b|inherit\b|currentcolor\b|unset\b|initial\b)/i;
  var DECL = /(?:^|[;{\s"'])(color|-webkit-text-fill-color)\s*:\s*([^;}"']+)/gi;

  function scan(css: string, where: string) {
    var m: RegExpExecArray | null;
    DECL.lastIndex = 0;
    while ((m = DECL.exec(css)) !== null) {
      var value = m[2].trim();
      if (!ALLOWED.test(value)) {
        violations.push(`${where}: ${m[1]}: ${value.slice(0, 60)}`);
      }
    }
  }

  scan(parts.style, "style");
  // Inline style="" attributes in the template markup
  var attr: RegExpExecArray | null;
  var ATTR = /style\s*=\s*"([^"]*)"/gi;
  while ((attr = ATTR.exec(parts.template)) !== null) {
    scan(attr[1], "template inline style");
  }

  // Opacity dilution: the tokens are contrast-validated, but `color:
  // var(--mp-color-text); opacity: 0.72` multiplies the text back down to
  // ~2:1 -- the exact failure the tokens exist to prevent, observed live
  // after the token rule shipped. Flag any rule block that sets BOTH a text
  // color and opacity below 0.85; de-emphasis is what text-muted is for.
  var BLOCK = /([^{}]+)\{([^{}]*)\}/g;
  var blk: RegExpExecArray | null;
  while ((blk = BLOCK.exec(parts.style)) !== null) {
    var body = blk[2];
    if (!/(?:^|[;\s])color\s*:/i.test(body)) continue;
    var op = body.match(/(?:^|[;\s])opacity\s*:\s*(0?\.\d+|0)\b/i);
    if (op && parseFloat(op[1]) < 0.85) {
      violations.push(`style rule "${blk[1].trim().slice(0, 40)}": sets a text color AND opacity: ${op[1]} -- opacity dilutes the token's validated contrast. De-emphasize with var(--mp-color-text-muted) (or on-dark-muted) at full opacity instead.`);
    }
  }
  return violations;
}

/**
 * Revise an already-built scene INSIDE its original codegen conversation.
 *
 * The Write-then-Edit pattern: the session still holds the spec, the model's
 * own build reasoning, and the banked template/style/script (all in the
 * prompt-cached prefix), so a critique fix is a handful of edit_* patches
 * (~tens of output tokens) instead of a context-blind full regeneration.
 * Throws if the revision doesn't converge -- callers fall back to full regen.
 */
export async function reviseSceneInSession(
  session: CodegenSession,
  feedback: string,
  opts: AgenticCodegenOpts,
): Promise<{ html: string; session: CodegenSession }> {
  if (!session.parts.template || !session.parts.script) {
    throw new Error("Codegen session has no banked template/script to revise");
  }

  session.messages.push({
    role: "user",
    content: `The rendered scene FAILED review. Problems found:

${feedback}

Fix these with MINIMAL, targeted patches using edit_template / edit_style / edit_script (exact-match search & replace on what you already wrote). Batching several small edit_* calls into ONE response is good -- fix multiple problems per turn. Only use write_template / write_style / write_script if a whole section genuinely must be rewritten, and do NOT touch anything that wasn't flagged. As soon as the flagged problems are addressed, call finish_scene -- do not keep polishing beyond the list.`,
  });

  console.log(`  [agentic] Scene ${opts.sceneIndex + 1}: revising in-session (${session.parts.script.length} chars script banked)`);

  var result = await runAgenticLoop({
    messages: session.messages, parts: session.parts, opts,
    maxIterations: 12,
    phase: "revise",
  });
  if (result.html) return { html: result.html, session };

  // Budget exhausted mid-polish. The edits made so far are already banked in
  // session.parts -- if they assemble into a valid scene, SHIP the edited
  // version rather than throwing it away (the old throw here discarded a
  // full round of good fixes and triggered the most expensive fallback,
  // a complete re-storyboard + regeneration).
  if (session.parts.template && session.parts.script) {
    var salvage = executeSubmitScene(assemblePartsHtml(session.parts));
    if (salvage.valid) {
      console.warn(
        `  [agentic] Scene ${opts.sceneIndex + 1}: revision ran out of iterations without finish_scene -- using the edited sections as-is (they validate).`,
      );
      return { html: salvage.html, session };
    }
  }

  throw new Error(
    `In-session revision did not converge for scene ${opts.sceneIndex + 1} ("${opts.sceneLabel}")`,
  );
}

// The shared agentic tool loop: drives the write/append/edit/finish tools
// against a message history + parts accumulator until finish_scene validates,
// the model emits a full document as text, or the iteration budget runs out.
async function runAgenticLoop(args: {
  messages: LLMMessage[];
  parts: { template: string; style: string; script: string };
  opts: AgenticCodegenOpts;
  maxIterations: number;
  /** design: static set-dressing only (script tools locked); animation: the
   *  timeline only (design tools locked); revise: everything unlocked. */
  phase: "design" | "animation" | "revise";
}): Promise<{ html: string | null; lastHtml: string | null; designDone?: boolean }> {
  var { messages, parts, opts, maxIterations } = args;
  var lastHtml: string | null = null;

  // max_tokens caps the WHOLE turn (all tool calls in one response combined).
  // A truncated turn is RECOVERABLE, not fatal: everything already banked in
  // `parts` survives, so we discard the truncated turn (its tool calls may be
  // cut mid-JSON and cannot be trusted), tell the model what state is banked,
  // and let it re-send the same work in smaller pieces. Only repeated
  // truncation (the model refusing to chunk) aborts the scene.
  var CODEGEN_MAX_TOKENS = 24000;
  var truncations = 0;

  for (var iteration = 0; iteration < maxIterations; iteration++) {
    console.log(
      `  [agentic] Scene ${opts.sceneIndex + 1}: ${args.phase} iteration ${iteration + 1}/${maxIterations}`,
    );

    // Near the end of the budget, inject urgency to finish. This must fire in
    // BOTH phases: without it, revise loops polished with edit_* calls until
    // the budget died and never called finish_scene at all.
    if (iteration >= Math.max(3, maxIterations - 6) && !lastHtml) {
      messages.push({
        role: "user",
        content: args.phase === "revise"
          ? `IMPORTANT: You have ${maxIterations - iteration} iterations remaining. Stop polishing and call finish_scene NOW -- remaining minor issues are acceptable; losing the revision entirely is not.`
          : args.phase === "design"
            ? `IMPORTANT: You have ${maxIterations - iteration} iterations remaining in the DESIGN phase. Complete the template and style NOW and call finish_design.`
            : `IMPORTANT: You have ${maxIterations - iteration} iterations remaining. Finish the timeline NOW (use append_script for any remaining beats), then call finish_scene immediately. Do not start over -- build on what you've already written.`,
      });
    }

    var response = await callLLMAgentic(
      opts.llmConfig,
      messages,
      TOOLS,
      { temperature: 0.6, maxTokens: CODEGEN_MAX_TOKENS },
    );

    if (response.stopReason === "max_tokens") {
      truncations++;
      if (truncations > 2) {
        throw new Error(
          `Agentic codegen truncated ${truncations} times on scene ${opts.sceneIndex + 1} ("${opts.sceneLabel}") despite retry nudges: the model kept exceeding max_tokens (${CODEGEN_MAX_TOKENS}) per turn instead of chunking its output.`
        );
      }
      console.warn(
        `  [agentic] Scene ${opts.sceneIndex + 1}: turn truncated at max_tokens (${CODEGEN_MAX_TOKENS}) -- discarding the turn and asking for smaller chunks (attempt ${truncations}/2).`
      );
      messages.push({
        role: "assistant",
        content: (response.text || "(response truncated)").slice(0, 2000),
      });
      messages.push({
        role: "user",
        content: `Your last response hit the output-token limit and was DISCARDED -- NONE of its tool calls were applied. Still banked from before: template ${parts.template ? `WRITTEN (${parts.template.length} chars)` : "NOT written"}, style ${parts.style ? `WRITTEN (${parts.style.length} chars)` : "NOT written"}, script ${parts.script ? `${parts.script.length} chars so far` : "NOT started"}. Re-send the missing work in SMALLER pieces: ONE tool call per response, and split the timeline across several append_script calls (one or two beats each). Do not re-write sections that are already banked.`,
      });
      continue;
    }

    // Process tool calls
    if (response.toolCalls.length > 0) {
      // Build the assistant message content (text + tool_use blocks)
      // For Anthropic, we need to preserve the full content structure
      var assistantContent: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = [];
      if (response.text) {
        assistantContent.push({ type: "text", text: response.text });
      }
      for (var tc of response.toolCalls) {
        assistantContent.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }

      // Add assistant message with raw content (will be passed through to API)
      messages.push({
        role: "assistant",
        content: assistantContent as any,
      });

      // Execute each tool and collect results
      var toolResults: LLMContentPart[] = [];
      var finished = false;
      var finishedHtml = "";

      for (var toolCall of response.toolCalls) {
        console.log(
          `  [agentic] Scene ${opts.sceneIndex + 1}: tool call -> ${toolCall.name}(${JSON.stringify(toolCall.input).substring(0, 120)})`,
        );

        var toolResult: string;

        var isDesignTool = toolCall.name === "write_template" || toolCall.name === "write_style" || toolCall.name === "edit_template" || toolCall.name === "edit_style";
        var isScriptTool = toolCall.name === "write_script" || toolCall.name === "append_script" || toolCall.name === "edit_script";

        if (args.phase === "design" && (isScriptTool || toolCall.name === "finish_scene")) {
          toolResult = `Not yet -- this is the DESIGN phase (static set-dressing only). Complete the template and style, then call finish_design; the animation phase comes after the design is locked.`;
        } else if (args.phase === "animation" && isDesignTool) {
          toolResult = `REJECTED -- the design is LOCKED. Do not modify the template or style during the animation phase: entrances/exits are done with gsap.from()/gsap.set() in the script (the design shows the FINAL RESTING state), not by changing the design. Write the timeline only.`;
        } else if (toolCall.name === "finish_design") {
          if (args.phase !== "design") {
            toolResult = args.phase === "animation"
              ? "The design is already locked -- continue with the timeline and finish_scene."
              : "finish_design is not used here -- make your edits and call finish_scene.";
          } else if (!parts.template || !parts.style) {
            var missingD = [!parts.template && "write_template", !parts.style && "write_style"].filter(Boolean).join(" and ");
            toolResult = `Cannot lock the design yet -- ${missingD} not called.`;
          } else {
            var designColorViolations = findRawTextColors(parts);
            var missingCopy = findMissingElementContents(parts.template, opts.elements);
            if (designColorViolations.length > 0) {
              toolResult = `Design REJECTED -- raw color literals in text-color declarations:\n` +
                designColorViolations.slice(0, 8).map((v) => `  - ${v}`).join("\n") +
                `\nFix with edit_style using the brand tokens, then call finish_design again.`;
            } else if (missingCopy.length > 0) {
              toolResult = `Design REJECTED -- inventoried element copy is MISSING from the template (empty cards are unshippable):\n` +
                missingCopy.slice(0, 8).map((v) => `  - ${v}`).join("\n") +
                `\nAdd the missing content with edit_template (exact text from the inventory), then call finish_design again.`;
            } else {
              console.log(`  [agentic] Scene ${opts.sceneIndex + 1}: 🎨 design locked after ${iteration + 1} iterations (template ${parts.template.length}, style ${parts.style.length} chars)`);
              finished = true;
              finishedHtml = "";
              toolResult = "design locked -- now write the animation timeline (write_script, then append_script per beat), and call finish_scene when the timeline is complete.";
            }
          }
        } else if (toolCall.name === "write_template") {
          parts.template = String(toolCall.input.html || "");
          toolResult = `template received (${parts.template.length} chars)`;
        } else if (toolCall.name === "write_style") {
          parts.style = String(toolCall.input.css || "");
          toolResult = `style received (${parts.style.length} chars)`;
        } else if (toolCall.name === "write_script") {
          parts.script = String(toolCall.input.js || "");
          toolResult = `script chunk received (${parts.script.length} chars so far)`;
        } else if (toolCall.name === "append_script") {
          parts.script += String(toolCall.input.js || "");
          toolResult = `appended (script is now ${parts.script.length} chars total)`;
        } else if (toolCall.name === "edit_template" || toolCall.name === "edit_style" || toolCall.name === "edit_script") {
          var sectionKey = toolCall.name === "edit_template" ? "template" as const
            : toolCall.name === "edit_style" ? "style" as const : "script" as const;
          var search = String(toolCall.input.search ?? "");
          var replacement = String(toolCall.input.replace ?? "");
          var haystack = parts[sectionKey];
          if (!search) {
            toolResult = "search must be a non-empty string";
          } else {
            var occurrences = haystack.split(search).length - 1;
            if (occurrences === 0) {
              toolResult = `search text not found in ${sectionKey} -- it must match the existing text EXACTLY, whitespace included. Re-read what you wrote and retry with an exact excerpt.`;
            } else if (occurrences > 1) {
              toolResult = `search text matches ${occurrences} places in ${sectionKey} -- include more surrounding context so it matches exactly once.`;
            } else {
              parts[sectionKey] = haystack.split(search).join(replacement);
              toolResult = `${sectionKey} edited (${haystack.length} -> ${parts[sectionKey].length} chars)`;
            }
          }
        } else if (toolCall.name === "finish_scene") {
          var colorViolations = findRawTextColors(parts);
          if (!parts.template || !parts.script) {
            var missing = [!parts.template && "write_template", !parts.script && "write_script"].filter(Boolean).join(" and ");
            toolResult = `Cannot finish yet -- ${missing} not called. Write the missing section(s) first, then call finish_scene again.`;
          } else if (colorViolations.length > 0) {
            // Static color discipline: raw literals in text-color declarations
            // are THE recurring legibility failure (the model's dark-biased
            // aesthetic prior writes ~2:1-contrast grays on light brands, and
            // it cannot do contrast math while generating). Rejecting here --
            // before anything renders -- turns a 1-2 minute render+measure
            // revision round into a same-conversation edit costing seconds.
            toolResult = `REJECTED -- raw color literals in text-color declarations (text colors must be brand tokens, which are pre-validated for contrast):\n` +
              colorViolations.slice(0, 8).map((v) => `  - ${v}`).join("\n") +
              `\nReplace each with the right token: var(--mp-color-text) / var(--mp-color-text-muted) for text on the scene background or on var(--mp-color-surface) cards; var(--mp-color-on-dark) / var(--mp-color-on-dark-muted) ONLY inside explicitly dark panels; var(--mp-color-on-accent) / var(--mp-color-on-primary) on accent/primary fills. Use edit_style/edit_template to fix ONLY these declarations, then call finish_scene again.`;
          } else {
            var assembled = assemblePartsHtml(parts);
            var submitResult = executeSubmitScene(assembled);
            if (submitResult.valid) {
              console.log(
                `  [agentic] Scene ${opts.sceneIndex + 1}: ✅ ${args.phase} finished after ${iteration + 1} iterations (template ${parts.template.length}, style ${parts.style.length}, script ${parts.script.length} chars)`,
              );
              finished = true;
              finishedHtml = submitResult.html;
              toolResult = "accepted";
            } else {
              toolResult = submitResult.error || "Invalid scene";
              lastHtml = assembled; // keep as a fallback in case max iterations hits
            }
          }
        } else {
          toolResult = `Unknown tool: ${toolCall.name}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: toolResult,
        });
      }

      // Always bank the tool results BEFORE returning so the conversation
      // stays resumable (a dangling tool_use with no tool_result is an API
      // error on the next call in this session).
      messages.push({
        role: "user",
        content: toolResults,
      });

      if (finished) {
        if (args.phase === "design") return { html: null, lastHtml, designDone: true };
        return { html: finishedHtml, lastHtml };
      }

      continue;
    }

    // No tool calls - check if the response contains HTML directly (rare
    // fallback if the model ignores the tools entirely).
    if (response.text) {
      var text = response.text.trim();
      // Strip markdown fences if present
      if (text.startsWith("```")) {
        var firstNewline = text.indexOf("\n");
        if (firstNewline > -1) text = text.substring(firstNewline + 1);
        var lastFence = text.lastIndexOf("```");
        if (lastFence > -1) text = text.substring(0, lastFence);
        text = text.trim();
      }

      if (text.includes("<template") && text.includes("<script")) {
        console.log(
          `  [agentic] Scene ${opts.sceneIndex + 1}: ✅ scene returned as text after ${iteration + 1} iterations`,
        );
        messages.push({ role: "assistant", content: response.text });
        return { html: text, lastHtml };
      }

      // Text but no HTML - prompt to use the tools
      lastHtml = text;
      messages.push({
        role: "assistant",
        content: response.text,
      });
      messages.push({
        role: "user",
        content:
          "Please write your scene using write_template, write_style, write_script (and append_script for a long timeline), then finish_scene.",
      });
    }
  }

  return { html: null, lastHtml };
}
