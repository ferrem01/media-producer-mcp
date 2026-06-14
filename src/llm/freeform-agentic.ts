/**
 * Agentic Freeform Scene Generator
 *
 * Multi-turn agentic loop for freeform scene generation. The LLM gets tools
 * to search and read our component/template library, studies relevant
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
// Templates disabled -- LLM should use search_library to find components, not browse templates
// import { SCENE_TEMPLATES, TEMPLATES_DIR } from "./template-catalog.js";
import { getDesignSkills } from "./freeform-skills.js";
import type { BrandKit, Canvas, ReferenceImage } from "../core/types.js";
import type { CreativeBible } from "./concept-director.js";
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

export interface AgenticFreeformOpts {
  sceneBrief: string;
  sceneLabel: string;
  sceneDescription: string;
  sceneDuration: number;
  sceneIndex: number;
  totalScenes: number;
  prompt: string;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  critiqueFeedback?: string;
  referenceImages?: ReferenceImage[];
  creativeBible?: CreativeBible;
  /** When present, this is a sequence scene with multiple beats */
  beats?: Array<{
    label: string;
    brief: string;
    duration_seconds: number;
    voiceover_text?: string;
  }>;
}

// ── Tool Definitions ──

const TOOLS: LLMTool[] = [
  {
    name: "search_library",
    description:
      "Search for embeddable components in the library. Components can be embedded directly in your scene HTML using <component> tags. You MUST use them when a match exists instead of rebuilding from scratch.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What you're looking for, e.g. 'dashboard metrics chart' or 'cursor animation UI interaction' or 'stat card counter' or 'chat panel' or 'code editor'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_source",
    description:
      "Read a component's full source code. Use this to see the data props, HTML structure, CSS, and GSAP timeline so you can embed it with a <component> tag and fill in the data fields correctly.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Component type name from search results (e.g. 'chat-simulator', 'dashboard-kpi', 'quotient-chat', 'code-editor')",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "submit_scene",
    description:
      "Submit the final scene HTML. Call this when you're ready to output the scene. The HTML must be a complete .component.html with <template>, <style scoped>, and <script> sections.",
    input_schema: {
      type: "object",
      properties: {
        html: {
          type: "string",
          description:
            "Complete .component.html source with <template>, <style scoped>, and <script> sections",
        },
      },
      required: ["html"],
    },
  },
];

// ── Search Index Types ──

interface SearchableItem {
  name: string;
  kind: "component";
  category: string;
  description: string;
  keywords: string; // lowercased searchable text
}

// ── Tool Implementations ──

let _searchIndex: SearchableItem[] | null = null;
let _componentCatalog: ComponentCatalogEntry[] | null = null;

