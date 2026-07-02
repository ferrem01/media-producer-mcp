/**
 * Focused defect detectors — Layer 1 of the layered critique funnel.
 *
 * A single fully-loaded rubric asks a vision model to check ~10 things at
 * once; the model satisfices — it reports the 2-3 most salient problems and
 * implicitly passes the rest. Detection recall collapses. This layer replaces
 * the monolith's defect-hunting with SMALL, SINGLE-PURPOSE detection calls
 * that run in PARALLEL on the cheap critique model (Haiku-class):
 *
 *   - each detector looks for exactly ONE defect class
 *   - each must return concrete EVIDENCE, which is verified against the
 *     scene's actual DOM text where possible (hallucination guard: a defect
 *     that quotes text that doesn't exist in the scene is dropped)
 *   - failures are independent: five focused calls decorrelate the misses
 *     a single broad call makes
 *
 * The funnel: Layer 0 = deterministic pixel/geometry gates (contrast,
 * clipping, ghost panels, dead frames, runtime). Layer 1 = these detectors.
 * Layer 2 = ONE holistic taste judge on a stronger model
 * (consolidated-critique.ts), which no longer hunts for mechanical defects.
 */

import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import type { CorrectnessDefect } from "./correctness-critique.js";

export interface DetectorInstance {
  /** Quoted text or spec phrase backing the finding ("" when purely visual). */
  evidence: string;
  detail: string;
}

export interface DetectorResult {
  type: string;
  defects: CorrectnessDefect[];
  /** Instances dropped because their evidence failed verification. */
  droppedInstances: number;
}

export interface FocusedDetectorOpts {
  previewImageBase64: string;
  contactSheetBase64?: string;
  /** Scene purpose + visual notes (used by dropped_element). */
  specText: string;
  /** Assembled scene HTML (used to verify quoted-text evidence). */
  sceneHtml?: string;
  brandTheme?: "light" | "dark";
  requiresLogo?: boolean;
  videoOnly?: boolean;
  mediaBackground?: boolean;
  llmConfig: LLMConfig;
}

const OUTPUT_RULE = `Output ONLY this JSON (no markdown, no commentary):
{ "found": true|false, "instances": [ { "evidence": "quoted text, or '' if purely visual", "detail": "what is wrong and where in the frame" } ] }
If there is no defect: { "found": false, "instances": [] }
Report at most 3 instances. Do NOT report borderline cases -- only clear instances of this ONE defect class. You are one detector among many; other systems check everything else, so do not report any other kind of problem.`;

interface DetectorSpec {
  type: string;
  system: string;
  /** Attach the contact sheet (time-dependent checks only — saves tokens). */
  useContactSheet?: boolean;
  /** Where quoted evidence must exist: scene DOM text, the spec text, or skip. */
  verifyAgainst?: "scene" | "spec";
}

const DETECTORS: DetectorSpec[] = [
  {
    type: "empty_skeleton",
    verifyAgainst: "scene",
    system: `You are a defect detector with ONE job: find PLACEHOLDER / SKELETON content in this rendered video frame.
A defect = a UI container (window, card, dashboard, table, chart) showing wireframe bars, gray placeholder rectangles, blank labeled fields, "Lorem ipsum", or generic stub text ("Feature One", "Label", "Text here", "Item 1") instead of believable, specific content (real-looking headlines, rows, metrics, names).
NOT defects: abstract decorative shapes that are not inside a UI container; dim background decor; real content that is merely small or terse.
For each instance, quote the placeholder text as evidence when there is any.
${OUTPUT_RULE}`,
  },
  {
    type: "dropped_element",
    useContactSheet: true,
    verifyAgainst: "spec",
    system: `You are a defect detector with ONE job: verify that every CONCRETE element the VISUAL NOTES explicitly name actually rendered.
Method: read the visual notes and list each concrete named element (a spark, cursor, glow, connecting line, badge, arrow, a specific window/label/caption, a named effect). Then check the frames.
TRANSIENT elements (anything the notes say flashes, pulses, appears briefly, or dissolves) count as rendered if they appear in ANY contact-sheet frame -- absence from the final frame is CORRECT.
Persistent elements must be visible in the final frame.
Report ONLY elements that appear in NO frame at all. As evidence, use the exact phrase from the visual notes that names the element.
${OUTPUT_RULE}`,
  },
  {
    type: "overlap",
    verifyAgainst: "scene",
    system: `You are a defect detector with ONE job: find COLLIDING content in this rendered video frame.
A defect = text overlapping other text, text smashed into a chart/image/panel so that either is obscured, or elements colliding so content is unreadable or visually mangled.
NOT defects: intentional layering where everything remains fully readable; a caption over a darkened/scrimmed background; decorative elements behind text.
For each instance, quote the affected text as evidence when there is any.
${OUTPUT_RULE}`,
  },
  {
    type: "stray_ui",
    verifyAgainst: "scene",
    system: `You are a defect detector with ONE job: find STRAY UI in this rendered video frame.
A defect = a prominent element that clearly does not belong to the scene: default unstyled browser controls, visible scrollbars, broken-image icons, another product's watermark, debug/console text, template leftovers, or an element unrelated to the scene's purpose.
NOT defects: intentional UI mockups that belong to the scene; brand logos.
For each instance, quote its text as evidence when there is any.
${OUTPUT_RULE}`,
  },
];

