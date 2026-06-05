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
  /** Enable critique loop */
  critique?: boolean;
  /** Max revision iterations (default 2) */
  maxRevisions?: number;
  /** Anthropic API key for critiquer */
  anthropicApiKey?: string;
  /** LLM model for critiquer */
  critiqueModel?: string;
  /** Project format for critique context */
  format?: string;
  /** Original prompt for critique context */
  originalPrompt?: string;
  /** Extra directories to search for component sources (e.g. freeform project-local) */
  extraComponentDirs?: string[];
  /**
   * When true, capture frames as PNGs with alpha transparency instead of JPEG.
   * The frames are NOT encoded to MP4; instead the frames directory is left
   * in place for the parent process to composite via compositeFullBehind.
   * Used by the full-behind speaker overlay mode.
   */
  captureAsPng?: boolean;
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
    var source = await findComponentSource(type, args.componentLibDir, args.extraComponentDirs);
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

  // ── Critique loop ──
  if (args.critique && args.anthropicApiKey) {
    var { critiqueScene } = await import("../llm/critiquer.js");
    var { captureSingleFrame } = await import("./capture.js");
    var maxRevisions = args.maxRevisions || 2;
    var previewPath = path.join(args.workDir, "preview.png");

    for (var rev = 0; rev < maxRevisions; rev++) {
      // Capture a preview frame at the midpoint
      await captureSingleFrame({
        htmlPath,
        outputPath: previewPath,
        width: args.width,
        height: args.height,
        format: "png",
        atTime: scene.duration_seconds / 2,
      });

      var previewBase64 = (await fs.readFile(previewPath)).toString("base64");

      var critiqueResult = await critiqueScene({
        sceneHtml: html,
        previewImageBase64: previewBase64,
        prompt: args.originalPrompt || scene.label || "Scene",
        llmConfig: {
          provider: "anthropic",
          apiKey: args.anthropicApiKey,
          model: args.critiqueModel || "claude-sonnet-4-20250514",
        },
        format: args.format,
      });

      console.log(`    Critique rev ${rev + 1}: score=${critiqueResult.score}/10, issues=${critiqueResult.issues.length}`);

      if (critiqueResult.score >= 7) {
        console.log(`    Score >= 7, accepted`);
        break;
      }

      if (critiqueResult.revised_html) {
        // Validate the revised HTML has the required GSAP timeline signals
        if (critiqueResult.revised_html.includes("__MP_READY") && critiqueResult.revised_html.includes("__MP_TIMELINE")) {
          console.log(`    Applying revised HTML`);
          html = critiqueResult.revised_html;
          await fs.writeFile(htmlPath, html);
        } else {
          console.log(`    Revised HTML missing GSAP timeline signals, keeping current`);
          break;
        }
      } else {
        console.log(`    No revised HTML provided, keeping current`);
        break;
      }
    }

    // Clean up preview
    await fs.unlink(previewPath).catch(() => {});
  }

  // Free the HTML string (can be large with GSAP inlined)
  html = "";

  // Capture frames with Playwright
  var totalFrames = Math.ceil(scene.duration_seconds * args.fps);
  var browser = await chromium.launch({
    args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
  });

  try {
    var page = await browser.newPage();
    await page.setViewportSize({ width: args.width, height: args.height });
    await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 15000 });

    for (var frame = 0; frame < totalFrames; frame++) {
      var time = frame / args.fps;
      await page.evaluate((t: number) => {
        (window as any).__MP_TIMELINE.time(t);

        // Also seek all video elements to the current time
        var videos = document.querySelectorAll('video');
        for (var i = 0; i < videos.length; i++) {
          var video = videos[i];
          var startAt = parseFloat(video.getAttribute('data-start-at') || '0');
          video.currentTime = Math.max(0, t - startAt);
        }
      }, time);

      // Wait for both GSAP and video frames to settle
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          // Give video elements a moment to seek
          setTimeout(resolve, 50);
        });
      }));

      if (args.captureAsPng) {
        var frameName = `frame-${String(frame).padStart(6, "0")}.png`;
        await page.screenshot({ path: path.join(framesDir, frameName), type: "png", omitBackground: true });
      } else {
        var frameName = `frame-${String(frame).padStart(6, "0")}.jpg`;
        await page.screenshot({ path: path.join(framesDir, frameName), type: "jpeg", quality: 90 });
      }

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

  if (args.captureAsPng) {
    // PNG/alpha mode: skip mp4 encoding. The frames directory is intentionally
    // left in place so that render.ts can call compositeFullBehind() on it.
    // Signal success by writing a small marker file.
    await fs.writeFile(path.join(args.workDir, ".frames-ready"), framesDir);
    console.log(`  PNG frames ready for full-behind compositing: ${framesDir}`);
  } else {
    // Encode to MP4
    await fs.mkdir(path.dirname(args.outputMp4Path), { recursive: true });
    await execFileAsync("ffmpeg", [
      "-y",
      "-framerate", String(args.fps),
      "-i", path.join(framesDir, "frame-%06d.jpg"),
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
}

async function findComponentSource(type: string, libDir: string, extraDirs?: string[]): Promise<string | null> {
  // Check extra dirs first (project-local freeform components)
  if (extraDirs) {
    for (var dir of extraDirs) {
      try {
        var fp = path.join(dir, `${type}.component.html`);
        return await fs.readFile(fp, "utf-8");
      } catch { /* not here */ }
    }
  }

  // Search library subdirectories
  try {
    var categories = await fs.readdir(libDir, { withFileTypes: true });
    for (var cat of categories) {
      if (!cat.isDirectory()) continue;
      var fp2 = path.join(libDir, cat.name, `${type}.component.html`);
      try {
        return await fs.readFile(fp2, "utf-8");
      } catch { /* not here */ }
    }
  } catch { /* no lib dir */ }
  return null;
}

main().catch((err) => {
  console.error("Scene worker error:", err.message || err);
  process.exit(1);
});
