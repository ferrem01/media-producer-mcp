/**
 * Creative Concept Director
 *
 * Runs BEFORE the unified planner. Its job is to commit to ONE strong
 * creative idea for the entire video. Without this, the planner generates
 * 8 mediocre scene ideas without a unifying concept.
 *
 * Flow:
 *   1. Generate 3 distinct creative concepts (high temperature)
 *   2. Self-critique and pick the strongest one
 *   3. Output a "creative bible" that the planner must follow
 *
 * The creative bible includes:
 *   - The one-line "big idea"
 *   - The storytelling pattern (from the visual storytelling guide)
 *   - The visual through-line (what persists/transforms across scenes)
 *   - The emotional arc
 *   - Key visual commitments (color mood, typography attitude, motion personality)
 */

import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import { getStorytellingGuide } from "./freeform-skills.js";
import type { BrandKit, OutputFormat, ReferenceImage } from "../core/types.js";
import {
  buildReferenceImageParts,
  buildReferenceImageSummary,
} from "./reference-images.js";

// ── Types ──

export interface ConceptDirectorOpts {
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  referenceImages?: ReferenceImage[];
}

export interface CreativeBible {
  /** The one-line concept that unifies the entire video */
  concept: string;
  /** The storytelling pattern being used */
  pattern: string;
  /** What visually persists or transforms across scenes */
  throughLine: string;
  /** The emotional journey: start -> middle -> end */
  emotionalArc: string;
  /** Visual style commitments for the whole project */
  visualStyle: {
    colorMood: string;
    typographyAttitude: string;
    motionPersonality: string;
    spatialStrategy: string;
  };
  /** 3-5 sentence summary the planner can use as creative direction */
  directorNote: string;
}

/**
 * Generate the creative bible for a project.
 * This is the missing "human creative director" step.
 */
export async function generateCreativeBible(opts: ConceptDirectorOpts): Promise<CreativeBible> {
  var storytellingGuide = getStorytellingGuide();

  var brandContext = buildBrandSummary(opts.brandKit);

  var systemPrompt = `You are a creative director at a top motion design studio. Your job is to come up with ONE brilliant creative concept for a video, NOT to plan scenes.

You think in concepts, not slides. A concept is the single unifying idea that makes a video memorable. Examples of strong concepts:
- "The feature assembles itself piece by piece, like a machine being built in real-time"
- "We zoom into the product like entering a world -- each feature is a room you walk through"
- "Two panels tell parallel stories that converge into one"
- "The old way crumbles apart while the new way grows from its pieces"

Bad concepts (these are NOT concepts, they are slide decks):
- "Show the hero, then features, then stats, then CTA"
- "Introduce the product, explain how it works, show benefits"

${storytellingGuide ? `## Storytelling Patterns You Can Use\n\n${storytellingGuide}\n\n` : ""}
${brandContext}

## Your Task

Given the project brief, generate THREE distinct creative concepts. Each concept should:
1. Be expressible in ONE sentence
2. Name the specific storytelling PATTERN it uses
3. Describe what VISUALLY persists or transforms across the video (the through-line)
4. Describe the emotional arc (what the viewer feels at start vs middle vs end)
5. Commit to a visual style (color mood, typography attitude, motion personality, spatial strategy)

Then pick the STRONGEST concept and explain why.

## Output Format (valid JSON, no markdown fences)

{
  "concepts": [
    {
      "idea": "One sentence describing the concept",
      "pattern": "The storytelling pattern name",
      "throughLine": "What visually persists/transforms",
      "emotionalArc": "curiosity -> discovery -> confidence",
      "visualStyle": {
        "colorMood": "e.g. deep indigo transitioning to warm amber",
        "typographyAttitude": "e.g. sharp and technical, becoming warmer",
        "motionPersonality": "e.g. precise mechanical movements that loosen into organic flows",
        "spatialStrategy": "e.g. tight close-ups opening into wide panoramas"
      }
    }
  ],
  "selected": 0,
  "selectionReason": "Why this concept is strongest",
  "directorNote": "3-5 sentence creative direction summary that a scene planner should follow"
}

## Rules
- Each concept must be FUNDAMENTALLY different (different pattern, different through-line, different feel)
- Concepts must be VISUAL, not narrative. Describe what the viewer SEES, not what a narrator says.
- The through-line must be concrete and filmable, not abstract ("trust grows" is abstract; "scattered UI fragments assemble into a complete dashboard" is filmable)
- The emotional arc must use specific emotions, not "good -> better -> best"
- Output ONLY valid JSON. No commentary.`;

  var userPrompt = `Create a ${opts.format} for:\n\n${opts.prompt}`;

  // Build user message with optional reference images
  var userContent: string | LLMContentPart[];
  if (opts.referenceImages?.length) {
    var refParts = buildReferenceImageParts(opts.referenceImages);
    userContent = [
      { type: "text" as const, text: userPrompt },
      ...refParts,
    ];
  } else {
    userContent = userPrompt;
  }

  console.log("  [concept-director] Generating creative concepts...");

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ], { temperature: 0.9, maxTokens: 4096 });

  var result = parseJsonResponse(raw);

  if (!result.concepts || result.concepts.length === 0) {
    throw new Error("Concept director returned no concepts");
  }

  var selectedIndex = result.selected ?? 0;
  var selected = result.concepts[selectedIndex];

  console.log(`  [concept-director] Generated ${result.concepts.length} concepts, selected #${selectedIndex + 1}: "${selected.idea}"`);
  console.log(`  [concept-director] Pattern: ${selected.pattern}`);
  console.log(`  [concept-director] Through-line: ${selected.throughLine}`);

  return {
    concept: selected.idea,
    pattern: selected.pattern,
    throughLine: selected.throughLine,
    emotionalArc: selected.emotionalArc,
    visualStyle: selected.visualStyle || {
      colorMood: "brand-driven",
      typographyAttitude: "confident and clean",
      motionPersonality: "fluid and purposeful",
      spatialStrategy: "layered depth with focus pulls",
    },
    directorNote: result.directorNote || `Concept: ${selected.idea}. Pattern: ${selected.pattern}. Through-line: ${selected.throughLine}.`,
  };
}

