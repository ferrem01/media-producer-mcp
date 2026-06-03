/**
 * Prompt Expander
 *
 * The creative director layer. Detects thin prompts and expands them
 * into rich creative briefs before they hit the scene/project planner.
 *
 * Rich prompts pass through unchanged.
 */

import { callLLM, type LLMConfig, type LLMMessage } from "./client.js";
import { expanderSystemPrompt } from "./prompts.js";
import type { BrandKit, OutputFormat } from "../core/types.js";

export interface ExpanderOpts {
  /** The user's raw prompt */
  prompt: string;
  /** Target format */
  format: OutputFormat | "component" | "scene" | "presentation";
  /** LLM config */
  llmConfig: LLMConfig;
  /** Brand kit for style context */
  brandKit?: BrandKit;
  /** Desired scene count (optional hint) */
  sceneCount?: number;
  /** Desired total duration in seconds (optional hint) */
  duration?: number;
}

export interface ExpandedPrompt {
  /** Whether the prompt was expanded or passed through */
  expanded: boolean;
  /** The final prompt (expanded or original) */
  prompt: string;
  /** Detected narrative template (if expanded) */
  template?: string;
  /** Suggested scene count */
  sceneCount?: number;
}

/**
 * Detect whether a prompt is "thin" (needs expansion).
 * A thin prompt is short, vague, or lacks visual/structural direction.
 */
function isThinPrompt(prompt: string): boolean {
  const wordCount = prompt.trim().split(/\s+/).length;

  // Less than 15 words is always thin
  if (wordCount < 15) return true;

  // Less than 30 words and missing visual/structural cues
  if (wordCount < 30) {
    const hasVisualCues = /color|gradient|dark|light|style|layout|animation|transition|font|background/i.test(prompt);
    const hasStructuralCues = /scene|slide|section|intro|outro|title|feature|demo|comparison|pricing/i.test(prompt);
    if (!hasVisualCues && !hasStructuralCues) return true;
  }

  return false;
}

/**
 * Expand a thin prompt into a rich creative brief.
 * Rich prompts pass through unchanged.
 */
export async function expandPrompt(opts: ExpanderOpts): Promise<ExpandedPrompt> {
  const { prompt, format, llmConfig, brandKit, sceneCount, duration } = opts;

  // Skip expansion for component generation (already specific enough)
  if (format === "component") {
    return { expanded: false, prompt };
  }

  // Skip expansion for rich prompts
  if (!isThinPrompt(prompt)) {
    return { expanded: false, prompt };
  }

  // Build context for the expander
  const brandContext = brandKit
    ? `Brand colors: ${brandKit.colors.primary}, ${brandKit.colors.secondary}, ${brandKit.colors.accent}. Font: ${brandKit.fonts?.[0]?.family || "Inter"}. Motion style: ${brandKit.style?.motion || "cinematic"}.`
    : "";

  const formatContext = getFormatContext(format);
  const countHint = sceneCount ? `Target scene count: ${sceneCount}.` : "";
  const durationHint = duration ? `Target total duration: ${duration} seconds.` : "";

  const userMessage = [
    `Format: ${format}`,
    formatContext,
    brandContext,
    countHint,
    durationHint,
    "",
    `User prompt: "${prompt}"`,
    "",
    "Expand this into a rich creative brief.",
  ].filter(Boolean).join("\n");

  const messages: LLMMessage[] = [
    { role: "user", content: userMessage },
  ];

  const systemPrompt = expanderSystemPrompt();
  const expanded = await callLLM(llmConfig, messages, {
    systemPrompt,
    maxTokens: 2000,
    temperature: 0.7,
  });

  // Try to extract the scene count suggestion from the expanded prompt
  const suggestedCount = extractSceneCount(expanded);

  return {
    expanded: true,
    prompt: expanded.trim(),
    sceneCount: suggestedCount || sceneCount,
  };
}

/**
 * Get format-specific context for the expander.
 */
function getFormatContext(format: string): string {
  switch (format) {
    case "video":
    case "slideshow":
      return "This is a VIDEO (not a PowerPoint). Think CINEMATIC: one visual concept per scene, rich animated backgrounds, kinetic text, visual storytelling. NOT bullet lists or text-heavy slides. Each scene should feel like an Apple keynote moment, not a corporate presentation. Max 15 words visible per scene. Prefer visual components (browser-frame, device-mockup, stat-card, bar-chart) over text-list. Each scene is 3-5 seconds.";
    case "image":
      return "This is a single image. One scene, one powerful visual moment. Think about composition, typography, and visual hierarchy.";
    case "presentation":
      return "This is a presentation. Multiple slides, one key point per slide. Think about information hierarchy, readability, and visual consistency.";
    case "scene":
      return "This is a single scene within a larger project. Think about components, layout, and animation.";
    default:
      return "";
  }
}

/**
 * Extract suggested scene count from expanded prompt.
 */
function extractSceneCount(text: string): number | undefined {
  const match = text.match(/(\d+)\s*scenes?/i);
  if (match) {
    const n = parseInt(match[1]);
    if (n >= 2 && n <= 20) return n;
  }
  return undefined;
}
