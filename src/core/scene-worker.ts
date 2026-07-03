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
import { resolveVideoPath } from "./video-path.js";
import { localizeRemoteMedia } from "./remote-media.js";

// Resilience: this worker is forked with stdio:"inherit" and logs progress
// heavily. Under concurrent load the parent's pipe buffer can fill, and a write
// to stdout/stderr then throws EPIPE as an UNHANDLED 'error' event -- which would
// crash the worker mid-render and fail the whole render. A broken pipe on a LOG
// line must never kill a render: attach error handlers so failed log writes are
// silently dropped and the actual rendering work continues.
process.stdout.on("error", (err: NodeJS.ErrnoException) => { if (err && err.code === "EPIPE") return; });
process.stderr.on("error", (err: NodeJS.ErrnoException) => { if (err && err.code === "EPIPE") return; });

var execFileAsync = promisify(execFile);

interface ExtractedVideo {
  framesDir: string;
  totalFrames: number;
}

async function extractVideoFrames(videoPath: string, fps: number, width: number, height: number): Promise<ExtractedVideo> {
  // Key the cache on dimensions/fps too: extracting at a different size must not
  // reuse a previous run's frames (and a failed run's partial frames at the old
  // size won't be picked up after we change extraction params).
  const hash = crypto.createHash("md5").update(`${videoPath}|${fps}|${width}x${height}`).digest("hex").slice(0, 12);
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
  console.log(`  Extracting frames from ${path.basename(videoPath)} at ${fps}fps, max ${width}x${height}...`);
  // Downscale to the canvas size during extraction (never upscale). A source UHD
  // clip extracted at full res is slow (0.15x) and produces multi-MB PNGs that
  // blow the 120s timeout / fill /tmp; the frames are displayed at canvas size
  // anyway. -loglevel error + -nostats keep ffmpeg's progress spam out of stderr
  // so a real failure is actually visible in the captured worker error.
  await execFileAsync("ffmpeg", [
    "-loglevel", "error", "-nostats", "-y",
    "-i", videoPath,
    "-vf", `fps=${fps},scale='min(${width},iw)':-2`,
    "-start_number", "0",
    `${framesDir}/frame-%06d.png`,
  ], { timeout: 180_000, maxBuffer: 1 << 20 });
  const files = await fs.readdir(framesDir);
  const totalFrames = files.filter((f) => f.endsWith(".png")).length;
  console.log(`  Extracted ${totalFrames} frames from ${path.basename(videoPath)}`);
  return { framesDir, totalFrames };
}

/**
 * The /tmp/vframes_* dirs are a SHARED cache keyed on (videoPath, fps, size):
 * two parallel scene workers rendering scenes that use the same clip read from
 * the SAME dir. They must therefore never be deleted mid-run -- the first
 * worker to finish would yank the frames out from under a sibling still
 * reading them (observed as fs.readFile ENOENT -> worker crash). Instead of
 * per-run deletion, each worker sweeps STALE cache dirs (untouched for 24h+)
 * at startup: old dirs are never part of an active render, so this is
 * race-free, and /tmp stays bounded across many renders.
 */