async function getSearchIndex(): Promise<SearchableItem[]> {
  if (_searchIndex) return _searchIndex;

  var items: SearchableItem[] = [];

  // Index components from catalog
  if (!_componentCatalog) {
    _componentCatalog = await buildComponentCatalog(COMPONENTS_ROOT);
  }

  for (var comp of _componentCatalog) {
    items.push({
      name: comp.type,
      kind: "component",
      category: comp.category,
      description: comp.description || comp.label || "",
      keywords: [
        comp.type,
        comp.category,
        comp.label || "",
        comp.description || "",
        Object.keys(comp.data).join(" "),
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  // Templates disabled -- components only

  _searchIndex = items;
  return items;
}

async function executeSearchLibrary(
  query: string,
  _type?: string,
): Promise<string> {
  var index = await getSearchIndex();
  var queryTerms = query.toLowerCase().split(/\s+/);

  // Components only
  var candidates = index.filter((i) => i.kind === "component");

  // Score each item by how many query terms match
  var scored = candidates.map((item) => {
    var score = 0;
    for (var term of queryTerms) {
      if (item.keywords.includes(term)) {
        score++;
        // Bonus for matching in name
        if (item.name.toLowerCase().includes(term)) score += 2;
        // Bonus for exact word boundary match
        if (item.keywords.split(/\s+/).some((w) => w === term)) score++;
      }
    }
    return { item, score };
  });

  // Sort by score descending, take top 8
  scored.sort((a, b) => b.score - a.score);
  var results = scored.filter((s) => s.score > 0).slice(0, 8);

  if (results.length === 0) {
    return `No results found for "${query}". Try different keywords. Available categories: ${[...new Set(index.map((i) => i.category))].join(", ")}`;
  }

  var lines: string[] = [`Found ${results.length} components for "${query}":\n`];

  for (var r of results) {
    var item = r.item;
    lines.push(`- **${item.name}** (${item.category}): ${item.description}`);
    lines.push(`  → EMBED: <component type="${item.name}" data='{...}' />`);
    lines.push(`  → NEXT: call read_source("${item.name}") to see data props and example usage`);
  }

  lines.push("");
  lines.push("ACTION REQUIRED: For each component above that matches your scene, call read_source to learn the data fields, then use a <component> tag in your HTML.");
  return lines.join("\n");
}

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
    return `Component "${name}" not found. Use search_library to find available components.`;
  } catch (e: any) {
    return `Error reading component: ${e.message}`;
  }
}

function executeSubmitScene(html: string): { valid: boolean; html: string; error?: string } {
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

  return { valid: true, html };
}

// ── System Prompt Builder ──

function buildAgenticSystemPrompt(opts: AgenticFreeformOpts): string {
  var designSkills = getDesignSkills();
  var brandVarsContext = buildBrandContext(opts.brandKit);

  return `You are an expert motion graphics designer creating a single video scene as HTML+CSS+GSAP.
Your output will be captured frame-by-frame by Playwright at ${opts.canvas.width}x${opts.canvas.height} and encoded to video.

## Your Process (FOLLOW THIS ORDER)

1. SEARCH for components matching your scene's UI elements (search_library)
2. For EACH matching component, READ its source (read_source) to learn its data props
3. BUILD your scene HTML using <component> tags for every matched UI element, filling data props with scene-specific content
4. WRITE custom code around the components: layout, positioning, backgrounds, transitions, decorative elements
5. SUBMIT via the submit_scene tool

CRITICAL: Steps 1-2 come FIRST. You MUST call read_source on every component you plan to use.
Do NOT skip read_source -- you need to see the data fields to fill them correctly.
Only write custom code for things that have NO matching component in the library.

## Design Skills (FOLLOW THESE RULES)

${designSkills}

## Component Tags (REQUIRED when a library component matches)

MANDATORY RULE: If the scene needs a UI element that exists in the component library (chat panels, editors,
dashboards, charts, code editors, kanban boards, etc.), you MUST search for it and use a <component> tag.
Do NOT rebuild it from scratch. Writing custom HTML for something that already exists in the library is a bug.

Use <component> tags for the UI building blocks. Write custom code for:
- Layout and positioning of components on the canvas
- Transitions, reveals, and choreography between components
- Decorative elements (backgrounds, particles, overlays)
- Anything truly unique that has no library match

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
- The \`type\` must match a component from the library (use search_library to find it)
- The \`data\` attribute is a JSON string with the component's data props
- Components auto-generate internal GSAP timelines
- Access component timelines in your createTimeline via: ctx.getComponentTimeline('comp_0')
- Component IDs are auto-assigned: comp_0, comp_1, comp_2... in order of appearance
- You can add \`class\` and \`style\` attributes to the <component> tag for positioning
- You can mix <component> tags with fully custom HTML/CSS/GSAP in the same scene
- You MUST use <component> tags for any UI that matches a library component. This is not optional.
- If search_library returns a matching component, USE IT via <component> tag. Do not rewrite it from scratch.
- Write custom code ONLY for layout, transitions, overlays, decorative elements, and truly unique visuals
- A scene with chat/conversation content MUST search for and use a chat component
- A scene with a code editor MUST search for and use a code editor component
- A scene with charts MUST search for and use a chart component
- A scene with a dashboard MUST search for and use dashboard components
- ALWAYS call read_source on a component before embedding it, so you fill data fields correctly

### Timeline Integration
\`\`\`javascript
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();
  // ctx.getComponentTimeline('comp_0') returns the component's internal timeline
  // Add it at a specific time to choreograph when the component animates
  tl.add(ctx.getComponentTimeline('comp_0'), 0);    // chat animates from t=0
  tl.add(ctx.getComponentTimeline('comp_1'), 5);    // editor animates from t=5
  // You can also control component visibility with GSAP
  gsap.set('[data-comp-id="comp_1"]', { opacity: 0 });
  tl.to('[data-comp-id="comp_1"]', { opacity: 1, duration: 0.8 }, 5);
  return tl;
}
\`\`\`

## Output Format

Your submitted HTML must be a single .scene.html file with three sections.

### EXAMPLE: A scene using <component> tags (THIS is what good output looks like)

\`\`\`html
<template>
  <div class="scene">
    <div class="bg"></div>

    <!-- Chat panel: EMBEDDED from library -->
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

    <!-- Code editor: EMBEDDED from library -->
    <div class="right-panel">
      <component type="code-editor" data='{
        "filename": "post.html",
        "language": "html",
        "code": "<article>\n  <h2>Q3 Results</h2>\n</article>",
        "theme": "dark"
      }' />
    </div>

    <!-- Custom connector (no library component for this) -->
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

Notice: quotient-chat and code-editor use <component> tags. Only the background, layout, and beam are custom.

### Minimal format (for scenes where NO library components match)

\`\`\`html
<template><!-- fully custom HTML --></template>
<style scoped>/* CSS */</style>
<script>
  function createTimeline(el, data, ctx) { var tl = gsap.timeline(); return tl; }
</script>
\`\`\`

## Technical Rules

1. The createTimeline(el, data, ctx) function:
   - el: the component's root DOM element
   - data: JSON data object
   - ctx: { duration, fps, canvas: {width, height}, motion }
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

${brandVarsContext}
${opts.referenceImages?.length ? buildReferenceImageSummary(opts.referenceImages) + "\nReference images show the target visual design. Your HTML+CSS should match the layout, colors, typography, spacing, and component hierarchy shown in these references.\n" : ""}
## This Scene

Duration: ${opts.sceneDuration} seconds
Scene ${opts.sceneIndex + 1} of ${opts.totalScenes}
Project: ${opts.prompt}
${opts.creativeBible ? `
## Creative Direction (MUST FOLLOW)
Concept: ${opts.creativeBible.concept}
Color mood: ${opts.creativeBible.visualStyle.colorMood}
Typography: ${opts.creativeBible.visualStyle.typographyAttitude}
Motion: ${opts.creativeBible.visualStyle.motionPersonality}
Spatial: ${opts.creativeBible.visualStyle.spatialStrategy}
Through-line: ${opts.creativeBible.throughLine}
` : ""}${opts.beats?.length ? buildSequenceInstructions(opts.beats) : ""}
`;
}

function buildSequenceInstructions(beats: Array<{ label: string; brief: string; duration_seconds: number; voiceover_text?: string }>): string {
  var lines: string[] = [
    "",
    "## SEQUENCE SCENE -- Multi-Beat Continuous Take",
    "",
    "This is a SEQUENCE scene. You must create ONE HTML document with a single master GSAP timeline",
    "that has MULTIPLE BEATS. Elements PERSIST and TRANSFORM across beats -- do NOT rebuild the DOM",
    "between beats. Use timeline labels to mark each beat.",
    "",
    "Key rules for sequences:",
    "- ONE HTML document, ONE createTimeline function, ONE master timeline",
    "- Use tl.addLabel('beat-name', startTime) to mark each beat",
    "- Elements that appear in beat 1 should MORPH/MOVE/TRANSFORM in beat 2, not disappear and reappear",
    "- The whole point is continuity -- the viewer should feel like one continuous camera take",
    "- Total duration is the sum of all beat durations",
    "",
    "Beats:",
  ];

  var runningTime = 0;
  for (var beat of beats) {
    lines.push(`  ${beat.label} (${runningTime}s - ${runningTime + beat.duration_seconds}s): ${beat.brief}`);
    runningTime += beat.duration_seconds;
  }

  lines.push("");
  lines.push("Example timeline structure:");
  lines.push("  var tl = gsap.timeline();");
  for (var i = 0; i < Math.min(beats.length, 3); i++) {
    var beat = beats[i];
    var start = beats.slice(0, i).reduce(function(sum, b) { return sum + b.duration_seconds; }, 0);
    lines.push(`  tl.addLabel('${beat.label}', ${start});`);
    lines.push(`  // ... animations for ${beat.label} beat ...`);
  }
  if (beats.length > 3) {
    lines.push("  // ... remaining beats ...");
  }

  return lines.join("\n");
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
  return lines.join("\n");
}

// ── Main Agentic Loop ──

const MAX_ITERATIONS = 8;

// presearchLibrary removed -- LLM uses search_library tool directly

export async function generateFreeformAgentic(
  opts: AgenticFreeformOpts,
): Promise<string> {
  var systemPrompt = buildAgenticSystemPrompt(opts);

  // No catalog dump -- the LLM must use search_library + read_source to discover components

  var userPrompt = `Create this scene:

Label: ${opts.sceneLabel}
Description: ${opts.sceneDescription}

## Storyboard Brief

${opts.sceneBrief}

## Requirements
- Follow the storyboard brief closely. Every motion verb in the brief should map to a GSAP tween.
- Create a visually stunning, polished scene. This is motion graphics, not a web page.
- Use the design skills rules: multi-layer shadows, varied easing, video-scale typography (64px+ headlines), background depth.
- Fill the frame. Two focal points minimum. Anchor to edges, not center-float.
- Every decorative element must have ambient animation (drift, breathe, pulse).
- All text MUST have correct spacing. Never concatenate words. Check every text string for missing spaces.
- Word wrapping: ensure headlines have enough room. Use max-width constraints and test that no word breaks mid-word.
${opts.critiqueFeedback ? `\n## Previous Attempt Feedback (FIX THESE)\n${opts.critiqueFeedback}\n` : ""}
CRITICAL: Before writing ANY UI element, search the component library. If a matching component exists, call read_source to learn its data props, then use <component type=... data='...' />. Do NOT rebuild from scratch what already exists in the library.
Start by calling search_library for the main UI elements in this scene. Then call read_source on each match. Only then write your scene HTML.`;

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
    `  [agentic] Scene ${opts.sceneIndex + 1}: starting agentic loop for "${opts.sceneLabel}"`,
  );

  var lastHtml: string | null = null;

  for (var iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log(
      `  [agentic] Scene ${opts.sceneIndex + 1}: iteration ${iteration + 1}/${MAX_ITERATIONS}`,
    );

    // After iteration 5, inject urgency to submit
    if (iteration >= 5 && !lastHtml) {
      messages.push({
        role: "user",
        content: `IMPORTANT: You have ${MAX_ITERATIONS - iteration} iterations remaining. You MUST call submit_scene with your HTML now. Stop searching and write the scene. If you have studied enough references, write and submit the HTML immediately.`,
      });
    }

    var response = await callLLMAgentic(
      opts.llmConfig,
      messages,
      TOOLS,
      { temperature: 0.6, maxTokens: 16384 },
    );

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

      for (var toolCall of response.toolCalls) {
        console.log(
          `  [agentic] Scene ${opts.sceneIndex + 1}: tool call -> ${toolCall.name}(${JSON.stringify(toolCall.input).substring(0, 120)})`,
        );

        var toolResult: string;

        if (toolCall.name === "search_library") {
          toolResult = await executeSearchLibrary(
            toolCall.input.query as string,
          );
        } else if (toolCall.name === "read_source") {
          toolResult = await executeReadSource(
            toolCall.input.name as string,
          );
        } else if (toolCall.name === "submit_scene") {
          var submitResult = executeSubmitScene(
            toolCall.input.html as string,
          );
          if (submitResult.valid) {
            console.log(
              `  [agentic] Scene ${opts.sceneIndex + 1}: ✅ scene submitted after ${iteration + 1} iterations`,
            );
            return submitResult.html;
          }
          toolResult = submitResult.error || "Invalid submission";
          // Save the HTML in case we hit max iterations
          lastHtml = submitResult.html;
        } else {
          toolResult = `Unknown tool: ${toolCall.name}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: toolResult,
        });
      }

      // Add user message with tool results
      messages.push({
        role: "user",
        content: toolResults,
      });

      continue;
    }

    // No tool calls - check if the response contains HTML directly
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
        return text;
      }

      // Text but no HTML - prompt to submit
      lastHtml = text;
      messages.push({
        role: "assistant",
        content: response.text,
      });
      messages.push({
        role: "user",
        content:
          "Please submit your scene HTML using the submit_scene tool. The HTML must include <template>, <style scoped>, and <script> sections.",
      });
    }
  }

  // Max iterations reached
  console.warn(
    `  [agentic] Scene ${opts.sceneIndex + 1}: ⚠️ max iterations (${MAX_ITERATIONS}) reached`,
  );

  if (lastHtml) {
    console.log(
      `  [agentic] Scene ${opts.sceneIndex + 1}: using last available HTML`,
    );
    return lastHtml;
  }

  throw new Error(
    `Agentic freeform generation failed after ${MAX_ITERATIONS} iterations without producing HTML`,
  );
}
