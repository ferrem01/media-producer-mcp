/**
 * Render a range of scenes from the full showcase.
 * Usage: npx tsx test/render-part.ts <start> <end>
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config.componentLibDir = path.resolve(__dirname, "../src/components");
config.gsapDir = path.resolve(__dirname, "../vendor/gsap");

// Dynamically import to get the scenes
const { default: fullShowcase } = await import("./full-showcase-scenes.js");

const start = parseInt(process.argv[2] || "0");
const end = parseInt(process.argv[3] || "30");

console.log(`Rendering scenes ${start}-${end - 1}...`);

const { assembleScene } = await import("../src/core/scene-assembler.js");
const { captureScene } = await import("../src/core/capture.js");
const { encodeScene } = await import("../src/core/encode.js");

const OUTPUT_DIR = path.resolve(__dirname, "../test-output/full-showcase");
const scenes = fullShowcase.scenes.slice(start, end);

for (let i = 0; i < scenes.length; i++) {
  const sceneIdx = start + i;
  const scene = scenes[i];
  const sceneDir = path.join(OUTPUT_DIR, "work", `scene_${sceneIdx}`);
  const framesDir = path.join(sceneDir, "frames");
  const mp4Path = path.join(sceneDir, "scene.mp4");

  // Skip if already rendered
  try {
    await fs.access(mp4Path);
    console.log(`  Scene ${sceneIdx + 1}/30: "${scene.label}" -- already rendered, skipping`);
    continue;
  } catch { /* needs rendering */ }

  console.log(`\n  Scene ${sceneIdx + 1}/30: "${scene.label}"`);

  // Load component sources
  const types = new Set(scene.components.map((c: any) => c.type));
  const components: Array<{ type: string; source: string }> = [];
  for (const t of types) {
    const cats = await fs.readdir(config.componentLibDir, { withFileTypes: true });
    for (const cat of cats) {
      if (!cat.isDirectory()) continue;
      try {
        const src = await fs.readFile(path.join(config.componentLibDir, cat.name, `${t}.component.html`), "utf-8");
        components.push({ type: t, source: src });
        break;
      } catch { /* not here */ }
    }
  }

  const html = await assembleScene({
    scene,
    components,
    brandKit: fullShowcase.brandKit,
    canvas: fullShowcase.canvas,
    gsapDir: config.gsapDir,
  });

  await fs.mkdir(framesDir, { recursive: true });
  await fs.writeFile(path.join(sceneDir, "scene.html"), html);

  await captureScene({
    htmlPath: path.join(sceneDir, "scene.html"),
    outputDir: framesDir,
    fps: fullShowcase.canvas.fps,
    duration: scene.duration_seconds,
    width: fullShowcase.canvas.width,
    height: fullShowcase.canvas.height,
  });

  await encodeScene({ framesDir, outputPath: mp4Path, fps: fullShowcase.canvas.fps });
  await fs.rm(framesDir, { recursive: true, force: true });
}

console.log("\nDone!");
