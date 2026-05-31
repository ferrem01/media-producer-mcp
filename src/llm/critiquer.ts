/**
 * Visual Critiquer
 *
 * Reviews a rendered preview image and suggests improvements.
 * Uses vision (image input) to evaluate the rendered scene.
 */

import fs from "node:fs/promises";
import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import { critiquerSystemPrompt } from "./prompts.js";

export interface CritiqueSceneOpts {
  sceneHtml: string;
  previewImagePath: string;
  prompt: string;
  llmConfig: LLMConfig;
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
  // Read the preview image and encode as base64
  var imageBuffer = await fs.readFile(opts.previewImagePath);
  var base64 = imageBuffer.toString("base64");
  var dataUrl = `data:image/png;base64,${base64}`;

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
    { role: "system", content: critiquerSystemPrompt() },
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