/** Detectors that only run under specific conditions. */
function conditionalDetectors(opts: FocusedDetectorOpts): DetectorSpec[] {
  const out: DetectorSpec[] = [];
  if (opts.brandTheme && !opts.mediaBackground) {
    const light = opts.brandTheme === "light";
    out.push({
      type: "off_brand_theme",
      system: `You are a defect detector with ONE job: check the scene's THEME against the brand.
This brand is ${light ? "LIGHT" : "DARK"}-themed: composed backgrounds and panels must be ${light ? "light with dark text" : "dark with light text"}.
A defect = the dominant composed background or major panels ${light ? "are dark / inverted, or light text sits on a light area" : "jarringly render light against the dark brand"}.
NOT defects: small accent areas; photographic/footage backgrounds with captions over a scrim.
${OUTPUT_RULE}`,
    });
  }
  if (opts.requiresLogo) {
    out.push({
      type: "missing_asset",
      system: `You are a defect detector with ONE job: check whether the brand LOGO IMAGE is visibly present in this rendered video frame.
A styled text wordmark alone, an empty box, or a monogram placeholder does NOT count as the logo image.
If the logo image is present, report found: false. If it is absent, report ONE instance with detail "brand logo image not visibly present".
${OUTPUT_RULE}`,
    });
  }
  return out;
}

/** Strip tags and normalize whitespace for evidence verification. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * Verify an instance's quoted evidence against the appropriate haystack.
 * Rules:
 *  - no/short evidence -> accepted (purely visual finding; detail must carry it)
 *  - quoted evidence  -> must appear in the haystack (whitespace-normalized,
 *    case-insensitive), else the instance is dropped as a hallucination.
 */
export function verifyInstance(
  instance: DetectorInstance,
  verifyAgainst: "scene" | "spec" | undefined,
  ctx: { sceneText?: string; specText?: string },
): boolean {
  const ev = (instance.evidence || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!verifyAgainst || ev.length < 4) return true;
  const haystack = verifyAgainst === "scene" ? ctx.sceneText : ctx.specText?.replace(/\s+/g, " ").toLowerCase();
  if (!haystack) return true; // nothing to verify against
  return haystack.includes(ev);
}

async function runDetector(
  spec: DetectorSpec,
  opts: FocusedDetectorOpts,
  ctx: { sceneText?: string; specText?: string },
): Promise<DetectorResult> {
  const userContent: LLMContentPart[] = [];
  if (spec.type === "dropped_element") {
    userContent.push({ type: "text", text: `VISUAL NOTES:\n${opts.specText}` });
  }
  userContent.push({ type: "text", text: "FINAL frame:" });
  userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${opts.previewImageBase64}` } });
  if (spec.useContactSheet && opts.contactSheetBase64) {
    userContent.push({ type: "text", text: "CONTACT SHEET (time left→right):" });
    userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${opts.contactSheetBase64}` } });
  }

  let parsed: any;
  try {
    const raw = await callLLM(opts.llmConfig, [
      { role: "system", content: spec.system },
      { role: "user", content: userContent },
    ], { temperature: 0.1 });
    parsed = JSON.parse(raw.trim().replace(/^```json?\s*/i, "").replace(/```$/i, "").trim());
  } catch {
    // Infra/parse failure never blocks generation.
    return { type: spec.type, defects: [], droppedInstances: 0 };
  }

  if (!parsed?.found || !Array.isArray(parsed.instances)) {
    return { type: spec.type, defects: [], droppedInstances: 0 };
  }

  const defects: CorrectnessDefect[] = [];
  let dropped = 0;
  for (const inst of parsed.instances.slice(0, 3)) {
    if (!inst || typeof inst.detail !== "string" || !inst.detail.trim()) continue;
    const instance: DetectorInstance = { evidence: String(inst.evidence ?? ""), detail: inst.detail };
    if (!verifyInstance(instance, spec.verifyAgainst, ctx)) {
      dropped++;
      continue;
    }
    defects.push({
      type: spec.type,
      detail: instance.evidence ? `"${instance.evidence}" -- ${instance.detail}` : instance.detail,
    });
  }
  return { type: spec.type, defects, droppedInstances: dropped };
}

/**
 * Run all applicable detectors in parallel. Returns their blocking defects.
 * Video-only brand clips are exempt entirely (their content can't be revised).
 */
export async function runFocusedDetectors(opts: FocusedDetectorOpts): Promise<{
  defects: CorrectnessDefect[];
  results: DetectorResult[];
}> {
  if (opts.videoOnly) return { defects: [], results: [] };

  const specs = [...DETECTORS, ...conditionalDetectors(opts)];
  const ctx = {
    sceneText: opts.sceneHtml ? htmlToText(opts.sceneHtml) : undefined,
    specText: opts.specText,
  };

  const settled = await Promise.allSettled(specs.map((s) => runDetector(s, opts, ctx)));
  const results: DetectorResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") results.push(s.value);
  }
  const defects = results.flatMap((r) => r.defects);
  const droppedTotal = results.reduce((sum, r) => sum + r.droppedInstances, 0);
  if (droppedTotal > 0) {
    console.log(`  Detectors: dropped ${droppedTotal} finding(s) whose evidence failed verification`);
  }
  return { defects, results };
}
