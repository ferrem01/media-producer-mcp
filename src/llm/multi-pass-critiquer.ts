/**
 * Editorial Critique (full-video pass).
 *
 * Per-scene critique now lives in consolidated-critique.ts (one vision call doing
 * functional + premium + correctness). This module keeps the EDITORIAL pass:
 * a cross-scene, plan-fidelity review that runs ONCE after all scenes are
 * generated -- judging pacing, variety, coherence, and whether each rendered
 * scene delivered its planned intent (using a tiled storyboard image).
 */

import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import { EDITORIAL_CRITIQUE } from "./cinematography.js";
import type { TraceBuilder } from "../trace/index.js";

export interface EditorialCritiqueResult {
  overall_score: number;
  pacing_score: number;
  variety_score: number;
  coherence_score: number;
  issues: string[];
  fixes: Array<{
    type: "swap_scenes" | "add_breathing" | "shorten_scene" | "vary_layout" | "vary_transition" | "adjust_energy" | "fix_scene";
    scene_index?: number;
    detail: string;
  }>;
}

/**
 * Editorial critique (full video flow). Runs ONCE after all scenes are generated.
 * Evaluates pacing, variety, narrative arc, coherence, and -- when a storyboard
 * image is provided -- per-scene plan fidelity (did each rendered frame deliver
 * the plan's intent?).
 */
export async function critiqueEditorial(opts: {
  scenes: Array<{
    label: string;
    duration_seconds: number;
    transition_in?: { type: string; duration_seconds: number };
    component_types: string[];
    word_count: number;
    /** What the PLAN intended this scene to be/show (purpose + brief). */
    intent?: string;
  }>;
  prompt: string;
  llmConfig: LLMConfig;
  format: string;
  trace?: TraceBuilder;
  /** Storyboard image (one frame per scene, tiled) for a cross-scene VISUAL pass.
   *  When provided, the critique judges the rendered output, not just metadata. */
  storyboardBase64?: string;
}): Promise<EditorialCritiqueResult> {
  var visualBlock = opts.storyboardBase64 ? `

## VISUAL REVIEW (a storyboard image is attached -- ONE frame per scene, in order)
You are shown a storyboard: one rendered frame per scene, tiled left-to-right, top-to-bottom, in scene order. Judge the RENDERED output, not just the metadata.

### Plan fidelity (MOST IMPORTANT)
Each scene below has an "intent:" -- what the PLAN set out to achieve for that scene. For EACH scene, compare its rendered frame against its intent and decide: did the scene actually DELIVER what the plan intended? Flag any scene whose frame does NOT achieve its intent -- e.g. the plan said "show a grid of search results" but the frame is empty/wrong, or "reveal the logo" but no logo is visible, or "the Canva editor adds a headline" but nothing was added. BE CONSERVATIVE: emit a "fix_scene" fix ONLY when a scene CLEARLY and OBVIOUSLY fails to deliver its intent -- it is empty, broken, shows the wrong thing, or is missing the central element the plan called for. If a scene delivers its intent, do NOT flag it even if it could be more polished. A solid video should produce ZERO fix_scene fixes; regenerating a scene that already works risks making it worse, so reserve fix_scene for real misses. For each genuine miss, emit { "type": "fix_scene", "scene_index": N, "detail": "<what's missing vs the intent and how to fix it>" }.

### Cross-scene coherence
Also call out cross-scene defects the per-scene critique cannot see:
- a REQUIRED brand asset (e.g. the logo) present in some scenes but MISSING where it belongs (hero/outro)
- a scene that looks BROKEN or far lower quality than the rest (overlaps, empty/placeholder, clutter)
- visual SAMENESS -- scenes that look near-identical even if their component types differ
- abrupt/jarring visual jumps between adjacent scenes` : "";

  var systemPrompt = `You are an editorial director reviewing the full structure of a ${opts.format} project. Evaluate the project as a WHOLE, not individual scenes.

${EDITORIAL_CRITIQUE}
${visualBlock}

## Output Format

You MUST output valid JSON (no markdown fences, no commentary):

{
  "overall_score": 7,
  "pacing_score": 8,
  "variety_score": 6,
  "coherence_score": 7,
  "issues": [
    "Scenes 3 and 4 both use center-stage layout with stat-cards",
    "No breathing scene between the dense bento grid and the code showcase"
  ],
  "fixes": [
    { "type": "vary_layout", "scene_index": 3, "detail": "Change scene 4 to a split-canvas layout to break the repetition" },
    { "type": "add_breathing", "scene_index": 4, "detail": "Add a B1 Visual Pause between scenes 4 and 5" }
  ]
}

Rules:
- Scores are 1-10 for each dimension
- overall_score is NOT an average -- it's your gut feeling about the whole video's quality
- Be specific about which scenes have issues
- fixes should be actionable (reference scene indices, specific changes)
- Output ONLY JSON`;

  var sceneSummary = opts.scenes.map((s, i) =>
    `Scene ${i + 1}: "${s.label}" | ${s.duration_seconds}s | components: [${s.component_types.join(", ")}] | ~${s.word_count} words | transition: ${s.transition_in?.type || "none"}` +
    (s.intent ? `\n   intent: ${s.intent}` : "")
  ).join("\n");

  var userText = `## Original Prompt\n${opts.prompt}\n\n## Storyboard\n${sceneSummary}\n\nEvaluate the full video flow.`;
  var userContent: string | LLMContentPart[] = opts.storyboardBase64
    ? [
        { type: "text", text: userText + "\n\nThe attached storyboard image shows one frame per scene, in order:" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${opts.storyboardBase64}` } },
      ]
    : userText;

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ], { temperature: 0.3 });

  var result: EditorialCritiqueResult;
  try {
    result = JSON.parse(stripJsonFences(raw));
  } catch (e) {
    return {
      overall_score: 7,
      pacing_score: 7,
      variety_score: 7,
      coherence_score: 7,
      issues: [],
      fixes: [],
    };
  }

  return {
    overall_score: result.overall_score || 7,
    pacing_score: result.pacing_score || 7,
    variety_score: result.variety_score || 7,
    coherence_score: result.coherence_score || 7,
    issues: result.issues || [],
    fixes: result.fixes || [],
  };
}

function stripJsonFences(raw: string): string {
  var trimmed = raw.trim();
  var match = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (match) return match[1].trim();
  return trimmed;
}
