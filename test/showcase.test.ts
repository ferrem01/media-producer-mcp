/**
 * Showcase render test.
 *
 * Renders a multi-scene video using different component types
 * to verify the full library works end-to-end.
 */

import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { renderProject } from "../src/core/render.js";
import type { Project } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT = path.resolve(__dirname, "../test-output/showcase");

beforeAll(async () => {
  config.componentLibDir = path.resolve(__dirname, "../src/components");
  config.gsapDir = path.resolve(__dirname, "../vendor/gsap");
  await fs.rm(TEST_OUTPUT, { recursive: true, force: true });
});

const BRAND_KIT = {
  colors: {
    primary: "#5B21B6",
    secondary: "#7C3AED",
    accent: "#A78BFA",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#ffffff",
    text_muted: "#94a3b8",
  },
  fonts: [{ family: "Inter", source: "google" as const, weights: [400, 600, 800] }],
  style: { border_radius: "12px", motion: "cinematic" as const },
};

describe("showcase video", () => {
  it("renders a 5-scene showcase using different component types", async () => {
    const project: Project = {
      project_id: "proj_showcase",
      tenant_id: "test",
      name: "Component Showcase",
      format: "video",
      status: "draft",
      canvas: { width: 1920, height: 1080, preset: "landscape", fps: 30, background: "#0f172a" },
      brand_kit: BRAND_KIT,
      scenes: [
        // Scene 1: Title with kinetic text
        {
          id: "scene_title",
          label: "Title",
          duration_seconds: 3,
          components: [
            { id: "c1", type: "gradient-background", data: { from: "#0f172a", to: "#1e293b", angle: 165 }, z_index: 0 },
            { id: "c2", type: "title-slide", data: { badge: "SHOWCASE", title: "Media Producer", subtitle: "30 Components" }, z_index: 10 },
            { id: "c3", type: "film-polish", data: { vignette: 0.12, grain: 0.04 }, z_index: 100 },
          ],
        },
        // Scene 2: Stats
        {
          id: "scene_stats",
          label: "By the Numbers",
          duration_seconds: 3,
          transition_in: { type: "crossfade", duration_seconds: 0.5 },
          components: [
            { id: "c4", type: "mesh-gradient", data: { colors: ["#1a1a2e", "#16213e", "#0f3460"] }, z_index: 0 },
            { id: "c5", type: "stat-card", data: { value: 30, suffix: "+", label: "Components", decimals: 0 }, z_index: 10 },
          ],
        },
        // Scene 3: Code block
        {
          id: "scene_code",
          label: "Code",
          duration_seconds: 4,
          transition_in: { type: "crossfade", duration_seconds: 0.5 },
          components: [
            { id: "c6", type: "gradient-background", data: { from: "#1e293b", to: "#0f172a", angle: 200 }, z_index: 0 },
            { id: "c7", type: "code-block", data: { code: "const project = await create({\n  name: \"My Video\",\n  format: \"video\"\n});\n\nawait render(project);", language: "javascript" }, z_index: 10 },
          ],
        },
        // Scene 4: Feature list
        {
          id: "scene_features",
          label: "Features",
          duration_seconds: 4,
          transition_in: { type: "crossfade", duration_seconds: 0.5 },
          components: [
            { id: "c8", type: "gradient-background", data: { from: "#0f172a", to: "#1e293b" }, z_index: 0 },
            { id: "c9", type: "text-list", data: { title: "What You Get", items: ["HTML + GSAP animation engine", "30+ built-in components", "Multi-format output", "Brand kit system", "AI-native component generation"], style: "check" }, z_index: 10 },
          ],
        },
        // Scene 5: CTA
        {
          id: "scene_cta",
          label: "CTA",
          duration_seconds: 3,
          transition_in: { type: "crossfade", duration_seconds: 0.5 },
          components: [
            { id: "c10", type: "mesh-gradient", data: { colors: ["#5B21B6", "#7C3AED", "#1e293b"] }, z_index: 0 },
            { id: "c11", type: "cta-card", data: { headline: "Start Building", description: "Create stunning videos with code", button_text: "Get Started" }, z_index: 10 },
            { id: "c12", type: "film-polish", data: { vignette: 0.15, grain: 0.03 }, z_index: 100 },
          ],
        },
      ],
    };

    const outputPath = path.join(TEST_OUTPUT, "showcase.mp4");

    const result = await renderProject({
      project,
      workDir: path.join(TEST_OUTPUT, "work"),
      componentLibDir: config.componentLibDir,
      gsapDir: config.gsapDir,
      outputPath,
    });

    expect(result.frameCount).toBeGreaterThan(400); // ~17s * 30fps minus transitions
    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(50_000);

    console.log(`Showcase rendered: ${outputPath}`);
    console.log(`  Frames: ${result.frameCount}, Size: ${(stat.size / 1024).toFixed(0)} KB, Time: ${(result.durationMs / 1000).toFixed(1)}s`);
  }, 600_000); // 10 min timeout
});
