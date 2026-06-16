/**
 * Unified Scene Generator
 *
 * Handles mixed library and custom components within each scene.
 * - Library components: added to Scene directly (no LLM call).
 * - Custom components: each gets its own LLM call to generate .component.html.
 */

import type { LLMConfig } from "./client.js";
import { generateSceneAgentic } from "./agentic-codegen.js";
import { buildComponentCatalog, formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import { config } from "../config.js";
import type { PlannedScene } from "./unified-planner.js";
import type { BrandKit, Canvas, OutputFormat, ReferenceImage, Scene, SceneTransition } from "../core/types.js";
import type { CreativeBible } from "./concept-director.js";

// ── Types ──

export interface SceneGeneratorOpts {
  scene: PlannedScene;
  sceneIndex: number;
  totalScenes: number;
  prompt: string;           // original project prompt
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  imageUrl?: string;        // from media enrichment
  tenantId: string;
  projectId: string;
  critiqueFeedback?: string; // feedback from visual critiquer for retry
  referenceImages?: ReferenceImage[];
  creativeBible?: CreativeBible;
  /** True when this scene has b-roll stock footage as its background. */
  hasBackgroundVideo?: boolean;
}

export interface GeneratedScene {
  scene: Scene;
  customSources?: Map<string, string>;  // compName -> HTML source (multiple custom components per scene)
}

/**
 * Generate a single scene with mixed library, custom, or template components.
 */
export async function generateScene(opts: SceneGeneratorOpts): Promise<GeneratedScene> {
  var planned = opts.scene;
  var sceneId = `scene_${String(opts.sceneIndex + 1).padStart(3, "0")}`;

  // ── Unified Codegen Path (always active) ──
  // All scenes go through the agentic codegen generator
  // which can use <component> tags to embed library components.
  var codegenBrief = await buildCodegenBrief(planned);
  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (unified codegen)`);
  return await generateCodegenScene(opts, planned, codegenBrief, sceneId);
}

// ── Freeform Scene Generation ──

async function generateCodegenScene(
  opts: SceneGeneratorOpts,
  planned: PlannedScene,
  codegenBrief: string,
  sceneId: string,
): Promise<GeneratedScene> {
  var compName = `scene_${sceneId}`;

  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (agentic-codegen)`);

  var effectiveBrief = codegenBrief;
  console.log("  [codegen-brief] Scene \"" + planned.label + "\" has " + (planned.components?.length || 0) + " component hints, brief includes schemas: " + effectiveBrief.includes("Component Schemas"));
  console.log("  [codegen-brief] Full brief length:", effectiveBrief.length, "chars");

  var sceneHtml = await generateSceneAgentic({
    sceneBrief: effectiveBrief,
    sceneLabel: planned.label,
    sceneDescription: planned.description,
    sceneDuration: planned.duration_seconds || 5,
    sceneIndex: opts.sceneIndex,
    totalScenes: opts.totalScenes,
    prompt: opts.prompt,
    llmConfig: opts.llmConfig,
    brandKit: opts.brandKit,
    canvas: opts.canvas,
    critiqueFeedback: opts.critiqueFeedback,
    referenceImages: opts.referenceImages,
    creativeBible: opts.creativeBible,
    hasBackgroundVideo: opts.hasBackgroundVideo,
  });

  sceneHtml = stripHtmlFences(sceneHtml);

  var customSources = new Map<string, string>();
  customSources.set(compName, sceneHtml);

  var transition: SceneTransition | undefined;
  if (planned.transition_in && planned.transition_in.type !== "none") {
    transition = {
      type: planned.transition_in.type as SceneTransition["type"],
      duration_seconds: planned.transition_in.duration_seconds || 0.5,
    };
  }

  var scene: Scene = {
    id: sceneId,
    label: planned.label,
    duration_seconds: planned.duration_seconds || 5,
    transition_in: transition,
    components: [{
      id: "comp_0",
      type: compName,
      data: {},
      z_index: 10,
    }],
  };

  return { scene, customSources };
}

function buildBrandContext(brandKit: BrandKit): string {
  var lines: string[] = ["## Brand Kit"];
  if (brandKit.colors) {
    lines.push("Colors (use CSS custom properties var(--mp-color-*) in your CSS):");
    for (var [key, val] of Object.entries(brandKit.colors)) {
      lines.push(`  --mp-color-${key.replace(/_/g, "-")}: ${val}`);
    }
  }
  if (brandKit.fonts?.length) {
    lines.push("Fonts:");
    for (var f of brandKit.fonts) {
      lines.push(`  ${f.family} (weights: ${f.weights?.join(", ") || "400, 700"})`);
    }
  }
  if (brandKit.style) {
    lines.push(`Border radius: ${brandKit.style.border_radius || "12px"}`);
    lines.push(`Motion: ${brandKit.style.motion || "cinematic"}`);
  }
  return lines.join("\n");
}

// ── Unified Codegen Brief Builder ──

/**
 * Build a rich codegen brief from any planned scene type.
 * Converts template, library component, sequence, or custom scene
 * descriptions into a brief the agentic codegen generator can use
 * with <component> tags.
 */
