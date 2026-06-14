/**
 * Unified Scene Generator
 *
 * Handles mixed library and custom components within each scene.
 * - Library components: added to Scene directly (no LLM call).
 * - Custom components: each gets its own LLM call to generate .component.html.
 */

import type { LLMConfig } from "./client.js";
import { generateFreeformAgentic } from "./freeform-agentic.js";
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
  // All scenes go through the freeform-agentic generator
  // which can use <component> tags to embed library components.
  var codegenBrief = buildCodegenBrief(planned);
  var codegenPlanned = {
    ...planned,
    freeform: true,
    freeform_brief: codegenBrief,
  };
  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (unified codegen)`);
  return await generateFreeformScene(opts, codegenPlanned, sceneId);
}

// ── Freeform Scene Generation ──

async function generateFreeformScene(
  opts: SceneGeneratorOpts,
  planned: PlannedScene,
  sceneId: string,
): Promise<GeneratedScene> {
  var compName = `freeform_${sceneId}`;

  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (freeform-agentic)`);

  // Build the brief: for sequences, combine beat briefs into one rich brief
  var effectiveBrief = planned.freeform_brief || planned.description;
  if (planned.beats?.length) {
    effectiveBrief = `SEQUENCE: ${planned.beats.map(function(b) { return b.label + ": " + b.brief; }).join(" -> ")}`;
  }

  var sceneHtml = await generateFreeformAgentic({
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
    beats: planned.beats,
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
      data: planned.template_data || {},
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
 * Build a rich freeform brief from any planned scene type.
 * Converts template, library component, sequence, or custom scene
 * descriptions into a brief the freeform-agentic generator can use
 * with <component> tags.
 */
function buildCodegenBrief(planned: any): string {
  var parts: string[] = [];

  parts.push(`Scene: "${planned.label}"`);
  parts.push(`Duration: ${planned.duration_seconds || 5} seconds`);
  if (planned.description) parts.push(`Description: ${planned.description}`);

  // Template scene: tell the LLM to use a component tag or recreate the template look
  if (planned.template) {
    parts.push(`\nThis scene should use the "${planned.template}" template style.`);
    if (planned.template_data) {
      parts.push(`Content to fill in:`);
      for (var [key, value] of Object.entries(planned.template_data)) {
        parts.push(`  - ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  // Library components: tell the LLM to use <component> tags
  if (planned.components?.length > 0) {
    var libComps = planned.components.filter((c: any) => !c.custom && c.type);
    var customComps = planned.components.filter((c: any) => c.custom);

    if (libComps.length > 0) {
      parts.push(`\nUse these library components via <component> tags:`);
      for (var lc of libComps) {
        var dataStr = lc.data ? ` with data: ${JSON.stringify(lc.data)}` : "";
        parts.push(`  - <component type="${lc.type}"${dataStr} />`);
        if (lc.position) parts.push(`    Position: ${JSON.stringify(lc.position)}`);
      }
    }

    if (customComps.length > 0) {
      parts.push(`\nAlso create custom elements:`);
      for (var cc of customComps) {
        parts.push(`  - ${cc.custom_prompt || "Custom visual element"}`);
      }
    }
  }

  // Sequence beats: include beat choreography
  if (planned.beats?.length > 0) {
    parts.push(`\nThis is a multi-beat sequence (${planned.beats.length} beats, continuous take):`);
    var runTime = 0;
    for (var beat of planned.beats) {
      parts.push(`  Beat "${beat.label}" (${runTime}s - ${runTime + beat.duration_seconds}s): ${beat.brief}`);
      runTime += beat.duration_seconds;
    }
    parts.push(`Use <component> tags for each UI element, then choreograph them with GSAP.`);
    parts.push(`Show/hide/move components at beat boundaries using ctx.getComponentTimeline().`);
  }

  // Freeform brief: pass through
  if (planned.freeform_brief) {
    parts.push(`\nVisual Direction:\n${planned.freeform_brief}`);
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
