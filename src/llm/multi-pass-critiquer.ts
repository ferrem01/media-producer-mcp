/**
 * Multi-Pass Visual Critiquer
 *
 * Three-pass critique system:
 *   Pass 1: Functional -- readability, overflow, contrast, layout
 *   Pass 2: Premium -- does it feel expensive? Apple-quality?
 *   Pass 3: Editorial -- full video flow, pacing, variety (across all scenes)
 *
 * Pass 1 and 2 run per-scene. Pass 3 runs once after all scenes are generated.
 */

import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import { critiquerSystemPrompt } from "./prompts.js";
import { PREMIUM_QUALITY_CHECKLIST, EDITORIAL_CRITIQUE } from "./cinematography.js";
import type { TraceBuilder } from "../trace/index.js";
import type { Scene } from "../core/types.js";

export interface CritiqueSceneOpts {
  sceneHtml: string;
  /** Base64-encoded preview image (PNG) */
  previewImageBase64: string;
  prompt: string;
  llmConfig: LLMConfig;
  format?: string;
  trace?: TraceBuilder;
  critiqueRound?: number;
}

export interface CritiqueResult {
  score: number;
  issues: string[];
  suggestions: string[];
  revised_html?: string;
}

export interface PremiumCritiqueResult {
  total_score: number;
  categories: {
    visual_weight: number;
    negative_space: number;
    typography_craft: number;
    color_depth: number;
    motion_craft: number;
    detail_polish: number;
    emotional_impact: number;
  };
  issues: string[];
  suggestions: string[];
  revised_html?: string;
}

export interface EditorialCritiqueResult {
  overall_score: number;
  pacing_score: number;
  variety_score: number;
  coherence_score: number;
  issues: string[];
  fixes: Array<{
    type: "swap_scenes" | "add_breathing" | "shorten_scene" | "vary_layout" | "vary_transition" | "adjust_energy";
    scene_index?: number;
    detail: string;
  }>;
}

/**
 * Pass 1: Functional critique.
 * Checks readability, overflow, contrast, layout.
 * This is the existing critiquer behavior.
 */
export async function critiqueFunctional(opts: CritiqueSceneOpts): Promise<CritiqueResult> {
  var dataUrl = `data:image/png;base64,${opts.previewImageBase64}`;

  var userContent: LLMContentPart[] = [
    {
      type: "text",
      text: `## Original Prompt\n${opts.prompt}\n\n## Scene HTML\n\`\`\`html\n${opts.sceneHtml}\n\`\`\`\n\nPlease review the rendered preview image below and provide your FUNCTIONAL critique as JSON. Focus on: readability, text contrast, overflow, layout issues, missing content.`,
    },
    {
      type: "image_url",
      image_url: { url: dataUrl },
    },
  ];

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: critiquerSystemPrompt(opts.format) },
    { role: "user", content: userContent },
  ], { temperature: 0.3 });

  var result: CritiqueResult;
  try {
    result = JSON.parse(stripJsonFences(raw));
  } catch (e) {
    throw new Error(`Critiquer (pass 1) returned invalid JSON: ${raw.substring(0, 200)}`);
  }

  if (typeof result.score !== "number" || result.score < 1 || result.score > 10) {
    result.score = 5;
  }

  if (opts.trace) {
    opts.trace.addCritique(
      opts.critiqueRound ?? 0,
      result.score,
      (result.issues || []).length,
      !!result.revised_html,
      result.score >= 7,
    );
  }

  return {
    score: result.score,
    issues: result.issues || [],
    suggestions: result.suggestions || [],
    revised_html: result.revised_html,
  };
}

/**
 * Pass 2: Premium quality critique.
 * Evaluates whether the scene feels "expensive" -- Apple keynote quality.
 * Only runs on scenes that passed functional critique (score >= 7).
 */
