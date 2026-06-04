/**
 * Revision Planner
 *
 * Dedicated planner for revising existing scenes. Unlike the unified planner
 * (which creates from scratch), this planner:
 * 1. Receives the exact existing components with their HTML source
 * 2. Assigns a strategy to each: keep / revise / replace / remove
 * 3. Can add new components
 *
 * This ensures revision preserves what works and only changes what's broken.
 */

import { callLLM, type LLMConfig } from "./client.js";
import { formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import { SCENE_PLANNER_DESIGN_RULES } from "./design-rules.js";
import type { BrandKit, Canvas, OutputFormat, SceneComponent } from "../core/types.js";

// ── Types ──

export type RevisionStrategy = "keep" | "revise" | "replace" | "remove";

export interface RevisedComponent {
  /** Original component id (null for new additions) */
  original_id?: string;
  /** Component type name */
  type: string;
  /** Component data props */
  data?: Record<string, unknown>;
  /** Position override */
  position?: { x: number | string; y: number | string; width?: number | string; height?: number | string };
  /** Z-index */
  z_index?: number;
  /** Revision strategy */
  strategy: RevisionStrategy;
  /** For strategy=revise: specific CSS/HTML changes to make (fed to SEARCH/REPLACE pipeline) */
  revise_instructions?: string;
  /** For strategy=replace or new custom components */
  custom?: boolean;
  custom_prompt?: string;
}

export interface RevisionPlan {
  label: string;
  duration_seconds: number;
  components: RevisedComponent[];
  /** Summary of what changed and why */
  revision_summary: string;
}

export interface RevisionPlannerOpts {
  /** User's revision instructions */
  prompt: string;
  /** Existing scene components with their props */
  existingComponents: SceneComponent[];
  /** Map of custom component type -> HTML source */
  customSources: Map<string, string>;
  /** Scene metadata */
  sceneLabel: string;
  sceneDuration: number;
  /** Project context */
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  componentCatalog: ComponentCatalogEntry[];
  tenantId: string;
}

/**
 * Plan a revision for an existing scene.
 * The planner sees the actual HTML source of custom components so it can
 * make informed decisions about what to keep vs change.
 */
export async function planRevision(opts: RevisionPlannerOpts): Promise<RevisionPlan> {
  const catalogStr = formatCatalogForPrompt(opts.componentCatalog);

  // Build existing component context with actual HTML source
  const componentContext = buildComponentContext(opts.existingComponents, opts.customSources);

  const systemPrompt = buildRevisionSystemPrompt(catalogStr, opts.canvas, opts.brandKit);

  const userPrompt = `## Current Scene
Label: ${opts.sceneLabel}
Duration: ${opts.sceneDuration}s
Canvas: ${opts.canvas.width}x${opts.canvas.height}
Format: ${opts.format}

## Current Components
${componentContext}

## Revision Request
${opts.prompt}

Return the revision plan as JSON.`;

  const raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { temperature: 0.3, maxTokens: 8192 });

  return parseRevisionPlan(raw, opts.existingComponents, opts.sceneDuration);
}

// ── Prompt Construction ──

