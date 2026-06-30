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

export interface ConsolidatedCritiqueResult {
  /** Aesthetic score 1-10 (functional + premium "feel" combined). */
  score: number;
  issues: string[];
  suggestions: string[];
  /** Hard, blocking layout defects (the correctness taxonomy). */
  defects: CorrectnessDefect[];
}

const SYSTEM_PROMPT = `You are a senior motion-graphics art director AND a strict layout-defect inspector for rendered video scenes. In ONE review you do THREE jobs on the SAME frame(s):

A. FUNCTIONAL — is it readable and well-laid-out? Check text contrast, overflow/clipping, spacing, alignment, hierarchy, and that the intended content is present. Every card/window/panel/surface must be a clearly DISTINCT VALUE from the page background, with visible edges (a real border and/or shadow) — a surface that is only a hair lighter/darker than the background is effectively invisible.
B. PREMIUM — does it feel EXPENSIVE (Apple-keynote quality) rather than amateur? Reward intentional negative space, typographic craft, color depth, restraint, and polish. Penalize amateur tells: cramped layouts, flat default gradients, generic system-font slabs, everything-centered, harsh pure-black/white, no depth. BUT distinguish intentional negative space from a half-empty, under-filled, or washed-out frame — emptiness that reads as unfinished is a DEFECT (dead_frame), not restraint.

MOOD IS NOT AN EXCUSE: when the visual notes use mood words — "muted", "desaturated", "faded", "gray-tinted", "tired", "the color of exhaustion" — they describe SATURATION only, NEVER contrast, visibility, or completeness. They do NOT excuse invisible surfaces, illegible text, empty skeletons, dropped elements, or a dead/empty frame. Hold the scene to every defect rule below regardless of stated mood.

C. DEFECTS — actively HUNT for ways the scene is BROKEN or off-spec, and report each as a typed defect:
  - "overlap": text/UI collide so content is obscured or smashed together.
  - "off_canvas": text/content clipped or truncated at a panel/frame edge.
  - "illegible": text unreadable — low contrast (dark-on-dark or light-on-light), overlapping, or garbled.
  - "invisible_surface": a card/window/panel/surface whose fill is nearly the same VALUE as the page background, with no clearly visible border or shadow, so its edges are hard to find — EVEN IF any text on it happens to be readable. The washed-out, ghostly panel is a real defect.
  - "empty_skeleton": a UI container (window, card, dashboard, table) shows placeholder/wireframe bars, blank fields, or lorem-style stubs instead of believable, specific content (real-looking headlines, rows, labels, metrics). Reads as unfinished.
  - "dropped_element": a concrete element the VISUAL NOTES explicitly name — a spark, cursor, glow, connecting line, badge, arrow, specific named window/label, or a specific transition — is absent from the final frame AND from EVERY contact-sheet frame. TRANSIENT elements (a flash, spark, ripple, field line, glow, crack, motion trail, or any beat the notes say appears briefly / pulses / then dissolves) only need to appear in ONE contact-sheet frame to count as rendered — their ABSENCE from the final frame is CORRECT and is NOT a defect. Only report dropped_element when the element appears in NO frame at all.
  - "dead_frame": a large region of the canvas is unused emptiness that is not a deliberate single-hero composition (an empty band taller than ~25% of frame height, or a whole bare quadrant) — OR the visual notes call for dense / overlapping / colliding / stacked / crowded / chaotic content but the layout is sparse, tidy, evenly-spaced, and non-touching.
  - "intent_mismatch": the emotional intent stated in the visual notes / purpose (overwhelm, chaos, energy, momentum, calm, relief) is NOT visible in the COMPOSITION across the frames — e.g. visual notes that ask for chaotic / overwhelmed / fighting-for-space rendered as a calm, serene, orderly layout. Judge this from the LAYOUT (density, overlap, arrangement), NOT from apparent motion: a still frame cannot show velocity or motion blur, so NEVER report intent_mismatch because a single frame "looks static / frozen / not mid-explosion." Energy that is purely kinetic (speed, blur, trails) is not judgeable from stills — do not penalize it.
  - "stray_ui": a prominent element clearly unrelated to the scene's purpose.
  - "missing_asset": a REQUIRED asset named below is not visibly present.
  - "off_brand_theme": the theme doesn't match the brand (see BRAND THEME below) — only report when a BRAND THEME is stated.

You are shown the scene's intended content, the FINAL frame, and (when present) a CONTACT SHEET of frames across the timeline (left→right = earlier→later) for evaluating motion/pacing. Use the visual notes to judge "dropped_element", "dead_frame", and "intent_mismatch": compare what the visual notes ask for against what rendered across ALL the frames, not just the final one. An element that the notes describe as appearing earlier in the timeline counts as present if it shows up in ANY contact-sheet frame; a beat that has clearly happened by the final frame (a transition completed, a transient effect dissolved, an element that animated away) is correct, not missing.

Scoring: 'score' is 1-10 for overall scene quality combining FUNCTIONAL + PREMIUM. A clean, polished, on-spec scene with no defects scores 8-10. A scene with ANY blocking defect should score below 7 and list the defect(s). Do NOT invent defects, but do NOT excuse real ones as "intentional."

Output ONLY this JSON (no markdown, no commentary):
{ "score": <1-10>, "issues": ["concrete problem to fix", ...], "suggestions": ["optional improvement", ...], "defects": [ { "type": "invisible_surface", "detail": "name the element and where, and what's wrong" } ] }
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
  if (opts.requiresLogo) spec.push(`REQUIRED ASSET: the brand LOGO IMAGE must be visibly present (a styled text wordmark or blank placeholder does NOT count -> "missing_asset").`);
  if (opts.mediaBackground) spec.push(`NOTE: this scene's background is real footage / a photographic hero image -- NOT a brand surface. Light text over a scrim/darkened footage is CORRECT and expected here; do NOT report "off_brand_theme" for the footage background or for light captions over it. Only flag a theme problem if a COMPOSED UI surface (a card/panel, not the footage) inverts the brand.`);
  else if (opts.brandTheme === "light") spec.push(`BRAND THEME: LIGHT brand -- background MUST be light with DARK text. Report "off_brand_theme" for a dark background/panel or light text on a light area.`);
  else if (opts.brandTheme === "dark") spec.push(`BRAND THEME: DARK brand -- background should be dark with light text. Report "off_brand_theme" only if it jarringly renders light against the dark brand.`);
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
    parsed = JSON.parse(raw.trim().replace(/^```json?\s*/i, "").replace(/```$/i, "").trim());
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
