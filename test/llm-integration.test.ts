/**
 * LLM Pipeline Integration Tests
 *
 * These tests call the real Anthropic API. They require ANTHROPIC_API_KEY
 * in the environment. Skip with: npx vitest run --exclude '**/llm-integration*'
 *
 * Tests the full pipeline: expander → planner → component gen → save
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import type { LLMConfig } from "../src/llm/client.js";
import { generateComponentLLM, extractComponentSource } from "../src/llm/component-gen.js";
import { expandPrompt } from "../src/llm/expander.js";
import { planScene } from "../src/llm/scene-planner.js";
import { planProject } from "../src/llm/project-planner.js";
import { buildComponentCatalog, type ComponentCatalogEntry } from "../src/llm/catalog.js";
import { runGeneratePipeline } from "../src/llm/pipeline.js";
import type { BrandKit, Canvas } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.resolve(__dirname, "../test-output/llm-integration");

// Skip all tests if no API key
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const SKIP = !API_KEY;

const llmConfig: LLMConfig = {
  provider: "anthropic",
  apiKey: API_KEY,
  model: "claude-sonnet-4-20250514",
};

const BRAND_KIT: BrandKit = {
  colors: {
    primary: "#5B21B6",
    secondary: "#7C3AED",
    accent: "#A78BFA",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#ffffff",
    text_muted: "#94a3b8",
  },
  fonts: [{ family: "Inter", source: "google", weights: [400, 600, 800] }],
  style: { border_radius: "12px", motion: "cinematic" },
};

const CANVAS: Canvas = {
  width: 1920, height: 1080, preset: "landscape", fps: 30, background: "#0f172a",
};

let catalog: ComponentCatalogEntry[] = [];

beforeAll(async () => {
  if (SKIP) return;
  config.dataDir = TEST_DATA_DIR;
  config.componentLibDir = path.resolve(__dirname, "../src/components");
  config.gsapDir = path.resolve(__dirname, "../vendor/gsap");
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  catalog = await buildComponentCatalog(config.componentLibDir);
});

// ── Component Generation ──

describe.skipIf(SKIP)("component generation", () => {
  it("generates a valid .component.html from a prompt", async () => {
    const result = await generateComponentLLM({
      prompt: "A countdown timer that counts down from a given number to zero with large centered numbers",
      llmConfig,
      brandKit: BRAND_KIT,
      duration: 5,
    });

    expect(result.source).toContain("<template>");
    expect(result.source).toContain("<style");
    expect(result.source).toContain("createTimeline");
    expect(result.source).toContain("gsap");
    expect(result.type).toBeTruthy();

    // Verify it passes validation
    const validated = extractComponentSource(result.source);
    expect(validated).toContain("<template>");
  }, 30_000);

  it("generates a component with dynamic DOM construction", async () => {
    const result = await generateComponentLLM({
      prompt: "A horizontal scrolling ticker/marquee showing company names: Apple, Google, Microsoft, Amazon, Meta",
      llmConfig,
      brandKit: BRAND_KIT,
    });

    expect(result.source).toContain("<template>");
    expect(result.source).toContain("createTimeline");
  }, 30_000);
});

// ── Prompt Expander ──

describe.skipIf(SKIP)("prompt expander", () => {
  it("expands a thin prompt into a rich creative brief", async () => {
    const result = await expandPrompt({
      prompt: "product demo for Quotient",
      format: "video",
      llmConfig,
      brandKit: BRAND_KIT,
    });

    expect(result.expanded).toBe(true);
    expect(result.prompt.length).toBeGreaterThan(200);
    // Should mention specific components or visual direction
    expect(result.prompt.toLowerCase()).toMatch(/scene|slide|intro|title|feature/);
  }, 30_000);

  it("passes through a rich prompt unchanged", async () => {
    const richPrompt = "Create a product launch video for Quotient with a dark gradient background. Start with a logo intro showing the Quotient brand. Scene 2 should be a browser frame mockup of the dashboard with animated stat cards showing 2400 active users, 98% uptime, and 150 daily renders. Scene 3 shows a code block with the MCP API integration. End with a CTA card saying Get Started and a logo outro.";
    const result = await expandPrompt({
      prompt: richPrompt,
      format: "video",
      llmConfig,
      brandKit: BRAND_KIT,
    });

    expect(result.expanded).toBe(false);
    expect(result.prompt).toBe(richPrompt);
  }, 5_000);

  it("skips expansion for component target", async () => {
    const result = await expandPrompt({
      prompt: "pricing table",
      format: "component",
      llmConfig,
    });

    expect(result.expanded).toBe(false);
  }, 5_000);
});

// ── Scene Planner ──

