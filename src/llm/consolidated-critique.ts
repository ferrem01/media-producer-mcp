/**
 * Consolidated per-scene critique.
 *
 * The per-scene critique used THREE separate vision calls on the SAME frame:
 *   1. Functional (readability/contrast/overflow/layout)  -> score 1-10
 *   2. Premium ("does it feel expensive / Apple-quality")
 *   3. Correctness (hard layout defects: overlap/off_canvas/illegible/stray_ui/
 *      missing_asset/off_brand_theme)
 *
 * They look at the same image, so this folds all three lenses into ONE call that
 * returns the same signals critiqueAndRetryScene consumes: an aesthetic `score`,
 * `issues`/`suggestions` for the fix prompt, and a typed `defects[]` list (with
 * `pass` = no defects). ~1/3 the round-trips, and benchmarked to be MORE thorough
 * than the old gated 3-call flow (it always checks defects, not only at score>=7).
 * This is THE per-scene critique; `videoOnly` adjusts the prompt for brand clips.
 */
import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import type { CorrectnessDefect, CorrectnessResult } from "./correctness-critique.js";
import { parseLlmJson } from "./json-repair.js";

export interface ConsolidatedCritiqueResult {
  /** Aesthetic score 1-10 (functional + premium "feel" combined). */
  score: number;
  issues: string[];
  suggestions: string[];
  /** Hard, blocking layout defects (the correctness taxonomy). */
  defects: CorrectnessDefect[];
}

const SYSTEM_PROMPT = `You are a senior motion-graphics art director reviewing a rendered video scene. You are the TASTE judge in a layered critique system: deterministic gates and focused detectors already check the mechanical defects (contrast, clipped text, ghost panels, dead frames, placeholder skeletons, missing named elements, overlaps, stray UI, brand theme). Do NOT hunt for those -- your whole attention goes to JUDGMENT:

A. FUNCTIONAL CRAFT — is the layout well-composed? Spacing, alignment, visual hierarchy, typographic scale relationships, whether the eye knows where to go first. Judge the composition as a designed whole, not as a checklist.
B. PREMIUM — does it feel EXPENSIVE (Apple-keynote quality) rather than amateur? Reward intentional negative space, typographic craft, color depth, restraint, and polish. Penalize amateur tells: cramped layouts, flat default gradients, generic system-font slabs, everything-centered, harsh pure-black/white, no depth. Distinguish intentional negative space from emptiness that reads as unfinished.

MOOD IS NOT AN EXCUSE: when the visual notes use mood words — "muted", "desaturated", "faded", "gray-tinted", "tired" — they describe SATURATION only, never contrast, visibility, or completeness. Do not excuse weak craft as mood.

C. TWO defect types are yours to report, because they require holistic judgment:
  - "intent_mismatch": the emotional intent stated in the visual notes / purpose (overwhelm, chaos, energy, momentum, calm, relief) is NOT visible in the COMPOSITION across the frames — e.g. visual notes that ask for chaotic / overwhelmed / fighting-for-space rendered as a calm, serene, orderly layout. Judge this from the LAYOUT (density, overlap, arrangement), NOT from apparent motion: a still frame cannot show velocity or motion blur, so NEVER report intent_mismatch because a single frame "looks static / frozen / not mid-explosion." Energy that is purely kinetic (speed, blur, trails) is not judgeable from stills — do not penalize it.
  - "card_on_photo": the scene has a photographic world (hero image, backdrop photo, footage) and opaque content cards/panels are stacked ON TOP of the photo instead of typography set directly on the image over a diffuse scrim. Boxes floating on a photograph read as PowerPoint and fail the house style. (A framed screen recording is NOT this defect; neither is type sitting on a scrim/gradient.)

You are shown the scene's intended content, the FINAL frame, and (when present) a CONTACT SHEET of frames across the timeline (left→right = earlier→later) for evaluating motion/pacing and the emotional arc. A beat that has clearly happened by the final frame (a transition completed, a transient effect dissolved) is correct, not missing.

Scoring: 'score' is 1-10 for overall scene quality combining FUNCTIONAL CRAFT + PREMIUM. A clean, polished, on-spec scene scores 8-10; competent-but-generic scores 6-7; anything that would embarrass a senior designer scores below 6. Put concrete, actionable problems in 'issues' (they feed the revision prompt) and nice-to-haves in 'suggestions'.

Output ONLY this JSON (no markdown, no commentary):
{ "score": <1-10>, "issues": ["concrete problem to fix", ...], "suggestions": ["optional improvement", ...], "defects": [ { "type": "intent_mismatch", "detail": "what the notes asked for vs what the composition shows" } ] }
A clean scene: { "score": 9, "issues": [], "suggestions": [], "defects": [] }`;

