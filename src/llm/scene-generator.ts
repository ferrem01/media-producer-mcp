/**
 * Unified Scene Generator
 *
 * Handles mixed library and custom components within each scene.
 * - Library components: added to Scene directly (no LLM call).
 * - Custom components: each gets its own LLM call to generate .component.html.
 */

import { callLLM, type LLMConfig } from "./client.js";
import { sceneComponentSystemPrompt } from "./prompts.js";
import { reviseComponent } from "./component-revise.js";
import { SCENE_TEMPLATES, TEMPLATES_DIR } from "./template-catalog.js";
import { getDesignSkills } from "./freeform-skills.js";
import { getComponentReferenceLibrary } from "./component-reference.js";
import type { PlannedScene, PlannedComponent } from "./unified-planner.js";
import type { BrandKit, Canvas, OutputFormat, Scene, SceneComponent, SceneTransition } from "../core/types.js";
import fs from "node:fs/promises";
import path from "node:path";

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

  // ── Freeform scene path ──
  if (planned.freeform && planned.freeform_brief) {
    return await generateFreeformScene(opts, planned, sceneId);
  }

  // ── Template scene path ──
  if (planned.template) {
    return await generateFromTemplate(opts, planned, sceneId);
  }
  var sceneComponents: SceneComponent[] = [];
  var customSources: Map<string, string> = new Map();

  // Build transition
  var transition: SceneTransition | undefined;
  if (planned.transition_in && planned.transition_in.type !== "none") {
    transition = {
      type: planned.transition_in.type as SceneTransition["type"],
      duration_seconds: planned.transition_in.duration_seconds || 0.5,
    };
  }

  var libraryCount = 0;
  var customCount = 0;

  for (var ci = 0; ci < planned.components.length; ci++) {
    var comp = planned.components[ci];

    if (comp.custom) {
      // Generate custom component via LLM
      customCount++;
      var compName = `custom_${sceneId}_${ci}`;
      var html = await generateCustomComponent({
        customPrompt: comp.custom_prompt || planned.description,
        sceneLabel: planned.label,
        sceneIndex: opts.sceneIndex,
        totalScenes: opts.totalScenes,
        prompt: opts.prompt,
        format: opts.format,
        llmConfig: opts.llmConfig,
        brandKit: opts.brandKit,
        canvas: opts.canvas,
        imageUrl: opts.imageUrl,
        duration: planned.duration_seconds,
        critiqueFeedback: opts.critiqueFeedback,
      });
      customSources.set(compName, html);
      sceneComponents.push({
        id: `comp_${ci}`,
        type: compName,
        data: {},
        z_index: comp.z_index ?? (ci + 1) * 10,
        position: comp.position,
      });
    } else {
      // Library component - use directly
      libraryCount++;
      sceneComponents.push({
        id: `comp_${ci}`,
        type: comp.type!,
        data: comp.data || {},
        z_index: comp.z_index ?? (ci + 1) * 10,
        position: comp.position,
      });
    }
  }

  // Wire image into appropriate component if available
  if (opts.imageUrl) {
    var imgComp = sceneComponents.find(c => c.type === "image-showcase");
    if (imgComp) {
      imgComp.data = { ...imgComp.data, src: opts.imageUrl };
    }
  }

  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (${libraryCount} library, ${customCount} custom)`);

  var scene: Scene = {
    id: sceneId,
    label: planned.label,
    duration_seconds: planned.duration_seconds || 5,
    transition_in: transition,
    components: sceneComponents,
  };

  return { scene, customSources: customSources.size > 0 ? customSources : undefined };
}

// ── Freeform Scene Generation ──

async function generateFreeformScene(
  opts: SceneGeneratorOpts,
  planned: PlannedScene,
  sceneId: string,
): Promise<GeneratedScene> {
  var compName = `freeform_${sceneId}`;
  var designSkills = getDesignSkills();

  var brandVarsContext = buildBrandContext(opts.brandKit);

  // Build component reference library for pattern guidance
  var componentRefSection = getComponentReferenceLibrary();
  var componentRefLibrary = componentRefSection
    ? `## Reference Components (study these patterns, don't copy them)

The following are production components from our library. Study their CSS patterns (shadows, typography, layout) and GSAP techniques (easing, stagger, choreography). Adapt their techniques for YOUR scene -- do not copy their structure.

${componentRefSection}`
    : "";

  var freeformSystemPrompt = `You are an expert motion graphics designer creating a single video scene as HTML+CSS+GSAP.
Your output will be captured frame-by-frame by Playwright at ${opts.canvas.width}x${opts.canvas.height} and encoded to video.

## Design Skills (FOLLOW THESE RULES)

${designSkills}

${componentRefLibrary}

## Output Format

Output a single .component.html file with exactly three sections:

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

1. Output ONLY the component HTML. No explanation, no markdown fences.
2. The createTimeline(el, data, ctx) function:
   - el: the component's root DOM element
   - data: JSON data object
   - ctx: { duration, fps, canvas: {width, height}, motion }
   - Must return a GSAP timeline (NOT paused)
