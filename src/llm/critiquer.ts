/**
 * Visual Critiquer
 *
 * Reviews a rendered preview image and suggests improvements.
 * Uses vision (image input) to evaluate the rendered scene.
 */

import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import { critiquerSystemPrompt } from "./prompts.js";
import type { TraceBuilder } from "../trace/index.js";

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

/**
 * Critique a rendered scene by analyzing its preview image.
 */
export async function critiqueScene(opts: CritiqueSceneOpts): Promise<CritiqueResult> {
  var dataUrl = `data:image/png;base64,${opts.previewImageBase64}`;

  // Build multi-modal message
  var userContent: LLMContentPart[] = [
    {
      type: "text",
      text: `## Original Prompt\n${opts.prompt}\n\n## Scene HTML\n\`\`\`html\n${opts.sceneHtml}\n\`\`\`\n\nPlease review the rendered preview image below and provide your critique as JSON.`,
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

  // Parse JSON response
  var result: CritiqueResult;
  try {
    result = JSON.parse(stripJsonFences(raw));
  } catch (e) {
    throw new Error(`Critiquer returned invalid JSON: ${raw.substring(0, 200)}`);
  }

  // Validate score range
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

function stripJsonFences(raw: string): string {
  var trimmed = raw.trim();
  var match = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (match) return match[1].trim();
  return trimmed;
}
