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
import crypto from "node:crypto";

var execFileAsync = promisify(execFile);

const DATA_DIR = "/data/media-producer";

interface ExtractedVideo {
  framesDir: string;
  totalFrames: number;
}

function resolveVideoPath(src: string): string {
  if (src.startsWith("file://")) return src.slice(7);
  const projMatch = src.match(/^https?:\/\/localhost:\d+\/assets\/([^/]+)\/projects\/([^/]+)\/assets\/(.+)$/);
  if (projMatch) return path.join(DATA_DIR, projMatch[1], "projects", projMatch[2], "assets", projMatch[3]);
  const brandMatch = src.match(/^https?:\/\/localhost:\d+\/assets\/([^/]+)\/brand-kit\/(.+)$/);
  if (brandMatch) return path.join(DATA_DIR, brandMatch[1], "brand-kit", "assets", brandMatch[2]);
  return src;
}

async function extractVideoFrames(videoPath: string, fps: number): Promise<ExtractedVideo> {
  const hash = crypto.createHash("md5").update(videoPath).digest("hex").slice(0, 12);
  const framesDir = `/tmp/vframes_${hash}`;
  try {
    const existing = await fs.readdir(framesDir);
    const pngFiles = existing.filter((f) => f.endsWith(".png"));
    if (pngFiles.length > 0) {
      console.log(`  Reusing ${pngFiles.length} pre-extracted frames for ${path.basename(videoPath)}`);
      return { framesDir, totalFrames: pngFiles.length };
    }
  } catch { /* will create */ }
  await fs.mkdir(framesDir, { recursive: true });
  console.log(`  Extracting frames from ${path.basename(videoPath)} at ${fps}fps...`);
  await execFileAsync("ffmpeg", ["-i", videoPath, "-vf", `fps=${fps}`, "-start_number", "0", `${framesDir}/frame-%06d.png`], { timeout: 120_000 });
  const files = await fs.readdir(framesDir);
  const totalFrames = files.filter((f) => f.endsWith(".png")).length;
  console.log(`  Extracted ${totalFrames} frames from ${path.basename(videoPath)}`);
  return { framesDir, totalFrames };
}