async function buildCodegenBrief(planned: any): Promise<string> {
  var parts: string[] = [];

  parts.push(`Scene: "${planned.label}"`);
  parts.push(`Duration: ${planned.duration_seconds || 5} seconds`);
  if (planned.description) parts.push(`Description: ${planned.description}`);

  // Visual brief from the planner
  if (planned.brief) {
    parts.push(`\nVisual Direction:\n${planned.brief}`);
  }

  // Component hints: look up schemas from catalog and include them
  if (planned.components?.length > 0) {
    var componentTypes: string[] = planned.components;
    parts.push(`\nUse these library components via <component> tags:`);
    for (var compType of componentTypes) {
      parts.push(`  - <component type="${compType}" />`);
    }

    // Look up component schemas from the catalog so the LLM has them upfront
    try {
      var catalog = await buildComponentCatalog(config.componentLibDir);
      var catalogMap = new Map<string, ComponentCatalogEntry>();
      for (var entry of catalog) {
        catalogMap.set(entry.type, entry);
      }

      var schemasFound: string[] = [];
      for (var ct of componentTypes) {
        var catalogEntry = catalogMap.get(ct);
        if (catalogEntry && catalogEntry.data && Object.keys(catalogEntry.data).length > 0) {
          var schemaLines: string[] = [];
          schemaLines.push(`### ${ct}`);
          if (catalogEntry.description) schemaLines.push(catalogEntry.description);
          schemaLines.push(`Embed: <component type="${ct}" data='{...}' />`);
          schemaLines.push("Data fields:");
          for (var [fieldName, field] of Object.entries(catalogEntry.data)) {
            var reqStr = field.required ? " (required)" : " (optional)";
            var typeStr = field.type;
            if (field.items) typeStr += `<${field.items.type}>`;
            var extra = "";
            if ((field as any).placeholder) extra += ` e.g. "${(field as any).placeholder}"`;
            if ((field as any).default !== undefined) extra += ` default: ${JSON.stringify((field as any).default)}`;
            if ((field as any).enum) extra += ` values: ${(field as any).enum.join(", ")}`;
            schemaLines.push(`  - ${fieldName}: ${typeStr}${reqStr}${extra}`);

            // Include nested object properties for array items
            if (field.items && (field.items as any).properties) {
              for (var [propName, prop] of Object.entries((field.items as any).properties)) {
                var p = prop as any;
                var propReq = p.required ? " (required)" : "";
                var propEnum = p.enum ? ` values: ${p.enum.join(", ")}` : "";
                schemaLines.push(`      - ${propName}: ${p.type}${propReq}${propEnum}`);
              }
            }
          }
          schemasFound.push(schemaLines.join("\n"));
        }
      }

      if (schemasFound.length > 0) {
        parts.push(`\n## Component Schemas\n\n${schemasFound.join("\n\n")}`);
      }
    } catch (e: any) {
      console.warn("  [buildCodegenBrief] Failed to load catalog for schemas:", e.message);
    }
  }

  // Voiceover hint
  if (planned.voiceover_text) {
    parts.push(`\nVoiceover: "${planned.voiceover_text}"`);
    parts.push(`Time the visual reveals to match the narration pacing.`);
  }

  return parts.join("\n");
}

// ── Helpers ──

function stripHtmlFences(raw: string): string {
  var trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    var firstNewline = trimmed.indexOf('\n');
    if (firstNewline > -1) trimmed = trimmed.substring(firstNewline + 1);
    var lastFence = trimmed.lastIndexOf('```');
    if (lastFence > -1) trimmed = trimmed.substring(0, lastFence);
    trimmed = trimmed.trim();
  }
  return repairTruncatedComponent(trimmed);
}

/**
 * Repair components truncated by LLM max token limits.
 * Detects missing closing tags and appends minimal valid closers.
 */
function repairTruncatedComponent(html: string): string {
  const hasTemplate = /<template[^>]*>/i.test(html);
  const hasTemplateClose = /<\/template>/i.test(html);
  const hasStyle = /<style[^>]*>/i.test(html);
  const hasStyleClose = /<\/style>/i.test(html);
  const hasScript = /<script[^>]*>/i.test(html);
  const hasScriptClose = /<\/script>/i.test(html);

  let repaired = false;

  // If we have opening tags but missing closers, the LLM was truncated
  if (hasStyle && !hasStyleClose) {
    // Truncated in <style> - close it and add remaining sections
    html += "\n}\n</style>";
    repaired = true;
  }

  if (hasScript && !hasScriptClose) {
    // Truncated in <script> - close the function and tag
    // Try to close any open braces
    const openBraces = (html.match(/\{/g) || []).length;
    const closeBraces = (html.match(/\}/g) || []).length;
    const unclosed = openBraces - closeBraces;
    if (unclosed > 0) {
      html += "\n" + "}\n".repeat(unclosed);
    }
    html += "\n</script>";
    repaired = true;
  }

  if (hasTemplate && !hasTemplateClose) {
    // Truncated in <template> - close open divs and template
    const openDivs = (html.match(/<div[^>]*>/gi) || []).length;
    const closeDivs = (html.match(/<\/div>/gi) || []).length;
    const unclosedDivs = openDivs - closeDivs;
    if (unclosedDivs > 0) {
      html += "\n" + "</div>\n".repeat(unclosedDivs);
    }
    html += "\n</template>";
    repaired = true;
  }

  // If missing entire sections, add stubs
  if (!hasTemplate) {
    html = "<template><div class=\"scene\"></div></template>\n" + html;
    repaired = true;
  }
  if (!hasScript) {
    html += "\n<script>\nfunction createTimeline(el, data, ctx) { return gsap.timeline(); }\n</script>";
    repaired = true;
  }

  if (repaired) {
    console.warn("  Warning: repaired truncated component (LLM hit max tokens)");
  }

  return html;
}
