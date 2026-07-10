/**
 * Unified Scene Generator
 *
 * Handles mixed library and custom components within each scene.
 * - Library components: added to Scene directly (no LLM call).
 * - Custom components: each gets its own LLM call to generate .component.html.
 */

import type { LLMConfig } from "./client.js";
import { generateSceneAgentic, type CodegenSession } from "./agentic-codegen.js";
import { buildComponentCatalog, formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import { config } from "../config.js";
import type { DraftScene } from "./storyboard-builder.js";
import type { BrandKit, Canvas, OutputFormat, ReferenceImage, Scene, SceneTransition } from "../core/types.js";
import { formatBeatSheet } from "../core/beats.js";
import type { Treatment } from "./creative-director.js";
import { loadAssetIntel } from "../core/asset-intel.js";
import { resolveVideoPath } from "../core/video-path.js";

// ── Types ──

export interface SceneGeneratorOpts {
  scene: DraftScene;
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
  /** Project has a speaker track: scenes composite over a live camera base. */
  hasSpeakerTrack?: boolean;
  referenceImages?: ReferenceImage[];
  treatment?: Treatment;
  /** URL of a b-roll stock clip for the agent to place as this scene's background. */
  brollVideoUrl?: string;
}

export interface GeneratedScene {
  scene: Scene;
  customSources?: Map<string, string>;  // compName -> HTML source (multiple custom components per scene)
  /** Live codegen conversation for Write-then-Edit revisions (critique fixes
   *  patch the scene in-session instead of regenerating from scratch). */
  codegenSession?: CodegenSession;
}

/**
 * Generate a single scene with mixed library, custom, or template components.
 */
export async function generateScene(opts: SceneGeneratorOpts): Promise<GeneratedScene> {
  var draft = opts.scene;
  var sceneId = `scene_${String(opts.sceneIndex + 1).padStart(3, "0")}`;

  // ── Scene-template instantiation (no codegen) ──
  // A storyboard-selected st-* template is a designer-built composition;
  // the scene is the template + slot data, deterministic and instant. The
  // professional-composition path -- codegen only runs when no template fit.
  var st = (draft as any).scene_template;
  if (st && typeof st.type === "string" && st.type.startsWith("st-")) {
    console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${draft.label}" (scene template ${st.type})`);
    var stData = (st.data && typeof st.data === "object") ? st.data : {};
    // Default the wordmark slot from the brand kit when the template wants
    // one and the storyboard didn't fill it.
    if (!(stData as any).logo_url && opts.brandKit?.logos?.length) {
      var wmLogo = opts.brandKit.logos.find((l: any) => l.variant === "wordmark" || l.variant === "full") || opts.brandKit.logos[0];
      if (wmLogo) (stData as any).logo_url = wmLogo.url;
    }
    if (!(stData as any).scene_index) (stData as any).scene_index = `${String(opts.sceneIndex + 1).padStart(2, "0")} / ${String(opts.totalScenes).padStart(2, "0")}`;
    return {
      scene: {
        id: sceneId,
        label: draft.label,
        duration_seconds: draft.duration_seconds || 8,
        transition_in: draft.transition_in as any,
        beats: draft.beats as any,
        components: [{ id: "tpl_0", type: st.type, data: stData, z_index: 10 } as any],
        audio_hints: draft.voiceover_text ? { voiceover_text: draft.voiceover_text } : undefined,
      } as any,
    };
  }

  // ── Unified Codegen Path (always active) ──
  // All scenes go through the agentic codegen generator
  // which can use <component> tags to embed library components.
  var codegenSpec = await buildCodegenSpec(draft);
  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${draft.label}" (unified codegen)`);
  return await generateCodegenScene(opts, draft, codegenSpec, sceneId);
}

// ── Freeform Scene Generation ──

async function generateCodegenScene(
  opts: SceneGeneratorOpts,
  draft: DraftScene,
  codegenSpec: string,
  sceneId: string,
): Promise<GeneratedScene> {
  var compName = `scene_${sceneId}`;

  console.log(`  Scene ${opts.sceneIndex + 1}/${opts.totalScenes}: "${draft.label}" (agentic-codegen)`);

  var effectiveSpec = codegenSpec;
  // Provided real footage must be IN the spec text: the dropped-footage
  // enforcement below and the footage-facts injection both key on /assets
  // video URLs appearing in the spec -- a URL that only travels via
  // opts.brollVideoUrl is invisible to both.
  if (opts.brollVideoUrl && /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(opts.brollVideoUrl) && !effectiveSpec.includes(opts.brollVideoUrl)) {
    effectiveSpec += `\n\n## PROVIDED FOOTAGE (REAL -- must appear in the scene)\n${opts.brollVideoUrl}`;
  }
  // ── Source footage facts ──
  // When the spec references real uploaded footage, append what ingest-time
  // analysis learned about it (dimensions, embedded browser/window chrome,
  // letterbox bars, theme). Without these facts the codegen guesses -- and a
  // recording that carries its own browser header inside a mock browser
  // frame ships with two stacked headers.
  try {
    var specVideoUrls: string[] = Array.from(new Set(
      (effectiveSpec.match(/\/assets\/[^\s"'`)\]]+\.(?:mp4|webm|mov|m4v|ogv)/gi) || []),
    ));
    var factLines: string[] = [];
    for (var svUrl of specVideoUrls) {
      var svIntel = await loadAssetIntel(resolveVideoPath(svUrl));
      if (svIntel) factLines.push(`- ${svUrl.split("/").pop()}: ${svIntel.notes.join(" ")}`);
    }
    if (factLines.length > 0) {
      effectiveSpec += "\n\n## SOURCE FOOTAGE FACTS (measured -- trust these over guesses)\n" + factLines.join("\n");
    }
  } catch { /* facts are best-effort; the spec stands without them */ }
  console.log("  [codegen-spec] Scene \"" + draft.label + "\" has " + (draft.components?.length || 0) + " component hints, spec includes schemas: " + effectiveSpec.includes("Component Schemas"));
  console.log("  [codegen-spec] Full spec length:", effectiveSpec.length, "chars");

  var agenticResult = await generateSceneAgentic({
    sceneSpec: effectiveSpec,
    sceneLabel: draft.label,
    sceneDescription: draft.purpose || draft.visual_notes,
    sceneDuration: draft.duration_seconds || 5,
    sceneIndex: opts.sceneIndex,
    totalScenes: opts.totalScenes,
    prompt: opts.prompt,
    llmConfig: opts.llmConfig,
    brandKit: opts.brandKit,
    canvas: opts.canvas,
    critiqueFeedback: opts.critiqueFeedback,
    referenceImages: opts.referenceImages,
    treatment: opts.treatment,
    brollVideoUrl: opts.brollVideoUrl,
    heroImageUrl: opts.imageUrl,
    elements: Array.isArray(draft.elements) ? draft.elements : undefined,
  });

  var sceneHtml = stripHtmlFences(agenticResult.html);

  // ── Component-usage enforcement (deterministic) ──
  // The storyboard chose vetted library components and the system prompt says
  // rebuilding them by hand is a bug -- but an instruction without a check
  // ships non-compliance silently (measured: whole projects generated with a
  // 125-entry catalog and ZERO <component> tags). One corrective retry.
  var wantedComps = (Array.isArray(draft.components) ? draft.components : [])
    .filter((c: any) => typeof c === "string" && c !== "video");
  var missingComponents = wantedComps.length > 0 && !sceneHtml.includes("<component ");
  // REAL FOOTAGE is even less optional than library components: when the
  // spec names an /assets video, a scene that fabricates a lookalike UI
  // mock instead of embedding the recording is a structural failure
  // (measured: a walkthrough scene shipped with a fake chat UI and zero
  // <video> tags while the real 10-minute recording sat unused).
  var specVideoFiles: string[] = Array.from(new Set(
    (effectiveSpec.match(/\/assets\/[^\s"'`)\]]+\.(?:mp4|webm|mov|m4v|ogv)/gi) || [])
      .map((u: string) => u.split("/").pop() || "")
      .filter((f: string) => f.length > 0),
  ));
  var missingFootage = specVideoFiles.filter((f) => !sceneHtml.includes(f));
  if (missingComponents || missingFootage.length > 0) {
    var defectLines: string[] = [];
    if (missingComponents) defectLines.push(`the storyboard selected the vetted library components [${wantedComps.join(", ")}] but you embedded NONE of them -- you rebuilt everything as bespoke HTML, which produces flat, low-craft results. You MUST embed each via <component type="..." data='{...}' /> (schemas are in the spec).`);
    if (missingFootage.length > 0) defectLines.push(`the spec names REAL footage (${missingFootage.join(", ")}) and your scene does not reference it -- you fabricated a mock instead of embedding the actual recording. You MUST present each named file, preferably via <component type="screencast-frame" data='{"video_url":"...","frame_style":"macos-browser","crop":"auto"}' /> (or a bare markup <video src muted playsinline> for full-bleed moments), as the spec directs.`);
    console.warn(`  Scene ${opts.sceneIndex + 1}: structural defect(s) -- ${missingComponents ? "no <component> tags" : ""}${missingComponents && missingFootage.length ? " + " : ""}${missingFootage.length ? "dropped footage " + missingFootage.join(",") : ""} -- corrective retry`);
    try {
      var retryResult = await generateSceneAgentic({
        sceneSpec: effectiveSpec,
        sceneLabel: draft.label,
        sceneDescription: draft.purpose || draft.visual_notes,
        sceneDuration: draft.duration_seconds || 5,
        sceneIndex: opts.sceneIndex,
        totalScenes: opts.totalScenes,
        prompt: opts.prompt,
        llmConfig: opts.llmConfig,
        brandKit: opts.brandKit,
        canvas: opts.canvas,
        critiqueFeedback: `${opts.critiqueFeedback ? opts.critiqueFeedback + "\n\n" : ""}STRUCTURAL DEFECT(S) in your previous attempt: ${defectLines.join(" ALSO: ")}`,
        referenceImages: opts.referenceImages,
        treatment: opts.treatment,
        brollVideoUrl: opts.brollVideoUrl,
        heroImageUrl: opts.imageUrl,
        elements: Array.isArray(draft.elements) ? draft.elements : undefined,
      });
      var retryHtml = stripHtmlFences(retryResult.html);
      var retryCompsOk = !missingComponents || retryHtml.includes("<component ");
      var retryFootageOk = missingFootage.every((f) => retryHtml.includes(f));
      if (retryCompsOk && retryFootageOk) {
        sceneHtml = retryHtml;
        agenticResult = retryResult;
        console.log(`  Scene ${opts.sceneIndex + 1}: corrective retry fixed the structural defect(s) ✓`);
      } else {
        console.warn(`  Scene ${opts.sceneIndex + 1}: retry still defective (components ok: ${retryCompsOk}, footage ok: ${retryFootageOk}) -- shipping first version`);
      }
    } catch (e: any) {
      console.warn(`  Scene ${opts.sceneIndex + 1}: component-enforcement retry failed (${e?.message || e}) -- shipping first version`);
    }
  }

  var customSources = new Map<string, string>();
  customSources.set(compName, sceneHtml);

  var transition: SceneTransition | undefined;
  if (draft.transition_in && draft.transition_in.type !== "none") {
    transition = {
      type: draft.transition_in.type as SceneTransition["type"],
      duration_seconds: draft.transition_in.duration_seconds || 0.5,
    };
  }

  var scene: Scene = {
    id: sceneId,
    label: draft.label,
    duration_seconds: draft.duration_seconds || 5,
    transition_in: transition,
    beats: Array.isArray(draft.beats) && draft.beats.length >= 2 ? draft.beats : undefined,
    components: [{
      id: "comp_0",
      type: compName,
      data: {},
      z_index: 10,
    }],
  };

  return { scene, customSources, codegenSession: agenticResult.session };
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

// ── Unified Codegen Spec Builder ──

/**
 * Build a rich codegen spec from any draft scene type.
 * Converts template, library component, sequence, or custom scene
 * notes into a spec the agentic codegen generator can use
 * with <component> tags.
 */
async function buildCodegenSpec(draft: any): Promise<string> {
  var parts: string[] = [];

  parts.push(`Scene: "${draft.label}"`);
  // What this scene must communicate (its job in the story).
  const purpose = draft.purpose;
  if (purpose) parts.push(`Purpose: ${purpose}`);
  parts.push(`Duration: ${draft.duration_seconds || 5} seconds`);

  // Visual direction from the storyboard -- how this scene should look and move.
  const visualDirection = draft.visual_notes || draft.purpose;
  if (visualDirection) {
    parts.push(`\nVisual Direction:\n${visualDirection}`);
  }

  // Tactical element inventory: the set list. The visual notes carry the
  // mood; this carries the EXACT elements + copy the scene must contain --
  // the antidote to abstract notes getting half-invented as empty skeletons.
  if (Array.isArray(draft.elements) && draft.elements.length > 0) {
    parts.push(`\nElement Inventory -- render EVERY element below, with EXACTLY this content (do not invent different copy, do not leave any as an empty shell):`);
    for (const elm of draft.elements) {
      if (!elm || !elm.content) continue;
      parts.push(`  - [${elm.kind || "element"}] ${elm.name || "unnamed"}: "${elm.content}"${elm.motion ? ` -- motion: ${elm.motion}` : ""}`);
    }
  }

  // Beat sheet: the scene's internal timeline (continuous-take scenes). The
  // visual notes describe the WORLD; the beats are the shot clock of what
  // HAPPENS in it. Rendered as explicit time segments the master timeline
  // must follow (with tl.addLabel at each beat start).
  if (Array.isArray(draft.beats) && draft.beats.length >= 2) {
    parts.push(`\n${formatBeatSheet(draft.beats)}`);
  }

  // Component hints: look up schemas from catalog and include them
  if (draft.components?.length > 0) {
    var componentTypes: string[] = draft.components;
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
      console.warn("  [buildCodegenSpec] Failed to load catalog for schemas:", e.message);
    }
  }

  // Voiceover hint
  if (draft.voiceover_text) {
    parts.push(`\nVoiceover: "${draft.voiceover_text}"`);
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
