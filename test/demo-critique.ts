/**
 * Demo: Test the critiquer loop end-to-end.
 *
 * Renders a simple 3-scene video with critique enabled.
 * Each scene gets a preview capture, LLM critique, and optional revision.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { renderProject } from "../src/core/render.js";
import type { LLMConfig } from "../src/llm/client.js";
import type { Project } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config.dataDir = path.resolve(__dirname, "../test-output/demo-critique");
config.componentLibDir = path.resolve(__dirname, "../src/components");
config.gsapDir = path.resolve(__dirname, "../vendor/gsap");

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const llmConfig: LLMConfig = {
  provider: "anthropic",
  apiKey: API_KEY,
  model: "claude-sonnet-4-20250514",
};

// Build a simple 3-scene project by hand (no LLM generation, keeps it fast)
const project: Project = {
  project_id: "critique-test",
  tenant_id: "test",
  name: "Critique Loop Test",
  format: "video",
  canvas: {
    width: 1280,
    height: 720,
    fps: 24,
    preset: "landscape",
    background: "#0f172a",
  },
  brand_kit: {
    colors: {
      primary: "#3B82F6",
      secondary: "#8B5CF6",
      accent: "#F59E0B",
      background: "#0f172a",
      surface: "#1e293b",
      text: "#ffffff",
      text_muted: "#94a3b8",
    },
    fonts: [{ family: "Inter", source: "google" as const, weights: [400, 600, 700] }],
    style: { border_radius: "12px", motion: "smooth" as const },
  },
  scenes: [
    {
      id: "scene-1",
      label: "Welcome",
      duration_seconds: 3,
      components: [
        {
          id: "hero-1",
          type: "hero-headline",
          props: {
            headline: "Welcome to the Future",
            subheadline: "AI-powered content creation",
          },
          position: { x: 0, y: 0, width: 100, height: 100 },
          animations: {
            enter: { type: "fade-in", duration: 0.5 },
          },
        },
      ],
    },
    {
      id: "scene-2",
      label: "Stats",
      duration_seconds: 3,
      components: [
        {
          id: "stat-1",
          type: "stat-counter",
          props: {
            value: "340%",
            label: "ROI Increase",
            description: "Average across all customers",
          },
          position: { x: 10, y: 20, width: 80, height: 60 },
          animations: {
            enter: { type: "slide-up", duration: 0.5 },
          },
        },
      ],
      transition_in: { type: "crossfade", duration_seconds: 0.5 },
    },
    {
      id: "scene-3",
      label: "CTA",
      duration_seconds: 3,
      components: [
        {
          id: "cta-1",
          type: "cta-block",
          props: {
            headline: "Get Started Today",
            button_text: "Try Free",
            button_url: "https://example.com",
          },
          position: { x: 0, y: 0, width: 100, height: 100 },
          animations: {
            enter: { type: "fade-in", duration: 0.5 },
          },
        },
      ],
      transition_in: { type: "blur-crossfade", duration_seconds: 0.5 },
    },
  ],
  audio: { tracks: [] },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

async function main() {
  console.log("=== Critique Loop Test ===\n");

  // Clean output
  await fs.rm(config.dataDir, { recursive: true, force: true });

  const workDir = path.join(config.dataDir, "test", "projects", "critique-test", "_work");
  const outputPath = path.join(config.dataDir, "test", "projects", "critique-test", "output.mp4");

  console.log("Rendering with critique enabled (maxRevisions=2)...\n");

  const startTime = Date.now();
  const result = await renderProject({
    project,
    workDir,
    componentLibDir: config.componentLibDir,
    gsapDir: config.gsapDir,
    outputPath,
    critique: true,
    maxRevisions: 2,
    llmConfig,
    originalPrompt: "A short product demo video showing stats and a CTA",
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=== Results ===`);
  console.log(`  Output: ${result.outputPath}`);
  console.log(`  Format: ${result.format}`);
  console.log(`  Frames: ${result.frameCount}`);
  console.log(`  Time: ${elapsed}s`);

  const stat = await fs.stat(outputPath);
  console.log(`  Size: ${(stat.size / 1024).toFixed(0)} KB`);

  console.log("\n=== Critique Loop Test Complete ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