async function cleanupFrameDirs(dirs: Set<string>): Promise<void> {
  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

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
   * in place for the parent process (renderSceneTransparentFrames / speaker track pipeline).
   * Used by the speaker track pipeline (renderVideoWithSpeakerTrack).
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
      console.log(`  Loaded component "${type}" (${source.length} chars, has <script>: ${source.includes('<script>')})`);
    } else {
      console.log(`  Component type "${type}" not found, skipping`);
    }
  }

  // Import assembler (dynamic to keep this file self-contained for the worker)
  var { parseComponent, bindTemplate, scopeCSS } = await import("./component-parser.js");

  // Assemble scene HTML (use sequence assembler for component-based sequences)
  var html: string;
  var hasBeatComponents = scene.beats?.length > 0 &&
    scene.components.length > 0 &&
    !scene.components[0].type.startsWith("freeform_");

  if (hasBeatComponents) {
    console.log(`  [scene-worker] Using sequence assembler (${scene.beats.length} beats, ${scene.components.length} components)`);
    var { assembleSequence } = await import("./sequence-assembler.js");
    html = await assembleSequence({
      scene,
      components,
      brandKit: project.brand_kit,
      canvas: project.canvas || { width: args.width, height: args.height, fps: args.fps, preset: "landscape", background: "#0f172a" },
      gsapDir: args.gsapDir,
      choreography: scene.choreography,
    });
  } else {
    var { assembleScene } = await import("./scene-assembler.js");
    html = await assembleScene({
      scene,
      components,
      brandKit: project.brand_kit,
      canvas: project.canvas || { width: args.width, height: args.height, fps: args.fps, preset: "landscape", background: "#0f172a" },
      gsapDir: args.gsapDir,
    });
  }

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

  // Capture frames with Playwright + ffmpeg video frame extraction
  var totalFrames = Math.ceil(scene.duration_seconds * args.fps);
  var browser = await chromium.launch({
    args: [
      "--enable-gpu",
      "--use-gl=swiftshader",
      "--enable-webgl",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--allow-file-access-from-files",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--mute-audio",
      "--no-first-run",
    ],
  });

  const frameDirsToCleanup = new Set<string>();

  try {
    var page = await browser.newPage();
    await page.setViewportSize({ width: args.width, height: args.height });
    await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 60000 });

    // ── Video frame extraction: discover, extract, inject ──
    const videoInfos: { src: string; startAt: number; index: number }[] = await page.evaluate(() => {
      const videos = document.querySelectorAll("video");
      return Array.from(videos).map((v, i) => ({
        src: v.src || v.getAttribute("src") || "",
        startAt: parseFloat(v.getAttribute("data-start-at") || "0"),
        index: i,
      }));
    });

    const extractionMap = new Map<string, ExtractedVideo>();

    if (videoInfos.length > 0) {
      const uniqueSrcs = [...new Set(videoInfos.map((v) => v.src).filter(Boolean))];
      console.log(`  Found ${videoInfos.length} video element(s), ${uniqueSrcs.length} unique source(s)`);

      for (const src of uniqueSrcs) {
        const videoPath = resolveVideoPath(src);
        try { await fs.access(videoPath); } catch {
          console.warn(`  Warning: Video file not found: ${videoPath} (src: ${src})`);
          continue;
        }
        const extracted = await extractVideoFrames(videoPath, args.fps);
        extractionMap.set(src, extracted);
        frameDirsToCleanup.add(extracted.framesDir);
      }

      // Hide <video> elements and insert sibling <img> overlays
      // (HyperFrames approach: don't replace, keep GSAP targets intact)
      await page.evaluate(() => {
        const videos = document.querySelectorAll("video");
        videos.forEach((video, idx) => {
          // Hide the video but keep it in the DOM for GSAP
          video.style.setProperty("visibility", "hidden", "important");
          video.style.setProperty("pointer-events", "none", "important");

          // Create a sibling <img> that overlays the video's position
          const img = document.createElement("img");
          img.id = `__render_frame_${idx}__`;
          img.className = "__render_frame__";
          img.style.cssText = video.style.cssText;
          img.style.position = "absolute";
          img.style.top = "0";
          img.style.left = "0";
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "cover";
          img.style.visibility = "visible";
          img.style.pointerEvents = "none";
          const startAt = video.getAttribute("data-start-at");
          if (startAt) img.setAttribute("data-start-at", startAt);
          img.setAttribute("data-video-id", `vimg-${idx}`);

          // Insert after the video in the same parent container
          video.parentElement?.appendChild(img);
        });
      });
    }

    const hasVideos = extractionMap.size > 0;

    for (var frame = 0; frame < totalFrames; frame++) {
      var time = frame / args.fps;

      // Advance GSAP timeline
      await page.evaluate((t: number) => {
        (window as any).__MP_TIMELINE.time(t);
      }, time);

      // Update video frame images via data URIs (read from disk on Node side)
      if (hasVideos) {
        // Compute which frame each video element needs
        const frameUpdates: Array<{ imgId: string; dataUri: string }> = [];
        for (const vInfo of videoInfos) {
          const extracted = extractionMap.get(vInfo.src);
          if (!extracted) continue;
          const targetTime = Math.max(0, time - vInfo.startAt);
          const frameIndex = Math.min(Math.round(targetTime * args.fps), extracted.totalFrames - 1);
          const framePath = path.join(extracted.framesDir, `frame-${String(frameIndex).padStart(6, "0")}.png`);
          const frameData = await fs.readFile(framePath);
          const dataUri = `data:image/png;base64,${frameData.toString("base64")}`;
          frameUpdates.push({ imgId: `__render_frame_${vInfo.index}__`, dataUri });
        }

        // Inject all frames into the browser in one evaluate call
        await page.evaluate((updates: Array<{ imgId: string; dataUri: string }>) =>
          new Promise<void>((resolve) => {
            let pending = updates.length;
            if (pending === 0) { requestAnimationFrame(() => resolve()); return; }
            const done = () => { if (--pending <= 0) requestAnimationFrame(() => resolve()); };
            for (const { imgId, dataUri } of updates) {
              const img = document.getElementById(imgId) as HTMLImageElement | null;
              if (!img) { done(); continue; }
              if (img.src === dataUri) { done(); continue; }
              img.addEventListener("load", () => done(), { once: true });
              img.addEventListener("error", () => done(), { once: true });
              setTimeout(() => done(), 3000);
              img.src = dataUri;
            }
          }),
          frameUpdates
        );
      } else {
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      }

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
    await cleanupFrameDirs(frameDirsToCleanup);
  }

  if (args.captureAsPng) {
    // PNG/alpha mode: skip mp4 encoding. The frames directory is intentionally
    // left in place so the speaker track pipeline can stitch frames into a continuous sequence.
    // Signal success by writing a small marker file.
    await fs.writeFile(path.join(args.workDir, ".frames-ready"), framesDir);
    console.log(`  PNG frames ready for speaker track compositing: ${framesDir}`);
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
