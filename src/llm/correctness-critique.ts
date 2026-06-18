/**
 * Correctness critique — a STRICT inspector that judges whether a rendered scene
 * is BROKEN or violates its spec, independent of how pretty it is.
 *
 * The aesthetic critiquer (multi-pass-critiquer) grades taste — visual weight,
 * typography, color, motion polish — and happily passes scenes that look premium
 * at a glance but are functionally broken (overlapping elements, chips stacked
 * instead of sequenced, stray UI, a missing required logo). This inspector closes
 * that gap: it looks at the same contact sheet + final frame and reports only
 * unambiguous, blocking DEFECTS, so the critique loop can force a regeneration.
 */

import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";

export interface CorrectnessDefect {
  /** overlap | off_canvas | not_sequenced | illegible | stray_ui | missing_asset | other */
  type: string;
  detail: string;
}

export interface CorrectnessResult {
  pass: boolean;
  defects: CorrectnessDefect[];
}

function extractJson(raw: string): string {
  // Prefer a fenced block if present.
  const fence = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) return fence[1].trim();
  // Otherwise slice from the first { to the last } -- tolerates preamble like
  // "Looking at the frames, ... { ... }" that some models emit before the JSON.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

const SYSTEM_PROMPT = `You are a STRICT layout-defect inspector for rendered video scenes. You are NOT judging beauty, taste, or polish — another system grades that. Your ONLY job is to actively HUNT for ways the scene is BROKEN or violates its spec, then report what you find.

You are shown the scene's intended content, the FINAL frame, and a CONTACT SHEET (frames across the timeline, left→right = earlier→later). Scan the frames carefully and literally — read the actual text, follow where each element sits — and look for every instance of these defect types:
- "overlap": text or UI elements collide so content is obscured, doubled, or smashed together (e.g. a headline rendered on top of another headline; a message bubble overlapping a chip). Clean, legible layering is NOT a defect — only collisions that hurt legibility or look accidental.
- "off_canvas": text or content is clipped/truncated at a panel or frame edge (e.g. sidebar labels showing only "xt", "nd", "ols").
- "not_sequenced": ordered items (chat messages, tool-call chips, steps) are rendered as a DISORDERED or OVERLAPPING pile — colliding with each other, crammed without separation, scattered, or out of order. IMPORTANT: an orderly, clearly-separated thread/list is FINE even if every message is visible at once — do NOT flag a tidy list just because there is no progressive reveal. Only flag a genuinely messy, colliding, or out-of-order heap.
- "illegible": text unreadable — low contrast (dark on dark OR light/white on light), overlapping other text, or garbled/duplicated characters.
- "stray_ui": a prominent UI element clearly unrelated to the scene's purpose (e.g. a billing/pricing/settings panel inside a social post).
- "missing_asset": a REQUIRED asset named below is not visibly present.
- "off_brand_theme": the scene's theme doesn't match the brand (see BRAND THEME below) — e.g. a dark background/panel or white text on a LIGHT brand. Only report when a BRAND THEME is stated below.

How to decide:
- Actively look for each defect type. If you can point to a specific element where it happens, report it with a concrete detail (quote the colliding/clipped text).
- Report ONLY correctness, never aesthetics (don't mention spacing, font choice, color mood, "could be bolder").
- Do NOT invent defects — but do NOT excuse real ones as "intentional." A clean, well-laid-out scene legitimately has zero defects and passes.
- pass=false if you find ANY defect; pass=true only if you find none.

Respond with ONLY the JSON object — no preamble, no explanation, no markdown fences. Begin your reply with the character {.
{ "pass": true, "defects": [] }
or
{ "pass": false, "defects": [ { "type": "overlap", "detail": "the headline 'Launch Day is Here' collides with the 'LinkedIn Banner — Launch Day' title behind it" } ] }`;

