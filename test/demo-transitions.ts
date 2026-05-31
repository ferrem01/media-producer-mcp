/**
 * Demo: Test GSAP-powered transitions between scenes.
 *
 * Renders a 3-scene video with different transition types:
 *   Scene 1 -> blur-crossfade -> Scene 2 -> morph-wipe -> Scene 3
 *
 * Verifies transition segments are rendered and concatenated into the final video.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { renderProject } from "../src/core/render.js";
import type { Project } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config.dataDir = path.resolve(__dirname, "../test-output/demo-transitions");
config.componentLibDir = path.resolve(__dirname, "../src/components");
config.gsapDir = path.resolve(__dirname, "../vendor/gsap");

// Simple 3-scene project with transitions
const project: Project = {
  project_id: "transition-test",
  tenant_id: "test",
  name: "GSAP Transition Test",
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
      primary: "#EF4444",
      secondary: "#F97316",
      accent: "#FBBF24",
      background: "#0f172a",
      surface: "#1e293b",
      text: "#ffffff",
      text_muted: "#94a3b8",
    },
    fonts: [{ family: "Inter", source: "google" as const, weights: [400, 600, 700] }],
    style: { border_radius: "12px", motion: "cinematic" as const },
  },
  scenes: [
    {
      id: "scene-1",
      label: "Opening",
      duration_seconds: 2,
      components: [
        {
          id: "hero-1",
          type: "hero-headline",
          props: {
            headline: "Scene One",
            subheadline: "The opening scene with a warm red palette",
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
      label: "Middle",
      duration_seconds: 2,
      components: [
        {
          id: "stat-1",
          type: "stat-counter",
          props: {
            value: "42%",
            label: "Growth Rate",
            description: "Year over year",
          },
          position: { x: 10, y: 20, width: 80, height: 60 },
          animations: {
            enter: { type: "slide-up", duration: 0.5 },
          },
        },
      ],
      transition_in: {
        type: "blur-crossfade",
        duration_seconds: 0.5,
      },
    },
    {
      id: "scene-3",
      label: "Closing",
      duration_seconds: 2,
      components: [
        {
          id: "cta-1",
          type: "cta-block",
          props: {
            headline: "Scene Three",
            button_text: "Let's Go",
            button_url: "https://example.com",
          },
          position: { x: 0, y: 0, width: 100, height: 100 },
          animations: {
            enter: { type: "fade-in", duration: 0.5 },
          },
        },
      ],
      transition_in: {
        type: "morph-wipe",
        duration_seconds: 0.5,
      },
    },
  ],
  audio: { tracks: [] },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

async function main() {
  console.log("=== GSAP Transition Test ===\n");

  // Clean output
  await fs.rm(config.dataDir, { recursive: true, force: true });

  const workDir = path.join(config.dataDir, "test", "projects", "transition-test", "_work");
  const outputPath = path.join(config.dataDir, "test", "projects", "transition-test", "output.mp4");

  console.log("Transitions to test:");
  console.log("  Scene 1 -> blur-crossfade -> Scene 2");
  console.log("  Scene 2 -> morph-wipe -> Scene 3\n");

  const startTime = Date.now();
  const result = await renderProject({
    project,
    workDir,
    componentLibDir: config.componentLibDir,
    gsapDir: config.gsapDir,
    outputPath,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=== Results ===`);
  console.log(`  Output: ${result.outputPath}`);
  console.log(`  Format: ${result.format}`);
  console.log(`  Frames: ${result.frameCount}`);
  console.log(`  Time: ${elapsed}s`);

  const stat = await fs.stat(outputPath);
  console.log(`  Size: ${(stat.size / 1024).toFixed(0)} KB`);

  // Verify the transition work dirs were created
  const transDir1 = path.join(workDir, "transition_0_1");
  const transDir2 = path.join(workDir, "transition_1_2");

  const t1Exists = await fs.stat(transDir1).then(() => true).catch(() => false);
  const t2Exists = await fs.stat(transDir2).then(() => true).catch(() => false);

  console.log(`\n  Transition 0->1 dir created: ${t1Exists}`);
  console.log(`  Transition 1->2 dir created: ${t2Exists}`);

  // Check that transition MP4s were created
  const t1Mp4 = path.join(transDir1, "transition.mp4");
  const t2Mp4 = path.join(transDir2, "transition.mp4");

  const t1Mp4Exists = await fs.stat(t1Mp4).then((s) => `${(s.size / 1024).toFixed(0)} KB`).catch(() => "missing");
  const t2Mp4Exists = await fs.stat(t2Mp4).then((s) => `${(s.size / 1024).toFixed(0)} KB`).catch(() => "missing");

  console.log(`  Transition 0->1 MP4: ${t1Mp4Exists}`);
  console.log(`  Transition 1->2 MP4: ${t2Mp4Exists}`);

  console.log("\n=== GSAP Transition Test Complete ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