/**
 * Format the creative bible as context for the unified planner.
 */
export function formatCreativeBibleForPlanner(bible: CreativeBible): string {
  return `## Creative Direction (FOLLOW THIS -- every scene must serve this concept)

**THE CONCEPT:** ${bible.concept}

**Storytelling Pattern:** ${bible.pattern}
**Visual Through-Line:** ${bible.throughLine} -- this element must persist or evolve across scenes.
**Emotional Arc:** ${bible.emotionalArc}

**Visual Style Commitments:**
- Color mood: ${bible.visualStyle.colorMood}
- Typography attitude: ${bible.visualStyle.typographyAttitude}
- Motion personality: ${bible.visualStyle.motionPersonality}
- Spatial strategy: ${bible.visualStyle.spatialStrategy}

**Director's Note:** ${bible.directorNote}

IMPORTANT: Every scene you plan must serve this ONE concept. Do not generate disconnected scene ideas. The visual through-line (${bible.throughLine}) should be present or referenced in most scenes. The emotional arc should progress across the scene sequence.`;
}

// ── Helpers ──

function buildBrandSummary(brandKit: BrandKit): string {
  var lines: string[] = ["## Brand Context"];
  if (brandKit.colors) {
    var colorNames = Object.entries(brandKit.colors)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    lines.push(`Colors: ${colorNames}`);
  }
  if (brandKit.fonts?.length) {
    lines.push(`Fonts: ${brandKit.fonts.map(f => f.family).join(", ")}`);
  }
  if (brandKit.style?.motion) {
    lines.push(`Motion style: ${brandKit.style.motion}`);
  }
  if (brandKit.guidelines) {
    lines.push(`\nBrand guidelines: ${brandKit.guidelines}`);
  }
  return lines.join("\n");
}

function parseJsonResponse(raw: string): any {
  var trimmed = raw.trim();

  if (trimmed.startsWith("```")) {
    var firstNewline = trimmed.indexOf("\n");
    if (firstNewline > -1) trimmed = trimmed.substring(firstNewline + 1);
    var lastFence = trimmed.lastIndexOf("```");
    if (lastFence > -1) trimmed = trimmed.substring(0, lastFence);
    trimmed = trimmed.trim();
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    var first = trimmed.indexOf("{");
    var last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.substring(first, last + 1));
    }
    throw new Error(`Invalid JSON from concept director: ${trimmed.substring(0, 300)}`);
  }
}