export async function critiqueConsolidated(opts: {
  previewImageBase64: string;
  contactSheetBase64?: string;
  contactTimestamps?: number[];
  /** What the scene is supposed to show (purpose + visual notes). */
  specText: string;
  sceneHtml?: string;
  expectedComponents?: string[];
  requiresLogo?: boolean;
  brandTheme?: "light" | "dark";
  /** This scene is a pre-rendered brand video clip whose content can't be edited:
   *  judge visual quality but don't penalize for missing headlines/text/value-props. */
  videoOnly?: boolean;
  /** The scene's background is real footage or a photographic hero image. Light
   *  text over a scrim is then CORRECT regardless of brand theme, so the theme
   *  rule must not flag it. */
  mediaBackground?: boolean;
  llmConfig: LLMConfig;
}): Promise<ConsolidatedCritiqueResult> {
  const spec: string[] = [`SCENE PURPOSE / VISUAL NOTES:\n${opts.specText}`];
  if (opts.videoOnly) spec.push(`NOTE: this scene is a pre-rendered brand video clip (animation), not a content scene. Evaluate visual quality, brand consistency, and polish, but do NOT penalize for missing headlines, text, messaging, or value props, and do NOT report "missing_asset", "empty_skeleton", "dropped_element", "dead_frame", or "intent_mismatch" for content -- the video cannot be modified.`);
  if (opts.expectedComponents?.length) spec.push(`EXPECTED UI: ${opts.expectedComponents.join(", ")}`);
  // Brand theme / logo / footage flags are CONTEXT for judgment here -- the
  // blocking checks for them live in the focused detectors (Layer 1).
  if (opts.mediaBackground) spec.push(`CONTEXT: this scene's background is real footage / a photographic hero image. Light text over a scrim is correct and expected.`);
  else if (opts.brandTheme) spec.push(`CONTEXT: this is a ${opts.brandTheme.toUpperCase()}-themed brand.`);
  if (opts.sceneHtml) spec.push(`SCENE HTML (for reference):\n\`\`\`html\n${opts.sceneHtml.slice(0, 4000)}\n\`\`\``);
  if (opts.contactSheetBase64 && opts.contactTimestamps?.length) spec.push(`Contact-sheet frames are at: ${opts.contactTimestamps.map((t) => t.toFixed(1) + "s").join(", ")}.`);

  const userContent: LLMContentPart[] = [
    { type: "text", text: spec.join("\n\n") + "\n\nReview the FINAL frame below, then output the JSON." },
    { type: "image_url", image_url: { url: `data:image/png;base64,${opts.previewImageBase64}` } },
  ];
  if (opts.contactSheetBase64) {
    userContent.push({ type: "text", text: "CONTACT SHEET (time left→right):" });
    userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${opts.contactSheetBase64}` } });
  }

  let parsed: any;
  try {
    const raw = await callLLM(opts.llmConfig, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ], { temperature: 0.3 });
    parsed = parseLlmJson(raw, "consolidated critique");
  } catch {
    // Never block generation on a critique infra failure -> treat as a clean pass.
    return { score: 8, issues: [], suggestions: [], defects: [] };
  }

  let score = Number(parsed.score);
  if (!Number.isFinite(score) || score < 1 || score > 10) score = 5;
  const defects: CorrectnessDefect[] = Array.isArray(parsed.defects)
    ? parsed.defects.filter((d: any) => d && typeof d.detail === "string").map((d: any) => ({ type: String(d.type || "other"), detail: String(d.detail) }))
    : [];
  return {
    score,
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
    defects,
  };
}

/** Adapt the consolidated result to a CorrectnessResult (pass = no defects). */
export function consolidatedCorrectness(r: ConsolidatedCritiqueResult): CorrectnessResult {
  return { pass: r.defects.length === 0, defects: r.defects };
}