export async function critiquePremium(opts: CritiqueSceneOpts): Promise<PremiumCritiqueResult> {
  var dataUrl = `data:image/png;base64,${opts.previewImageBase64}`;

  var systemPrompt = `You are a premium quality evaluator for a media production system. You assess whether rendered scenes meet Apple-keynote-level production quality.

${PREMIUM_QUALITY_CHECKLIST}

## Output Format

You MUST output valid JSON (no markdown fences, no commentary):

{
  "total_score": 52,
  "categories": {
    "visual_weight": 8,
    "negative_space": 7,
    "typography_craft": 7,
    "color_depth": 8,
    "motion_craft": 7,
    "detail_polish": 8,
    "emotional_impact": 7
  },
  "issues": [
    "Typography lacks letter-spacing on the headline, feels generic",
    "Background is a single flat gradient, needs more depth"
  ],
  "suggestions": [
    "Add letter-spacing: -0.03em to headline",
    "Layer a second radial gradient with accent color at 10% opacity"
  ],
  "revised_html": "<template>...</template><style>...</style><script>...</script>"
}

Rules:
- Score each category 1-10
- total_score is the SUM (max 70)
- Only include revised_html if total_score < 49 (below premium threshold)
- Be specific in suggestions (exact CSS values, exact GSAP properties)
- Output ONLY JSON`;

  var userContent: LLMContentPart[] = [
    {
      type: "text",
      text: `## Scene HTML\n\`\`\`html\n${opts.sceneHtml}\n\`\`\`\n\nEvaluate the rendered preview against the premium quality checklist.`,
    },
    {
      type: "image_url",
      image_url: { url: dataUrl },
    },
  ];

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ], { temperature: 0.3 });

  var result: PremiumCritiqueResult;
  try {
    result = JSON.parse(stripJsonFences(raw));
  } catch (e) {
    // If parsing fails, return a pass-through result
    return {
      total_score: 49,
      categories: {
        visual_weight: 7, negative_space: 7, typography_craft: 7,
        color_depth: 7, motion_craft: 7, detail_polish: 7, emotional_impact: 7,
      },
      issues: [],
      suggestions: [],
    };
  }

  return {
    total_score: result.total_score || 0,
    categories: result.categories || {
      visual_weight: 5, negative_space: 5, typography_craft: 5,
      color_depth: 5, motion_craft: 5, detail_polish: 5, emotional_impact: 5,
    },
    issues: result.issues || [],
    suggestions: result.suggestions || [],
    revised_html: result.revised_html,
  };
}

/**
 * Pass 3: Editorial critique (full video flow).
 * Runs ONCE after all scenes are generated.
 * Evaluates pacing, variety, narrative arc, coherence.
 *
 * Input: Array of scene metadata (labels, durations, layouts, transitions).
 * Does NOT require rendered images -- this is structural/editorial analysis.
 */
export async function critiqueEditorial(opts: {
  scenes: Array<{
    label: string;
    duration_seconds: number;
    transition_in?: { type: string; duration_seconds: number };
    component_types: string[];
    word_count: number;
  }>;
  prompt: string;
  llmConfig: LLMConfig;
  format: string;
  trace?: TraceBuilder;
}): Promise<EditorialCritiqueResult> {
  var systemPrompt = `You are an editorial director reviewing the full structure of a ${opts.format} project. Evaluate the project as a WHOLE, not individual scenes.

${EDITORIAL_CRITIQUE}

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
    `Scene ${i + 1}: "${s.label}" | ${s.duration_seconds}s | components: [${s.component_types.join(", ")}] | ~${s.word_count} words | transition: ${s.transition_in?.type || "none"}`
  ).join("\n");

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `## Original Prompt\n${opts.prompt}\n\n## Storyboard\n${sceneSummary}\n\nEvaluate the full video flow.` },
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

/**
 * Combined multi-pass critique for a single scene.
 * Pass 1 (functional) always runs. Pass 2 (premium) only if pass 1 scores >= 7.
 */
export async function critiqueScene(opts: CritiqueSceneOpts): Promise<CritiqueResult> {
  // Pass 1: Functional
  var functional = await critiqueFunctional(opts);

  // If functional critique fails hard, return it (scene needs rebuild)
  if (functional.score < 7) {
    console.log(`  Critique pass 1: score ${functional.score} (below threshold, skipping premium pass)`);
    return functional;
  }

  console.log(`  Critique pass 1: score ${functional.score} (passed, running premium pass)`);

  // Pass 2: Premium quality
  var premium = await critiquePremium(opts);
  console.log(`  Critique pass 2: premium score ${premium.total_score}/70`);

  // If premium critique has fixes, use those
  if (premium.total_score < 49 && premium.revised_html) {
    return {
      score: Math.min(functional.score, Math.round(premium.total_score / 7)),
      issues: [...functional.issues, ...premium.issues],
      suggestions: [...functional.suggestions, ...premium.suggestions],
      revised_html: premium.revised_html,
    };
  }

  // If premium passes but has suggestions, return functional score with premium suggestions
  if (premium.issues.length > 0) {
    return {
      score: functional.score,
      issues: [...functional.issues, ...premium.issues],
      suggestions: [...functional.suggestions, ...premium.suggestions],
    };
  }

  return functional;
}

function stripJsonFences(raw: string): string {
  var trimmed = raw.trim();
  var match = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (match) return match[1].trim();
  return trimmed;
}