3. Canvas: ${opts.canvas.width}x${opts.canvas.height}px. ALL content MUST be visible.
4. GSAP is available globally. You can use: gsap.to(), gsap.from(), gsap.fromTo(), gsap.set(), gsap.timeline().
5. Use 'var' for all variable declarations (not const/let).
6. Load Google Fonts in <template> with <link> tags.
7. Build-Breathe-Resolve: stagger entrances (0-30%), hold for readability (30-70%), exit/transition (70-100%).
8. Scene duration: ${planned.duration_seconds}s. Time your animations to fit.
9. Lottie animations are available via CDN (lottie-web 5.12.2). Use them for complex icon animations, micro-interactions, and decorative elements. Always sync to the GSAP timeline with goToAndStop() -- never use autoplay. See the design skills doc for patterns.

${brandVarsContext}

## This Scene

Duration: ${planned.duration_seconds} seconds
Scene ${opts.sceneIndex + 1} of ${opts.totalScenes}
Project: ${opts.prompt}
`;

  var freeformUserPrompt = `Create this scene:

Label: ${planned.label}
Description: ${planned.description}

## Storyboard Brief

${planned.freeform_brief}

## Requirements
- Follow the storyboard brief closely. Every motion verb in the brief should map to a GSAP tween.
- Create a visually stunning, polished scene. This is motion graphics, not a web page.
- Use the design skills rules: multi-layer shadows, varied easing, video-scale typography (64px+ headlines), background depth.
- Fill the frame. Two focal points minimum. Anchor to edges, not center-float.
- Every decorative element must have ambient animation (drift, breathe, pulse).
- Do NOT use ghost/watermark text (large semi-transparent background words like "DATA", "CONNECT"). Use radial glows, grid patterns, accent lines, or grain for background texture instead.
- All text MUST have correct spacing. Never concatenate words. Check every text string for missing spaces.
- Word wrapping: ensure headlines have enough room. Use max-width constraints and test that no word breaks mid-word.
- Use gsap.from() for entrances (elements arrive at their CSS position). IMPORTANT: set initial CSS to the FINAL state (opacity: 1, transform: none). Let GSAP animate FROM the hidden state. This ensures the first captured frame shows content, not blank.
${opts.critiqueFeedback ? `\n## Previous Attempt Feedback (FIX THESE)\n${opts.critiqueFeedback}\n` : ""}
Output ONLY the .component.html source. Start with <template> and end with </script>.`;

  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (freeform)`);

  var sceneHtml = await callLLM(opts.llmConfig, [
    { role: "system", content: freeformSystemPrompt },
    { role: "user", content: freeformUserPrompt },
  ], { temperature: 0.6, maxTokens: 16384 });

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

// ── Template Scene Generation ──

async function generateFromTemplate(
  opts: SceneGeneratorOpts,
  planned: PlannedScene,
  sceneId: string,
): Promise<GeneratedScene> {
  var templateDef = SCENE_TEMPLATES.find(t => t.id === planned.template);
  if (!templateDef) {
    console.warn(`  Template "${planned.template}" not found, falling back to custom`);
    // Fall back to custom generation
    planned.template = undefined;
    planned.components = [{
      custom: true,
      custom_prompt: planned.description || planned.label,
      z_index: 10,
    }];
    return generateScene(opts);
  }

  // Load the template HTML
  var templatePath = path.join(TEMPLATES_DIR, templateDef.file);
  var templateHtml: string;
  try {
    templateHtml = await fs.readFile(templatePath, "utf-8");
  } catch (e: any) {
    console.warn(`  Template file not found: ${templatePath}, falling back to custom`);
    planned.template = undefined;
    planned.components = [{
      custom: true,
      custom_prompt: planned.description || planned.label,
      z_index: 10,
    }];
    return generateScene(opts);
  }

  var templateData = planned.template_data || {};
  var compName = `template_${sceneId}`;

  // Check if the template needs content adaptation beyond slot filling
  // Simple slot data can be passed as component data directly
  // Complex modifications (layout changes, additional elements) use SEARCH/REPLACE
  var needsAdaptation = opts.critiqueFeedback;

  var finalHtml = templateHtml;

  if (needsAdaptation && opts.critiqueFeedback) {
    // Use SEARCH/REPLACE to adapt the template based on critique feedback
    console.log(`  Scene ${opts.sceneIndex + 1}: adapting template ${planned.template} via SEARCH/REPLACE`);
    var reviseResult = await reviseComponent({
      existingSource: templateHtml,
      instructions: opts.critiqueFeedback,
      componentName: compName,
      llmConfig: opts.llmConfig,
      brandKit: opts.brandKit,
      canvas: opts.canvas,
    });
    finalHtml = reviseResult.source;
    console.log(`  Template adapted: ${reviseResult.blocksApplied} blocks applied, fullRewrite=${reviseResult.fullRewrite}`);
  }

  var customSources = new Map<string, string>();
  customSources.set(compName, finalHtml);

  // Build transition
  var transition: SceneTransition | undefined;
  if (planned.transition_in && planned.transition_in.type !== "none") {
    transition = {
      type: planned.transition_in.type as SceneTransition["type"],
      duration_seconds: planned.transition_in.duration_seconds || 0.5,
    };
  }

  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${planned.label}" (template: ${planned.template})`);

  var scene: Scene = {
    id: sceneId,
    label: planned.label,
    duration_seconds: planned.duration_seconds || templateDef.duration[0],
    transition_in: transition,
    components: [{
      id: "comp_0",
      type: compName,
      data: templateData,
      z_index: 10,
    }],
  };

  // Apply speaker template flags
  if (templateDef.speaker) {
    if (templateDef.speaker.mode === "full-behind") {
      scene.transparent_background = true;
      if (templateDef.speaker.content_side) {
        scene.content_region = {
          side: templateDef.speaker.content_side,
          width: templateDef.speaker.content_width || "42%",
        };
      }
    }
  }

  return { scene, customSources };
}

