/**
 * LLM Pipeline Unit Tests
 *
 * Tests pure functions that don't require LLM API calls:
 * - Component source extraction and validation
 * - Type name derivation
 * - Prompt expansion detection
 * - Component catalog building and formatting
 * - System prompt generation
 */

import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractComponentSource, deriveTypeName } from "../src/llm/component-gen.js";
import { buildComponentCatalog, formatCatalogForPrompt } from "../src/llm/catalog.js";
import {
  componentSystemPrompt,
  sceneStoryboardSystemPrompt,
  projectStoryboardSystemPrompt,
  critiquerSystemPrompt,
} from "../src/llm/prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT_LIB = path.resolve(__dirname, "../src/components");

// ── extractComponentSource ──

describe("extractComponentSource", () => {
  it("extracts a clean component source", () => {
    const source = `<template>
  <div class="test">{{title}}</div>
</template>

<style scoped>
  .test { color: red; }
</style>

<script>
  function createTimeline(el, data, ctx) {
    return gsap.timeline();
  }
</script>`;

    expect(extractComponentSource(source)).toBe(source);
  });

  it("strips markdown code fences", () => {
    const raw = "```html\n<template>\n  <div>hello</div>\n</template>\n\n<style scoped>\n  div { color: red; }\n</style>\n\n<script>\n  function createTimeline(el, data, ctx) {\n    return gsap.timeline();\n  }\n</script>\n```";
    const result = extractComponentSource(raw);
    expect(result).toContain("<template>");
    expect(result).not.toContain("```");
  });

  it("strips backticks without html language tag", () => {
    const raw = "```\n<template>\n  <div>hello</div>\n</template>\n\n<style scoped></style>\n\n<script>\n  function createTimeline(el, data, ctx) { return gsap.timeline(); }\n</script>\n```";
    const result = extractComponentSource(raw);
    expect(result).toContain("<template>");
    expect(result).not.toContain("```");
  });

  it("throws on missing template", () => {
    const bad = "<style scoped></style>\n<script>function createTimeline() {}</script>";
    expect(() => extractComponentSource(bad)).toThrow("missing <template>");
  });

  it("throws on missing script", () => {
    const bad = "<template><div></div></template>\n<style scoped></style>";
    expect(() => extractComponentSource(bad)).toThrow("missing <script>");
  });

  it("throws on missing createTimeline", () => {
    const bad = "<template><div></div></template>\n<style scoped></style>\n<script>function init() {}</script>";
    expect(() => extractComponentSource(bad)).toThrow("missing createTimeline");
  });
});

// ── deriveTypeName ──

describe("deriveTypeName", () => {
  it("extracts meaningful words", () => {
    expect(deriveTypeName("create a Slack message simulator")).toBe("slack-message-simulator");
  });

  it("strips filler words", () => {
    expect(deriveTypeName("make a component for the pricing page")).toBe("pricing-page");
  });

  it("limits to 3 words", () => {
    expect(deriveTypeName("animated data visualization dashboard with charts and graphs")).toBe("animated-data-visualization");
  });

  it("handles empty-ish prompts", () => {
    expect(deriveTypeName("create a component")).toBe("custom-component");
  });

  it("strips special characters", () => {
    expect(deriveTypeName("build a UI/UX mockup!")).toBe("uiux-mockup");
  });
});

// ── Component Catalog ──

describe("buildComponentCatalog", () => {
  it("reads all schemas from the component library", async () => {
    const catalog = await buildComponentCatalog(COMPONENT_LIB);
    expect(catalog.length).toBeGreaterThanOrEqual(10);

    // Check a known component
    const titleSlide = catalog.find((c) => c.type === "title-slide");
    expect(titleSlide).toBeDefined();
    expect(titleSlide!.category).toBe("titles");
    expect(titleSlide!.data.title).toBeDefined();
    expect(titleSlide!.data.title.required).toBe(true);
  });

  it("includes components from multiple categories", async () => {
    const catalog = await buildComponentCatalog(COMPONENT_LIB);
    const categories = new Set(catalog.map((c) => c.category));
    expect(categories.has("titles")).toBe(true);
    expect(categories.has("layouts")).toBe(true);
    expect(categories.has("effects")).toBe(true);
  });

  it("handles nonexistent tenant dir gracefully", async () => {
    const catalog = await buildComponentCatalog(COMPONENT_LIB, "/nonexistent/path");
    expect(catalog.length).toBeGreaterThan(0); // still has built-in
  });
});

describe("formatCatalogForPrompt", () => {
  it("formats catalog into readable prompt text", async () => {
    const catalog = await buildComponentCatalog(COMPONENT_LIB);
    const formatted = formatCatalogForPrompt(catalog);

    expect(formatted).toContain("title-slide");
    expect(formatted).toContain("Data fields:");
    expect(formatted).toContain("(required)");
    expect(formatted.length).toBeGreaterThan(500);
  });

  it("handles empty catalog", () => {
    const formatted = formatCatalogForPrompt([]);
    expect(formatted).toContain("No components available");
  });
});

// ── Prompts ──

describe("system prompts", () => {
  it("componentSystemPrompt includes key rules", () => {
    const prompt = componentSystemPrompt();
    expect(prompt).toContain("<template>");
    expect(prompt).toContain("createTimeline");
    expect(prompt).toContain("gsap.timeline()");
    expect(prompt).toContain("--mp-color-primary");
    expect(prompt).toContain("paused");
  });

  it("sceneStoryboardSystemPrompt includes catalog placeholder", () => {
    const prompt = sceneStoryboardSystemPrompt("## Components\n- title-slide\n- code-block");
    expect(prompt).toContain("title-slide");
    expect(prompt).toContain("code-block");
    expect(prompt).toContain("JSON");
  });

  it("projectStoryboardSystemPrompt includes catalog", () => {
    const prompt = projectStoryboardSystemPrompt("## Components\n- title-slide");
    expect(prompt).toContain("title-slide");
    expect(prompt).toContain("storyboard");
  });

  it("critiquerSystemPrompt mentions scoring", () => {
    const prompt = critiquerSystemPrompt();
    expect(prompt).toContain("score");
    expect(prompt).toContain("issues");
    expect(prompt).toContain("suggestions");
  });

});

