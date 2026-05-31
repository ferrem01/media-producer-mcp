/**
 * Component Generator (LLM-powered)
 *
 * Generates a .component.html from a natural language prompt using the
 * LLM client. Uses the canonical component system prompt from prompts.ts.
 */

import { callLLM, type LLMConfig } from "./client.js";
import { componentSystemPrompt } from "./prompts.js";
import type { BrandKit } from "../core/types.js";

export interface GenerateComponentOpts {
  prompt: string;
  llmConfig: LLMConfig;
  brandKit?: BrandKit;
  duration?: number;
}

export interface GenerateComponentOutput {
  source: string;
  type: string;
}

/**
 * Generate a .component.html from a prompt using the LLM.
 */
export async function generateComponentLLM(
  opts: GenerateComponentOpts,
): Promise<GenerateComponentOutput> {
  var userPrompt = opts.prompt;

  // Add brand kit context if available
  if (opts.brandKit) {
    var brandContext = formatBrandContext(opts.brandKit);
    userPrompt = `${userPrompt}\n\n## Brand Kit\n${brandContext}`;
  }

  if (opts.duration) {
    userPrompt += `\n\nTarget duration: ${opts.duration} seconds.`;
  }

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: componentSystemPrompt() },
    { role: "user", content: userPrompt },
  ], { temperature: 0.7 });

  var source = extractComponentSource(raw);
  var type = deriveTypeName(opts.prompt);

  return { source, type };
}

/**
 * Extract component source from LLM output.
 * Strips markdown code fences if present.
 */
export function extractComponentSource(raw: string): string {
  var source = raw.trim();

  // Remove markdown fences: ```html ... ``` or ``` ... ```
  var fenceMatch = source.match(/```(?:html)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    source = fenceMatch[1].trim();
  }

  // Validate required sections
  if (!source.includes("<template>")) {
    throw new Error("Generated component missing <template> section");
  }
  if (!source.includes("<script>")) {
    throw new Error("Generated component missing <script> section");
  }
  if (!source.includes("createTimeline")) {
    throw new Error("Generated component missing createTimeline function");
  }

  return source;
}

/**
 * Derive a kebab-case type name from a prompt.
 */
export function deriveTypeName(prompt: string): string {
  var words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => !["a", "an", "the", "create", "make", "build", "generate", "component", "for", "with", "that", "and", "or"].includes(w))
    .slice(0, 3);

  if (words.length === 0) return "custom-component";
  return words.join("-");
}

function formatBrandContext(kit: BrandKit): string {
  var lines: string[] = [];
  lines.push(`Colors: primary=${kit.colors.primary}, secondary=${kit.colors.secondary}, accent=${kit.colors.accent}`);
  lines.push(`Background: ${kit.colors.background}, Surface: ${kit.colors.surface}`);
  lines.push(`Text: ${kit.colors.text}, Muted: ${kit.colors.text_muted}`);

  if (kit.fonts.length > 0) {
    lines.push(`Font: ${kit.fonts[0].family}`);
  }

  if (kit.style?.motion) {
    lines.push(`Motion style: ${kit.style.motion}`);
  }

  if (kit.style?.border_radius) {
    lines.push(`Border radius: ${kit.style.border_radius}`);
  }

  return lines.join("\n");
}