function buildComponentContext(
  components: SceneComponent[],
  customSources: Map<string, string>,
): string {
  const lines: string[] = [];

  for (const comp of components) {
    lines.push(`### Component: ${comp.id} (type: "${comp.type}", z_index: ${comp.z_index ?? 0})`);

    if (comp.data && Object.keys(comp.data).length > 0) {
      lines.push(`Data props: ${JSON.stringify(comp.data)}`);
    }

    if (comp.position) {
      lines.push(`Position: ${JSON.stringify(comp.position)}`);
    }

    // Include actual HTML source for custom components
    const source = customSources.get(comp.type);
    if (source) {
      lines.push(`\nThis is a CUSTOM component. Full HTML source:`);
      lines.push("```html");
      lines.push(source);
      lines.push("```");
    } else {
      lines.push(`(Library component - no custom HTML)`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function buildRevisionSystemPrompt(
  catalogStr: string,
  canvas: Canvas,
  brandKit: BrandKit,
): string {
  // Brand asset context
  let brandAssetsSection = "";
  if (brandKit.assets?.backgrounds?.length) {
    brandAssetsSection += `\n\nBrand Background Images:\n`;
    for (const bg of brandKit.assets.backgrounds) {
      brandAssetsSection += `- "${bg.name}": ${bg.url} [tags: ${bg.tags.join(", ")}]\n`;
    }
  }
  if (brandKit.logos?.length) {
    brandAssetsSection += `\nBrand Logos:\n`;
    for (const logo of brandKit.logos) {
      brandAssetsSection += `- "${logo.name}" (${logo.variant}, ${logo.theme} theme): ${logo.url}\n`;
    }
  }
  if (brandKit.guidelines) {
    brandAssetsSection += `\nBrand Guidelines:\n${brandKit.guidelines}\n`;
  }

  return `You are a scene REVISION planner. You are NOT creating from scratch -- you are surgically editing an existing scene.

## YOUR ROLE
You receive an existing scene with its components (including the full HTML source of any custom components).
Your job is to apply the user's revision request while PRESERVING everything that isn't explicitly asked to change.

## CRITICAL RULES
1. **Preserve by default.** If the user doesn't mention something, it stays exactly as-is.
2. **Never rewrite content** (headlines, body text, CTAs) unless the user explicitly asks.
3. **Use "keep" for anything that works.** Most components in a revision should be "keep".
4. **Use "revise" for targeted CSS/HTML changes** (size, position, opacity, spacing, colors).
5. **Use "replace" only when fundamental structure needs to change** (rare).
6. **Use "remove" only when user explicitly asks to remove something.**
7. **You can add NEW components** (they won't have an original_id).

## STRATEGY DEFINITIONS

### "keep"
Pass the component through completely unchanged. No LLM call, no modification.
Use for: library components that don't need changes, custom components that are fine.

### "revise"
Send the existing custom component HTML through a SEARCH/REPLACE pipeline.
The \`revise_instructions\` field describes exactly what CSS/HTML changes to make.
**Be specific**: "Change .headline line-height from 1.4 to 1.1" not "tighten the headline".
Use for: size changes, spacing adjustments, color tweaks, opacity changes, adding/removing CSS properties.
IMPORTANT: Only works for custom components (ones with HTML source). Library components can be modified by changing their data props with strategy "keep" and updated data.

### "replace"
Generate a completely new custom component from scratch.
Provide a detailed custom_prompt.
Use for: when the component needs a fundamentally different approach.
WARNING: This loses ALL existing content. Only use when necessary.

### "remove"
Drop this component entirely.
Use for: when user explicitly asks to remove something.

## Available Library Components
${catalogStr}
${brandAssetsSection}

## Output Format (STRICT JSON)
\`\`\`json
{
  "label": "Scene label (keep existing unless changed)",
  "duration_seconds": 5,
  "revision_summary": "Brief description of what changed and why",
  "components": [
    {
      "original_id": "comp_0",
      "type": "image",
      "data": { "src": "..." },
      "z_index": 0,
      "strategy": "keep"
    },
    {
      "original_id": "comp_1",
      "type": "custom_scene_001_1",
      "strategy": "revise",
      "revise_instructions": "1. Change .logo-icon width from 32px to 48px\\n2. Change .headline line-height from 1.4 to 1.1\\n3. Add a decorative SVG circle pattern in the right 30% of the canvas at opacity 0.08"
    },
    {
      "original_id": "comp_2",
      "type": "image",
      "data": { "src": "...", "fit": "contain" },
      "position": { "x": 40, "y": 30, "width": 150, "height": 50 },
      "z_index": 30,
      "strategy": "keep"
    }
  ]
}
\`\`\`

- Every existing component MUST appear in the output with a strategy (even if "keep").
- New components omit original_id.
- For "keep" with data/position changes: include the updated data/position.
- For "revise": include revise_instructions with specific, actionable CSS/HTML changes.
- For "replace": include custom=true and custom_prompt.
- Output ONLY valid JSON. No commentary.

${SCENE_PLANNER_DESIGN_RULES}`;
}

// ── Parsing ──

function parseRevisionPlan(
  raw: string,
  existingComponents: SceneComponent[],
  defaultDuration: number,
): RevisionPlan {
  let trimmed = raw.trim();

  // Strip markdown fences
  if (trimmed.startsWith("```")) {
    const firstNewline = trimmed.indexOf("\n");
    if (firstNewline > -1) trimmed = trimmed.substring(firstNewline + 1);
    const lastFence = trimmed.lastIndexOf("```");
    if (lastFence > -1) trimmed = trimmed.substring(0, lastFence);
    trimmed = trimmed.trim();
  }

  // Try to find JSON object
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      parsed = JSON.parse(trimmed.substring(first, last + 1));
    } else {
      throw new Error(`Invalid JSON from revision planner: ${trimmed.substring(0, 300)}`);
    }
  }

  // Validate
  if (!parsed.components || !Array.isArray(parsed.components)) {
    throw new Error("Revision plan missing components array");
  }

  // Ensure all existing components are accounted for
  const existingIds = new Set(existingComponents.map(c => c.id));
  const plannedIds = new Set(
    parsed.components
      .filter((c: any) => c.original_id)
      .map((c: any) => c.original_id),
  );

  // Any existing component not in the plan gets "keep" by default
  for (const existing of existingComponents) {
    if (!plannedIds.has(existing.id)) {
      parsed.components.push({
        original_id: existing.id,
        type: existing.type,
        data: existing.data,
        position: existing.position,
        z_index: existing.z_index,
        strategy: "keep",
      });
    }
  }

  return {
    label: parsed.label || "Revised Scene",
    duration_seconds: parsed.duration_seconds || defaultDuration,
    components: parsed.components,
    revision_summary: parsed.revision_summary || "Revision applied",
  };
}