describe.skipIf(SKIP)("scene planner", () => {
  it("plans a scene using library components", async () => {
    const result = await planScene({
      prompt: "A title scene introducing Quotient with a purple gradient background, the company name in large text, and the tagline 'AI-Powered Demand Marketing' below it",
      llmConfig,
      componentCatalog: catalog,
      brandKit: BRAND_KIT,
      canvas: CANVAS,
    });

    expect(result.scene).toBeDefined();
    expect(result.scene.id).toBeTruthy();
    expect(result.scene.components.length).toBeGreaterThanOrEqual(1);
    expect(result.scene.duration_seconds).toBeGreaterThan(0);

    // Should use library components (title-slide, gradient-background, etc.)
    const types = result.scene.components.map((c) => c.type);
    const usesLibrary = types.some((t) =>
      ["title-slide", "gradient-background", "mesh-gradient", "section-header", "kinetic-text"].includes(t)
    );
    expect(usesLibrary).toBe(true);
  }, 60_000);

  it("returns custom components when library doesn't fit", async () => {
    const result = await planScene({
      prompt: "A realistic Slack channel view showing messages from team members discussing a product launch, with typing indicators and emoji reactions",
      llmConfig,
      componentCatalog: catalog,
      brandKit: BRAND_KIT,
      canvas: CANVAS,
    });

    expect(result.scene).toBeDefined();
    expect(result.scene.components.length).toBeGreaterThanOrEqual(1);
    // This prompt is specific enough that it might generate a custom component
    // OR use a creative combination of existing ones. Both are valid.
  }, 90_000);
});

// ── Project Planner ──

describe.skipIf(SKIP)("project planner", () => {
  it("plans a multi-scene video project", async () => {
    const result = await planProject({
      prompt: "Create a 30-second product overview video for Quotient, an AI-powered demand marketing platform. Show the dashboard, key metrics, and end with a call to action.",
      format: "video",
      llmConfig,
      componentCatalog: catalog,
      brandKit: BRAND_KIT,
      canvas: CANVAS,
      sceneCount: 5,
    });

    expect(result.project).toBeDefined();
    expect(result.project.format).toBe("video");
    expect(result.project.scenes.length).toBeGreaterThanOrEqual(3);
    expect(result.project.scenes.length).toBeLessThanOrEqual(8);

    // Each scene should have components
    for (const scene of result.project.scenes) {
      expect(scene.components.length).toBeGreaterThanOrEqual(1);
      expect(scene.duration_seconds).toBeGreaterThan(0);
    }
  }, 120_000);

  it("plans a presentation/deck project", async () => {
    const result = await planProject({
      prompt: "Investor pitch deck for Quotient covering problem, solution, market size, traction, and team",
      format: "deck",
      llmConfig,
      componentCatalog: catalog,
      brandKit: BRAND_KIT,
      canvas: CANVAS,
      sceneCount: 6,
    });

    expect(result.project).toBeDefined();
    expect(result.project.format).toBe("deck");
    expect(result.project.scenes.length).toBeGreaterThanOrEqual(4);
  }, 120_000);
});

// ── Full Pipeline ──

describe.skipIf(SKIP)("full pipeline", () => {
  it("generates a component through the pipeline", async () => {
    const result = await runGeneratePipeline({
      prompt: "animated progress ring that fills up to a percentage",
      target: "component",
      tenant_id: "test-tenant",
      llmConfig,
      brandKit: BRAND_KIT,
      canvas: CANVAS,
    });

    expect(result.status).toBe("completed");
    expect(result.component).toBeDefined();
    expect(result.component!.source).toContain("<template>");
    expect(result.component!.source).toContain("createTimeline");
  }, 30_000);

  it("generates an image through the pipeline", async () => {
    const result = await runGeneratePipeline({
      prompt: "Hero image for Quotient showing the tagline 'AI-Powered Demand Marketing' with a stat card showing 340% ROI",
      target: "image",
      tenant_id: "test-tenant",
      llmConfig,
      brandKit: BRAND_KIT,
      canvas: CANVAS,
    });

    expect(result.status).toBe("completed");
    expect(result.project).toBeDefined();
    expect(result.project!.format).toBe("image");
    expect(result.project!.scenes.length).toBe(1);
  }, 60_000);

  it("generates a video through the pipeline (with expander)", async () => {
    const result = await runGeneratePipeline({
      prompt: "Quotient product demo",
      target: "video",
      tenant_id: "test-tenant",
      llmConfig,
      brandKit: BRAND_KIT,
      canvas: CANVAS,
      sceneCount: 4,
    });

    expect(result.status).toBe("completed");
    expect(result.project).toBeDefined();
    expect(result.project!.format).toBe("video");
    expect(result.project!.scenes.length).toBeGreaterThanOrEqual(3);
  }, 180_000);

  it("generates a deck through the pipeline", async () => {
    const result = await runGeneratePipeline({
      prompt: "Quotient investor pitch",
      target: "deck",
      tenant_id: "test-tenant",
      llmConfig,
      brandKit: BRAND_KIT,
      canvas: CANVAS,
      sceneCount: 5,
    });

    expect(result.status).toBe("completed");
    expect(result.project).toBeDefined();
    expect(result.project!.format).toBe("deck");
    expect(result.project!.scenes.length).toBeGreaterThanOrEqual(3);
  }, 180_000);
});
