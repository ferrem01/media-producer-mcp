/**
 * Scene Worker
 *
 * Standalone process that renders a single scene end-to-end:
 *   load project → assemble HTML → capture frames → encode MP4
 *
 * Spawned as a child process. When it exits, ALL memory is freed.
 * The parent only needs to know the output MP4 path.
 *
 * Usage: tsx scene-worker.ts <argsJsonPath>
 * Args JSON: { projectJsonPath, sceneIndex, workDir, componentLibDir, gsapDir, outputMp4Path, width, height, fps }
 */

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

var execFileAsync = promisify(execFile);

interface WorkerArgs {
  projectJsonPath: string;
  sceneIndex: number;
  workDir: string;
  componentLibDir: string;
  gsapDir: string;
  outputMp4Path: string;
  width: number;
  height: number;
  fps: number;
}

async function main() {
  var argsPath = process.argv[2];
  if (!argsPath) {
    console.error("Usage: scene-worker.ts <argsJsonPath>");
    process.exit(1);
  }

  var args: WorkerArgs = JSON.parse(await fs.readFile(argsPath, "utf-8"));

  // Load project
  var project = JSON.parse(await fs.readFile(args.projectJsonPath, "utf-8"));
  var scene = project.scenes[args.sceneIndex];

  if (!scene) {
    console.error(`Scene index ${args.sceneIndex} not found`);
    process.exit(1);
  }

  console.log(`  Scene ${args.sceneIndex + 1}/${project.scenes.length}: "${scene.label || scene.id}"`);

  // Load component sources
  var componentTypes = new Set<string>();
  for (var comp of scene.components) {
    componentTypes.add(comp.type);
  }

  var components: Array<{ type: string; source: string }> = [];
  for (var type of componentTypes) {
    var source = await findComponentSource(type, args.componentLibDir);
    if (source) {
      components.push({ type, source });
    } else {
      console.log(`  Component type "${type}" not found, skipping`);
    }
  }

  // Import assembler (dynamic to keep this file self-contained for the worker)
  var { parseComponent, bindTemplate, scopeCSS } = await import("./component-parser.js");

  // Assemble scene HTML
  var { assembleScene } = await import("./scene-assembler.js");
  var html = await assembleScene({
    scene,
    components,
    brandKit: project.brand_kit,
    canvas: project.canvas || { width: args.width, height: args.height, fps: args.fps, preset: "landscape", background: "#0f172a" },
    gsapDir: args.gsapDir,
  });

  // Write HTML
  var framesDir = path.join(args.workDir, "frames");
  var htmlPath = path.join(args.workDir, "scene.html");
  await fs.mkdir(framesDir, { recursive: true });
  await fs.writeFile(htmlPath, html);

  // Free the HTML string (can be large with GSAP inlined)
  html = "";

  // Capture frames with Playwright
  var totalFrames = Math.ceil(scene.duration_seconds * args.fps);
  var browser = await chromium.launch({
    args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    var page = await browser.newPage();
    await page.setViewportSize({ width: args.width, height: args.height });
    await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 15000 });

    for (var frame = 0; frame < totalFrames; frame++) {
      var time = frame / args.fps;
      await page.evaluate((t: number) => { (window as any).__MP_TIMELINE.time(t); }, time);
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

      var frameName = `frame-${String(frame).padStart(6, "0")}.png`;
      await page.screenshot({ path: path.join(framesDir, frameName), type: "png" });

      if (totalFrames > 20 && frame % Math.ceil(totalFrames / 10) === 0) {
        var pct = Math.round((frame / totalFrames) * 100);
        console.log(`  Capture progress: ${pct}% (frame ${frame}/${totalFrames})`);
      }
    }

    console.log(`  Captured ${totalFrames} frames`);
    await page.close();
  } finally {
    await browser.close();
  }

  // Encode to MP4
  await fs.mkdir(path.dirname(args.outputMp4Path), { recursive: true });
  await execFileAsync("ffmpeg", [
    "-y",
    "-framerate", String(args.fps),
    "-i", path.join(framesDir, "frame-%06d.png"),
    "-c:v", "libx264",
    "-profile:v", "baseline",
    "-level", "3.0",
    "-preset", "medium",
    "-crf", "23",
    "-maxrate", "2M",
    "-bufsize", "4M",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    args.outputMp4Path,
  ], { maxBuffer: 10 * 1024 * 1024 });

  var stat = await fs.stat(args.outputMp4Path);
  console.log(`  Encoded: ${args.outputMp4Path} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

  // Clean up frames
  await fs.rm(framesDir, { recursive: true, force: true });
}

async function findComponentSource(type: string, libDir: string): Promise<string | null> {
  try {
    var categories = await fs.readdir(libDir, { withFileTypes: true });
    for (var cat of categories) {
      if (!cat.isDirectory()) continue;
      var fp = path.join(libDir, cat.name, `${type}.component.html`);
      try {
        return await fs.readFile(fp, "utf-8");
      } catch { /* not here */ }
    }
  } catch { /* no lib dir */ }
  return null;
}

main().catch((err) => {
  console.error("Scene worker error:", err.message || err);
  process.exit(1);
});
