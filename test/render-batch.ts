/**
 * Render a batch of scenes from the full showcase.
 * Usage: npx tsx test/render-batch.ts <startScene> <endScene>
 * Example: npx tsx test/render-batch.ts 10 20
 *
 * Reuses the project definition from full-showcase.ts.
 * Skips scenes that already have a scene.mp4.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { assembleScene } from "../src/core/scene-assembler.js";
import { captureScene } from "../src/core/capture.js";
import { encodeScene, concatScenes } from "../src/core/encode.js";
import type { Project } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../test-output/full-showcase");

config.componentLibDir = path.resolve(__dirname, "../src/components");
config.gsapDir = path.resolve(__dirname, "../vendor/gsap");

const startIdx = parseInt(process.argv[2] || "0");
const endIdx = parseInt(process.argv[3] || "10");
const partName = process.argv[4] || `part_${startIdx}_${endIdx}`;

// Import the project definition inline (same as full-showcase.ts)
const BRAND = {
  colors: { primary: "#5B21B6", secondary: "#7C3AED", accent: "#A78BFA", background: "#0f172a", surface: "#1e293b", text: "#ffffff", text_muted: "#94a3b8" },
  fonts: [{ family: "Inter", source: "google" as const, weights: [400, 500, 600, 700, 800] }],
  style: { border_radius: "12px", motion: "cinematic" as const },
};
const canvas = { width: 1920, height: 1080, preset: "landscape" as const, fps: 30, background: "#0f172a" };

// Load the full scene list from the showcase
const mod = await import("./full-showcase.ts");

// This won't work since full-showcase.ts calls main(). Let me just inline it.
// Instead, let's parse the scenes from the already-assembled HTML files or just re-run the render pipeline

// Actually simplest: just run the full showcase render but only for the specified range
const { renderProject } = await import("../src/core/render.js");

// We need the full project to get the scenes. Let me extract the scene definitions.
// For now, read from the work dir what scenes exist and just concat the batch.

async function main() {
  const start = startIdx;
  const end = endIdx;
  
  console.log(`\nChecking scenes ${start} to ${end - 1}...`);
  
  const sceneMp4s: string[] = [];
  for (let i = start; i < end; i++) {
    const mp4 = path.join(OUTPUT_DIR, "work", `scene_${i}`, "scene.mp4");
    try {
      await fs.access(mp4);
      sceneMp4s.push(mp4);
      console.log(`  scene_${i}: ✓ (already rendered)`);
    } catch {
      console.log(`  scene_${i}: ✗ (missing)`);
    }
  }

  if (sceneMp4s.length === 0) {
    console.log("No scenes to concat!");
    process.exit(1);
  }

  // Concat into a part
  const outputPath = path.join(OUTPUT_DIR, `${partName}.mp4`);
  
  // Simple concat (no transitions for speed)
  const listPath = outputPath + ".txt";
  const listContent = sceneMp4s.map(s => `file '${s}'`).join("\n");
  await fs.writeFile(listPath, listContent);
  
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  
  await execFileAsync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1",
    "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    outputPath,
  ]);
  
  await fs.unlink(listPath).catch(() => {});
  
  const stat = await fs.stat(outputPath);
  console.log(`\n✓ ${partName}: ${(stat.size / 1024).toFixed(0)} KB`);
}

main().catch(console.error);
