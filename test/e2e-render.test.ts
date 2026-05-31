/**
 * End-to-end render test.
 *
 * Creates a minimal project with a title slide scene and renders it to MP4.
 * This validates the entire pipeline:
 *   component parsing -> scene assembly -> Playwright capture -> ffmpeg encode
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderProject } from "../src/core/render.js";
import type { Project } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function main() {
  console.log("=== Media Producer MCP - E2E Render Test ===\n");

  const workDir = path.join(ROOT, "test-output", "e2e");
  const outputPath = path.join(workDir, "output.mp4");
  const imagePath = path.join(workDir, "output.png");

  // Clean previous output
  await fs.rm(workDir, { recursive: true, force: true });

  const project: Project = {
    project_id: "test_001",
    tenant_id: "test",
    name: "E2E Test - Title Slide",
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
      style: {
        border_radius: "12px",
        motion: "cinematic",
      },
    },
    scenes: [
      {
        id: "scene_001",
        label: "Title",
        duration_seconds: 3,
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
            data: {
              badge: "MEDIA PRODUCER MCP",
              title: "Hello World",
              subtitle: "HTML + GSAP + Playwright + ffmpeg",
            },
            z_index: 10,
          },
          {
            id: "comp_polish",
            type: "film-polish",
            data: { vignette: 0.12, grain: 0.05 },
            z_index: 100,
          },
        ],
      },
    ],
  };

  const componentLibDir = path.join(ROOT, "src", "components");
  const gsapDir = path.join(ROOT, "vendor", "gsap");

  // ── Test 1: Video render ──
  console.log("--- Test 1: Video render (3s, 30fps = 90 frames) ---\n");

  try {
    const result = await renderProject({
      project,
      workDir: path.join(workDir, "video"),
      componentLibDir,
      gsapDir,
      outputPath,
    });

    console.log("\n✓ Video render succeeded!");
    console.log(`  Output: ${result.outputPath}`);
    console.log(`  Frames: ${result.frameCount}`);
    console.log(`  Time: ${(result.durationMs / 1000).toFixed(1)}s`);

    // Verify output file
    const stat = await fs.stat(outputPath);
    console.log(`  File size: ${(stat.size / 1024).toFixed(0)} KB`);

    if (stat.size < 1000) {
      throw new Error("Output file suspiciously small");
    }
  } catch (err) {
    console.error("\n✗ Video render failed:", err);
    process.exit(1);
  }

  // ── Test 2: Image render ──
  console.log("\n--- Test 2: Image render (single frame) ---\n");

  try {
    const imageProject: Project = {
      ...project,
      format: "image",
      name: "E2E Test - Image",
    };

    const imageResult = await renderProject({
      project: imageProject,
      workDir: path.join(workDir, "image"),
      componentLibDir,
      gsapDir,
      outputPath: imagePath,
    });

    console.log("\n✓ Image render succeeded!");
    console.log(`  Output: ${imageResult.outputPath}`);
    console.log(`  Time: ${(imageResult.durationMs / 1000).toFixed(1)}s`);

    const stat = await fs.stat(imagePath);
    console.log(`  File size: ${(stat.size / 1024).toFixed(0)} KB`);
  } catch (err) {
    console.error("\n✗ Image render failed:", err);
    process.exit(1);
  }

  console.log("\n=== All tests passed! ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
