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
import { SCENE_TEMPLATES, TEMPLATES_DIR } from "./template-catalog.js";
import { getDesignSkills } from "./freeform-skills.js";
import type { BrandKit, Canvas } from "../core/types.js";
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
}

// ── Tool Definitions ──

const TOOLS: LLMTool[] = [
  {
    name: "search_library",
    description:
      "Search the component and template library for reference examples relevant to what you're building. Returns names, categories, and descriptions. Use this first to find relevant patterns.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What you're looking for, e.g. 'dashboard metrics chart' or 'cursor animation UI interaction' or 'stat card counter'",
        },
        type: {
          type: "string",
          enum: ["components", "templates", "all"],
          description: "Search components, templates, or both",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_source",
    description:
      "Read the full HTML source code of a component or template. Study the CSS patterns, GSAP techniques, and layout approaches, then adapt them for your scene.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Component type name (e.g. 'chat-simulator', 'dashboard-kpi') or template ID (e.g. 'D1-hero-stat', 'C18-integration-grid')",
        },
        kind: {
          type: "string",
          enum: ["component", "template"],
          description: "Whether this is a component or template",
        },
      },
      required: ["name", "kind"],
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
  kind: "component" | "template";
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

  // Index templates
  for (var tmpl of SCENE_TEMPLATES) {
    items.push({
      name: tmpl.id,
      kind: "template",
      category: tmpl.category,
      description: `${tmpl.name}: ${tmpl.when} ${tmpl.feel}`,
      keywords: [
        tmpl.id,
        tmpl.name,
        tmpl.category,
        tmpl.when,
        tmpl.feel,
        tmpl.slots.map((s) => s.name).join(" "),
      ]
        .join(" ")
        .toLowerCase(),
    });
  }

  _searchIndex = items;
  return items;
}

async function executeSearchLibrary(
  query: string,
  type: string = "all",
): Promise<string> {
  var index = await getSearchIndex();
  var queryTerms = query.toLowerCase().split(/\s+/);

  // Filter by type
  var candidates = index;
  if (type === "components") {
    candidates = candidates.filter((i) => i.kind === "component");
  } else if (type === "templates") {
    candidates = candidates.filter((i) => i.kind === "template");
  }

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

  var lines: string[] = [`Found ${results.length} results for "${query}":\n`];
  for (var r of results) {
    var item = r.item;
    lines.push(
      `- **${item.name}** (${item.kind}, ${item.category}): ${item.description}`,
    );
  }
  lines.push(
    "\nUse read_source to study any of these. Pass the name and kind.",
  );
  return lines.join("\n");
}

async function executeReadSource(
  name: string,
  kind: string,
): Promise<string> {
  if (kind === "template") {
    // Find template by ID
    var tmpl = SCENE_TEMPLATES.find(
      (t) => t.id === name || t.id.toLowerCase() === name.toLowerCase(),
    );
    if (!tmpl) {
      // Try partial match
      tmpl = SCENE_TEMPLATES.find(
        (t) =>
          t.id.toLowerCase().includes(name.toLowerCase()) ||
          t.name.toLowerCase().includes(name.toLowerCase()),
      );
    }
    if (!tmpl) {
      return `Template "${name}" not found. Use search_library to find available templates.`;
    }
    var templatePath = path.join(TEMPLATES_DIR, tmpl.file);
    try {
      var source = await fs.readFile(templatePath, "utf-8");
      return `# Template: ${tmpl.id} - ${tmpl.name}\n# Category: ${tmpl.category}\n# When: ${tmpl.when}\n# Feel: ${tmpl.feel}\n\n${source}`;
    } catch {
      return `Template file not found: ${tmpl.file}`;
    }
  } else {
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
          return `# Component: ${name}\n# Category: ${catDir.name}\n# File: ${catDir.name}/${htmlFile}\n\n${source}`;
        }
      }
      return `Component "${name}" not found. Use search_library to find available components.`;
    } catch (e: any) {
      return `Error reading component: ${e.message}`;
    }
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

## Your Process

1. SEARCH the component and template library for relevant reference patterns
2. READ 1-3 sources that are most relevant to this scene's concept
3. STUDY the CSS patterns (shadows, typography, easing) and GSAP techniques
4. WRITE your scene HTML, adapting techniques from the references
5. SUBMIT via the submit_scene tool

Do NOT copy-paste from references. Adapt their techniques for YOUR scene.
Always search and read at least one reference before writing.

## Design Skills (FOLLOW THESE RULES)

${designSkills}

## Output Format

Your submitted HTML must be a single .component.html file with exactly three sections:

\`\`\`html
<template>
  <!-- Full scene HTML here -->
</template>

<style scoped>
  /* Complete CSS here */
</style>

<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    // GSAP animation here
    return tl;
  }
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

## This Scene

Duration: ${opts.sceneDuration} seconds
Scene ${opts.sceneIndex + 1} of ${opts.totalScenes}
Project: ${opts.prompt}
`;
}

function buildBrandContext(brandKit: BrandKit): string {
  var lines: string[] = ["## Brand Kit"];
  if (brandKit.colors) {
    lines.push(
      "Colors (use CSS custom properties var(--mp-color-*) in your CSS):",
    );
    for (var [key, val] of Object.entries(brandKit.colors)) {
      lines.push(`  --mp-color-${key.replace(/_/g, "-")}: ${val}`);
    }
  }
  if (brandKit.fonts?.length) {
    lines.push("Fonts:");
    for (var f of brandKit.fonts) {
      lines.push(
        `  ${f.family} (weights: ${f.weights?.join(", ") || "400, 700"})`,
      );
    }
  }
  if (brandKit.style) {
    lines.push(
      `Border radius: ${brandKit.style.border_radius || "12px"}`,
    );
    lines.push(`Motion: ${brandKit.style.motion || "cinematic"}`);
  }
  return lines.join("\n");
}

// ── Main Agentic Loop ──

const MAX_ITERATIONS = 8;

export async function generateFreeformAgentic(
  opts: AgenticFreeformOpts,
): Promise<string> {
  var systemPrompt = buildAgenticSystemPrompt(opts);

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
Start by searching the library for relevant patterns, then read 1-3 relevant sources before writing your scene.`;

  var messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  console.log(
    `  [agentic] Scene ${opts.sceneIndex + 1}: starting agentic loop for "${opts.sceneLabel}"`,
  );

  var lastHtml: string | null = null;

  for (var iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log(
      `  [agentic] Scene ${opts.sceneIndex + 1}: iteration ${iteration + 1}/${MAX_ITERATIONS}`,
    );

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
            (toolCall.input.type as string) || "all",
          );
        } else if (toolCall.name === "read_source") {
          toolResult = await executeReadSource(
            toolCall.input.name as string,
            toolCall.input.kind as string,
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