// ── Custom Component Generation ──

interface CustomComponentOpts {
  customPrompt: string;
  sceneLabel: string;
  sceneIndex: number;
  totalScenes: number;
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  imageUrl?: string;
  duration: number;
  critiqueFeedback?: string;
}

async function generateCustomComponent(opts: CustomComponentOpts): Promise<string> {
  var sceneSystemPrompt = sceneComponentSystemPrompt(opts.format, opts.canvas, opts.brandKit);

  var imageContext = "";
  if (opts.imageUrl) {
    imageContext = `\n\nA hero image has been generated for this scene. Use it as the main visual.\nImage URL: ${opts.imageUrl}\nUse an <img> tag with this URL as src. Style it to fill the scene or use as a dramatic background.\nExample: <img src='${opts.imageUrl}' style='width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0'>\nLayer your text/UI ON TOP with z-index and text-shadow for readability.`;
  }

  // Build brand asset context
  var brandAssetContext = "";
  var bgAssets = (opts.brandKit.assets || []).filter(a => a.type === "background");
  if (bgAssets.length) {
    brandAssetContext += "\n\nAvailable Brand Backgrounds:\n";
    for (var bg of bgAssets) {
      brandAssetContext += `- "${bg.name}": ${bg.url}${bg.tags?.length ? ` [tags: ${bg.tags.join(", ")}]` : ""}\n`;
    }
  }
  if (opts.brandKit.logos?.length) {
    brandAssetContext += "\nAvailable Brand Logos:\n";
    for (var logo of opts.brandKit.logos) {
      brandAssetContext += `- "${logo.name}" (${logo.variant}, ${logo.theme} theme): ${logo.url}\n`;
    }
    brandAssetContext += "Pick the right logo variant based on the scene background (dark/light).\n";
  }
  if (opts.brandKit.guidelines) {
    brandAssetContext += `\n\nBrand Guidelines (FOLLOW THESE RULES):\n${opts.brandKit.guidelines}\n`;
  }

  var scenePrompt = `Generate the HTML for this component:

Scene: ${opts.sceneLabel}
Duration: ${opts.duration} seconds
Visual Direction: ${opts.customPrompt}
${imageContext}${brandAssetContext}

Overall project: ${opts.prompt}
Scene ${opts.sceneIndex + 1} of ${opts.totalScenes}.

IMPORTANT LAYOUT RULES:
- Canvas size: ${opts.canvas.width}x${opts.canvas.height}px. ALL content MUST be visible within these bounds.
- A background component already exists at z_index 0. Your component root should be transparent (no background property).
- Use flexbox or CSS grid for layout. Do NOT use absolute positioning with negative values or offsets that push content outside the canvas.
- Every element in the HTML must be visible in the final render. If you create a CTA button, stat, or headline, it MUST be within the visible canvas area.
- Test your layout mentally: if the canvas is ${opts.canvas.width}x${opts.canvas.height}, will every element fit? No cut-off text, no hidden buttons, no overflow.
- Use padding (40-80px from edges) to create breathing room, but keep all content inside.
- A logo component already exists at z_index 30 in the top-left. Do NOT render your own logo.

${opts.critiqueFeedback ? `\n\nIMPORTANT - PREVIOUS ATTEMPT FEEDBACK:\n${opts.critiqueFeedback}\nFix all issues listed above in this generation.\n\n` : ""}Output ONLY the .component.html source. No JSON wrapping, no markdown fences.
Start with <template> and end with </script>.`;

  var sceneHtml = await callLLM(opts.llmConfig, [
    { role: "system", content: sceneSystemPrompt },
    { role: "user", content: scenePrompt },
  ], { temperature: 0.5, maxTokens: 8192 });

  return stripHtmlFences(sceneHtml);
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
