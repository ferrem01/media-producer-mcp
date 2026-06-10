/**
 * LLM Component Generator
 *
 * Takes a natural language prompt and generates a single-file
 * .component.html using an LLM. Returns the generated source
 * and optionally a preview image.
 */

import fs from "node:fs/promises";
import { normalizeHtmlUrls } from "./normalize-urls.js";
import path from "node:path";
import { config } from "../config.js";
import { assembleScene } from "./scene-assembler.js";
import { captureSingleFrame } from "./capture.js";
import { componentSystemPrompt } from "../llm/prompts.js";
import type { BrandKit, Canvas, Scene } from "./types.js";

export interface GenerateComponentInput {
  /** Natural language description of the component */
  prompt: string;
  /** Tenant ID (for saving to tenant library) */
  tenant_id: string;
  /** Project ID (for saving to project) */
  project_id?: string;
  /** Canvas dimensions for preview */
  canvas?: Canvas;
  /** Brand kit for theming */
  brand_kit?: BrandKit;
  /** Duration for animation preview */
  duration?: number;
  /** Output format (video, image, presentation, gif) for format-specific component rules */
  format?: string;
  /** LLM provider function -- injected so we don't hardcode a provider */
  llmGenerate: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

export interface GenerateComponentResult {
  /** The generated .component.html source */
  source: string;
  /** Component type name (derived from prompt) */
  type: string;
  /** Preview image path (if generated) */
  preview_path?: string;
}

/**
 * Generate a component from a natural language prompt.
 */
export async function generateComponent(input: GenerateComponentInput): Promise<GenerateComponentResult> {
  const { prompt, tenant_id, canvas, brand_kit, duration, format, llmGenerate } = input;

  // Get format-specific system prompt (single source of truth in src/llm/prompts.ts)
  const systemPrompt = componentSystemPrompt(format);

  // Call the LLM
  const raw = await llmGenerate(systemPrompt, prompt);

  // Extract the component source (strip any markdown fences the LLM might add)
  const source = extractComponentSource(raw);

  // Derive a type name from the prompt
  const type = deriveTypeName(prompt);

  // Generate a preview
  let preview_path: string | undefined;
  try {
    preview_path = await generatePreview({
      source,
      type,
      tenant_id,
      canvas: canvas || {
        width: 1920, height: 1080, preset: "landscape", fps: 30, background: "#0f172a",
      },
      brand_kit: brand_kit || {
        colors: {
          primary: "#5B21B6", secondary: "#7C3AED", accent: "#A78BFA",
          background: "#0f172a", surface: "#1e293b", text: "#ffffff", text_muted: "#94a3b8",
        },
        fonts: [{ family: "Inter", source: "google", weights: [400, 600, 800] }],
        style: { border_radius: "12px", motion: "cinematic" },
      },
      duration: duration || 3,
    });
  } catch (err) {
    console.error("Preview generation failed:", err);
  }

  return { source, type, preview_path };
}

/**
 * Save a generated component to the tenant's component library.
 */
export async function saveGeneratedComponent(
  tenant_id: string,
  type: string,
  source: string,
  category: string = "custom",
): Promise<string> {
  const tenantCompDir = path.join(config.dataDir, tenant_id, "components", category);
  await fs.mkdir(tenantCompDir, { recursive: true });

  const filePath = path.join(tenantCompDir, `${type}.component.html`);
  await fs.writeFile(filePath, normalizeHtmlUrls(source));

  return filePath;
}

/**
 * Extract component source from LLM output.
 * Strips markdown code fences if present.
 */
function extractComponentSource(raw: string): string {
  let source = raw.trim();

  // Remove markdown fences: ```html ... ``` or ``` ... ```
  const fenceMatch = source.match(/```(?:html)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    source = fenceMatch[1].trim();
  }

  // Validate it has the required sections
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
function deriveTypeName(prompt: string): string {
  // Take first few meaningful words
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => !["a", "an", "the", "create", "make", "build", "generate", "component", "for", "with", "that", "and", "or"].includes(w))
    .slice(0, 3);

  if (words.length === 0) return "custom-component";
  return words.join("-");
}

/**
 * Generate a preview image of the component.
 */
async function generatePreview(opts: {
  source: string;
  type: string;
  tenant_id: string;
  canvas: Canvas;
  brand_kit: BrandKit;
  duration: number;
}): Promise<string> {
  const { source, type, tenant_id, canvas, brand_kit, duration } = opts;

  const scene: Scene = {
    id: "preview",
    label: "Preview",
    duration_seconds: duration,
    components: [
      {
        id: "comp_preview",
        type,
        data: {},
        z_index: 10,
      },
    ],
  };

  const html = await assembleScene({
    scene,
    components: [{ type, source }],
    brandKit: brand_kit,
    canvas,
    gsapDir: config.gsapDir,
  });

  const workDir = path.join(config.dataDir, tenant_id, "_previews");
  const htmlPath = path.join(workDir, `${type}.html`);
  const outputPath = path.join(workDir, `${type}.png`);

  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(htmlPath, html);

  await captureSingleFrame({
    htmlPath,
    outputPath,
    width: canvas.width,
    height: canvas.height,
    atTime: duration / 3,
  });

  return outputPath;
}