export async function critiqueCorrectness(opts: {
  finalFrameBase64: string;
  contactSheetBase64?: string;
  contactTimestamps?: number[];
  /** What the scene is supposed to show (purpose + brief). */
  briefText: string;
  /** Library components the scene is expected to feature. */
  expectedComponents?: string[];
  /** When true, the scene must visibly show the brand logo image. */
  requiresLogo?: boolean;
  /** The brand's theme. A LIGHT brand must render on a light background with
   *  dark text; a dark element/white text on a light brand is off-brand. */
  brandTheme?: "light" | "dark";
  llmConfig: LLMConfig;
}): Promise<CorrectnessResult> {
  const specLines = [
    `SCENE PURPOSE / BRIEF:\n${opts.briefText}`,
  ];
  if (opts.expectedComponents?.length) {
    specLines.push(`EXPECTED UI: ${opts.expectedComponents.join(", ")}`);
  }
  if (opts.requiresLogo) {
    specLines.push(`REQUIRED ASSET: the brand LOGO IMAGE must be visibly present (a styled text wordmark or a blank placeholder does NOT count -> report "missing_asset").`);
  }
  if (opts.brandTheme === "light") {
    specLines.push(`BRAND THEME: this is a LIGHT brand -- the scene background MUST be light with DARK text. Report "off_brand_theme" if the scene has a DARK background/panel, or light/white text on a light area (low-contrast), or otherwise reads as a dark-themed scene. A dark scene on a light brand is off-brand.`);
  } else if (opts.brandTheme === "dark") {
    specLines.push(`BRAND THEME: this is a DARK brand -- the scene background should be dark with light text. Report "off_brand_theme" only if it jarringly renders light/white against the dark brand.`);
  }
  if (opts.contactSheetBase64 && opts.contactTimestamps?.length) {
    specLines.push(`The contact sheet frames are at: ${opts.contactTimestamps.map((t) => t.toFixed(1) + "s").join(", ")}.`);
  }

  const userContent: LLMContentPart[] = [
    { type: "text", text: specLines.join("\n\n") + "\n\nInspect the frames for blocking defects." },
    { type: "image_url", image_url: { url: `data:image/png;base64,${opts.finalFrameBase64}` } },
  ];
  if (opts.contactSheetBase64) {
    userContent.push({ type: "text", text: "CONTACT SHEET (time left→right):" });
    userContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${opts.contactSheetBase64}` } });
  }

  try {
    const raw = await callLLM(opts.llmConfig, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ], { temperature: 0 });
    const parsed = JSON.parse(extractJson(raw));
    const defects: CorrectnessDefect[] = Array.isArray(parsed.defects)
      ? parsed.defects.filter((d: any) => d && typeof d.detail === "string").map((d: any) => ({ type: String(d.type || "other"), detail: String(d.detail) }))
      : [];
    // Trust explicit pass flag, but never "pass" while reporting defects.
    const pass = parsed.pass === true && defects.length === 0;
    return { pass, defects };
  } catch (e: any) {
    // Fail OPEN: a flaky inspector call must not block generation. Log and pass.
    console.warn(`  [correctness] inspector failed (${e.message}); skipping correctness gate for this attempt`);
    return { pass: true, defects: [] };
  }
}

/** Render defects as a fix-prompt block the scene generator can act on. */
export function formatCorrectnessDefects(defects: CorrectnessDefect[]): string {
  if (!defects.length) return "";
  return "\n\n!! CORRECTNESS DEFECTS (must fix -- the scene is BROKEN, not just imperfect):\n" +
    defects.map((d, i) => `${i + 1}. [${d.type}] ${d.detail}`).join("\n") +
    "\nThese are blocking: overlapping/clipped/illegible content, elements stacked instead of sequenced in order, stray unrelated UI, or a missing required asset. Lay elements out so nothing collides, sequence ordered items one at a time, keep everything on-canvas and legible, remove anything not asked for, and ensure required assets are visibly present.\n";
}
