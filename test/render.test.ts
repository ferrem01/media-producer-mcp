/**
 * Render pipeline tests.
 *
 * Tests the full render flow: assemble -> capture -> encode.
 * These are slow (Playwright + ffmpeg) so they run separately.
 */

import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { renderProject } from "../src/core/render.js";
import type { Project } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT = path.resolve(__dirname, "../test-output/render");

beforeAll(async () => {
  config.componentLibDir = path.resolve(__dirname, "../src/components");
  config.gsapDir = path.resolve(__dirname, "../vendor/gsap");
  await fs.rm(TEST_OUTPUT, { recursive: true, force: true });
});

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    project_id: "proj_test",
    tenant_id: "test",
    name: "Render Test",
    format: "video",
    status: "draft",
    canvas: {
      width: 1920,
      height: 1080,
      preset: "landscape",
      fps: 30,
      background: "#0f172a",
    },
    brand_kit: {
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
    },
    scenes: [
      {
        id: "scene_001",
        label: "Title",
        duration_seconds: 2,
        components: [
          {
            id: "comp_bg",
            type: "gradient-background",
            data: { from: "#0f172a", to: "#1e293b", angle: 165 },
            z_index: 0,
          },
          {
            id: "comp_title",
            type: "title-slide",
            data: { badge: "TEST", title: "Render Test", subtitle: "Vitest" },
            z_index: 10,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("video render", () => {
  it("renders a single-scene video", async () => {
    const project = makeProject();
    const outputPath = path.join(TEST_OUTPUT, "single-scene.mp4");

    const result = await renderProject({
      project,
      workDir: path.join(TEST_OUTPUT, "work-single"),
      componentLibDir: config.componentLibDir,
      gsapDir: config.gsapDir,
      outputPath,
    });

    expect(result.outputPath).toBe(outputPath);
    expect(result.frameCount).toBe(60); // 2s * 30fps
    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(10_000);
  });

  it("renders a multi-scene video with transition", async () => {
    const project = makeProject({
      scenes: [
        {
          id: "scene_a",
          label: "Scene A",
          duration_seconds: 2,
          components: [
            { id: "c1", type: "gradient-background", data: { from: "#0f172a", to: "#1e293b" }, z_index: 0 },
            { id: "c2", type: "title-slide", data: { title: "Scene A" }, z_index: 10 },
          ],
        },
        {
          id: "scene_b",
          label: "Scene B",
          duration_seconds: 2,
          transition_in: { type: "crossfade", duration_seconds: 0.5 },
          components: [
            { id: "c3", type: "gradient-background", data: { from: "#1e293b", to: "#0f172a" }, z_index: 0 },
            { id: "c4", type: "title-slide", data: { title: "Scene B" }, z_index: 10 },
          ],
        },
      ],
    });
    const outputPath = path.join(TEST_OUTPUT, "multi-scene.mp4");

    const result = await renderProject({
      project,
      workDir: path.join(TEST_OUTPUT, "work-multi"),
      componentLibDir: config.componentLibDir,
      gsapDir: config.gsapDir,
      outputPath,
    });

    expect(result.frameCount).toBe(120); // 2 scenes * 2s * 30fps
    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(10_000);
  });
});

describe("image render", () => {
  it("renders a single frame as PNG", async () => {
    const project = makeProject({ format: "image" });
    const outputPath = path.join(TEST_OUTPUT, "image.png");

    const result = await renderProject({
      project,
      workDir: path.join(TEST_OUTPUT, "work-image"),
      componentLibDir: config.componentLibDir,
      gsapDir: config.gsapDir,
      outputPath,
    });

    expect(result.outputPath).toBe(outputPath);
    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(5_000);
  });
});