async function sweepStaleVideoFrameCache(): Promise<void> {
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  try {
    const entries = await fs.readdir("/tmp");
    const now = Date.now();
    for (const name of entries) {
      if (!name.startsWith("vframes_")) continue;
      const dir = `/tmp/${name}`;
      try {
        const stat = await fs.stat(dir);
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          await fs.rm(dir, { recursive: true, force: true });
        }
      } catch { /* raced with another sweep -- fine */ }
    }
  } catch { /* /tmp unreadable -- skip */ }
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
  /** Extra directories to search for component sources (e.g. project-local scene components) */
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

  // Assemble scene HTML -- assembleSceneAuto routes codegen scenes (with
  // <component> tags) through the codegen assembler + full library load.
  var { assembleSceneAuto } = await import("./scene-assembler.js");
  var componentLibDir = args.componentLibDir || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../src/components');
  var html: string = await assembleSceneAuto({
    scene,
    components,
    brandKit: project.brand_kit,
    canvas: project.canvas || { width: args.width, height: args.height, fps: args.fps, preset: "landscape", background: "#0f172a" },
    gsapDir: args.gsapDir,
    componentLibDir,
  });

  // Download any remote media (e.g. a directly-embedded Pexels clip) to local
  // files and rewrite to file:// -- otherwise a streaming remote <video> stalls
  // networkidle and page.goto times out, failing the scene.
  var framesDir = path.join(args.workDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });
  html = await localizeRemoteMedia(html, args.workDir);

  // Write HTML
  var htmlPath = path.join(args.workDir, "scene.html");
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
    // Honor an explicit Chromium path in constrained/remote envs whose bundled
    // Playwright revision isn't downloaded (mirrors capture.ts LAUNCH_OPTS).
    ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  });

  // Sweep stale shared vframes cache dirs (see sweepStaleVideoFrameCache --
  // active dirs are never deleted; they are a cross-worker shared cache).
  await sweepStaleVideoFrameCache();

  try {
    var page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.setViewportSize({ width: args.width, height: args.height });
    // Use "load", NOT "networkidle": a full-bleed autoplay/loop <video> (b-roll)
    // keeps the network "active" so networkidle never settles -> 60s page.goto
    // timeout -> scene fails. Readiness is guaranteed deterministically below
    // (fonts.ready, the __MP_READY GSAP signal, and the explicit <img> wait), so
    // networkidle buys nothing but fragility.
    await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: "load", timeout: 60000 });
    // Ensure web fonts are loaded before capture (networkidle used to cover this).
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
    // NOTE: waitForFunction's signature is (fn, arg?, options?) -- options MUST
    // be the THIRD argument. Passing { timeout } second silently made it the
    // page-function arg and left the wait on Playwright's 30s default.
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 60000 });

    // Wait for all <img> to finish loading before capturing. External images
    // (e.g. logo.dev company logos) get their src set by JS *after* page load and
    // networkidle, so without this they render as broken images in the captured
    // frames. Capped so a slow/unreachable image can't hang the render.
    await page.evaluate(() => new Promise<void>((resolve) => {
      const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
      let pending = imgs.filter((img) => !img.complete).length;
      if (pending === 0) { resolve(); return; }
      const done = () => { if (--pending <= 0) resolve(); };
      imgs.forEach((img) => {
        if (img.complete) return;
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
      setTimeout(resolve, 10000);
    }));

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
        // Only treat real video files as videos. A <video> whose src was dropped
        // (e.g. a remote clip that failed to localize) has src="", and v.src then
        // resolves to the document URL (.../scene.html) -- without this guard that
        // gets handed to ffmpeg as a "video" and crashes the render on the HTML.
        if (!/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(src)) {
          console.warn(`  Skipping non-video <video> src: ${src.slice(0, 80)}`);
          continue;
        }
        const videoPath = resolveVideoPath(src);
        try { await fs.access(videoPath); } catch {
          console.warn(`  Warning: Video file not found: ${videoPath} (src: ${src})`);
          continue;
        }
        const extracted = await extractVideoFrames(videoPath, args.fps, args.width, args.height);
        extractionMap.set(src, extracted);
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

      // Advance GSAP timeline. Wrap in try/catch: a fragile component callback
      // (e.g. setting textContent on a null element) fires during seek and would
      // otherwise reject this evaluate and crash the entire multi-scene render.
      // Record the first error so we can warn once after the loop -- but keep
      // rendering the remaining frames/scenes.
      await page.evaluate((t: number) => {
        try {
          (window as any).__MP_TIMELINE.time(t);
        } catch (e: any) {
          if (!(window as any).__MP_SEEK_ERROR) {
            (window as any).__MP_SEEK_ERROR = String(e?.message || e);
          }
        }
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
    const seekError = await page.evaluate(() => (window as any).__MP_SEEK_ERROR || null);
    if (seekError) {
      console.warn(`  WARNING scene ${args.sceneIndex}: a component threw during timeline seek (render continued, frames may be degraded): ${seekError}`);
    }
    await page.close();
  } finally {
    await browser.close();
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
      "-profile:v", "high",
      "-level", "4.0",
      "-preset", "medium",
      "-crf", "18",
      "-maxrate", "16M",
      "-bufsize", "32M",
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
  // Check extra dirs first (project-local scene components)
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
