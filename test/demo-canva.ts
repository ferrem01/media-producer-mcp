/**
 * Demo: Run "Quotient x Canva product video" through the full pipeline.
 * Shows each step: creative direction → storyboard → codegen → render
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { runGeneratePipeline } from "../src/llm/pipeline.js";
import { buildComponentCatalog, formatCatalogForPrompt } from "../src/llm/catalog.js";
import { renderProject } from "../src/core/render.js";
import { projectDir, projectOutputDir } from "../src/persistence/paths.js";
import type { LLMConfig } from "../src/llm/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config.dataDir = path.resolve(__dirname, "../test-output/demo-canva");
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
  fonts: [{ family: "Inter", source: "google" as const, weights: [400, 500, 600, 700, 800] }],
  style: { border_radius: "12px", motion: "cinematic" as const },
};

const CANVAS = {
  width: 1920, height: 1080, preset: "landscape" as const, fps: 30, background: "#0f172a",
};

async function main() {
  console.log("=== Quotient x Canva Product Video ===\n");

  await fs.rm(config.dataDir, { recursive: true, force: true });

  const PROMPT = "Quotient x Canva integration announcement video. Show how Quotient now integrates with Canva to let marketing teams create on-brand demand gen content directly from their campaign dashboard. Highlight the seamless workflow, key stats like 3x faster content creation and 340% ROI, and end with a strong CTA.";

  // Step 1: Show the component catalog
  console.log("── Step 1: Component Catalog ──");
  const catalog = await buildComponentCatalog(config.componentLibDir);
  console.log(`  ${catalog.length} components available across ${new Set(catalog.map(c => c.category)).size} categories\n`);

  // Step 2: Run the full pipeline (the Creative Director takes the raw brief).
  console.log("── Step 2: Full Pipeline (creative direction + storyboard) ──");
  const result = await runGeneratePipeline({
    prompt: PROMPT,
    target: "video",
    tenant_id: "quotient",
    llmConfig,
    brandKit: BRAND_KIT,
    canvas: CANVAS,
    sceneCount: 7,
  });

  if (result.status === "error") {
    console.error("Pipeline failed:", result.error);
    process.exit(1);
  }

  const project = result.project!;
  console.log(`\n  Project: ${project.name}`);
  console.log(`  Format: ${project.format}`);
  console.log(`  Scenes: ${project.scenes.length}`);
  console.log("");

  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    console.log(`  Scene ${i + 1}: "${scene.label}" (${scene.duration_seconds}s)`);
    console.log(`    Components: ${scene.components.map(c => c.type).join(', ')}`);
    if (scene.transition_in) {
      console.log(`    Transition: ${scene.transition_in.type} (${scene.transition_in.duration_seconds}s)`);
    }
  }

  if (result.customComponents && result.customComponents.length > 0) {
    console.log(`\n  Custom components generated: ${result.customComponents.map(c => c.type).join(', ')}`);
  }

  // Step 4: Save project.json for inspection
  const projectJsonPath = path.join(config.dataDir, "quotient", "projects", project.project_id, "project.json");
  console.log(`\n  project.json: ${projectJsonPath}`);

  // Step 5: Render
  console.log("\n── Step 4: Rendering ──");
  const outputPath = path.join(
    projectOutputDir("quotient", project.project_id),
    "output.mp4",
  );

  const renderResult = await renderProject({
    project,
    workDir: path.join(projectDir("quotient", project.project_id), "_work"),
    componentLibDir: config.componentLibDir,
    gsapDir: config.gsapDir,
    outputPath,
  });

  console.log(`\n  ✓ Render complete!`);
  console.log(`    Output: ${renderResult.outputPath}`);
  console.log(`    Frames: ${renderResult.frameCount}`);
  console.log(`    Time: ${(renderResult.durationMs / 1000).toFixed(1)}s`);

  const stat = await fs.stat(outputPath);
  console.log(`    Size: ${(stat.size / 1024).toFixed(0)} KB`);

  console.log("\n=== Done! ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
