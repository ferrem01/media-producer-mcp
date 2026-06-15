/**
 * Frame Capture Pipeline
 *
 * Uses Playwright to load assembled scene HTML,
 * step through the GSAP timeline frame-by-frame,
 * and screenshot each frame.
 *
 * Video handling delegated to capture-worker.ts which uses ffmpeg
 * frame pre-extraction instead of Chrome video seeking.
 */

import { chromium, type Browser, type Page } from "playwright";
import { fork, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveVideoPath } from "./video-path.js";

const execFileAsync = promisify(execFile);

export interface CaptureOptions {
  /** Path to the assembled scene HTML file */
  htmlPath: string;
  /** Output directory for frame PNGs */
  outputDir: string;
  /** Frames per second */
  fps: number;
  /** Scene duration in seconds */
  duration: number;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Image format */
  format?: "png" | "jpeg";
  /** JPEG quality (0-100) */
  quality?: number;
  /** Omit page background for transparent capture */
  omitBackground?: boolean;
}

export interface CaptureResult {
  frameCount: number;
  outputDir: string;
  format: string;
  durationMs: number;
}

/** Info about a video source whose frames have been extracted */
interface ExtractedVideo {
  framesDir: string;
  totalFrames: number;
}

/**
 * Extract a single frame from a video at a specific time using ffmpeg.
 * Used by captureSingleFrame for efficiency (no need to extract ALL frames).
 */
async function extractSingleVideoFrame(
  videoPath: string,
  time: number,
  outputPath: string
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-ss", String(time),
    "-i", videoPath,
    "-frames:v", "1",
    "-y",
    outputPath,
  ], { timeout: 30_000 });
}

/**
 * Capture a scene by spawning a child process.
 * The child process launches Playwright, captures all frames,
 * then exits -- guaranteeing full memory cleanup between scenes.
 */
export async function captureScene(options: CaptureOptions): Promise<CaptureResult> {
  const {
    htmlPath,
    outputDir,
    fps,
    duration,
    width,
    height,
    format = "png",
    omitBackground = false,
  } = options;

  const totalFrames = Math.ceil(duration * fps);
  const startTime = Date.now();

  await fs.mkdir(outputDir, { recursive: true });

  // Write args to a temp file for the worker
  const argsPath = path.join(outputDir, ".capture-args.json");
  await fs.writeFile(argsPath, JSON.stringify({
    htmlPath: path.resolve(htmlPath),
    outputDir: path.resolve(outputDir),
    fps,
    duration,
    width,
    height,
    format,
    omitBackground,
  }));

  // Spawn worker as child process
  const workerPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "capture-worker.js"
  );

  // Use tsx to run the TypeScript worker
  await new Promise<void>((resolve, reject) => {
    const child = fork(workerPath, [argsPath], {
      execArgv: [],
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Capture worker exited with code ${code}`));
    });
    child.on("error", reject);
  });

  // Clean up args file
  await fs.unlink(argsPath).catch(() => {});

  const durationMs = Date.now() - startTime;
  console.log(
    `  Captured ${totalFrames} frames in ${(durationMs / 1000).toFixed(1)}s ` +
    `(${(totalFrames / (durationMs / 1000)).toFixed(1)} fps)`
  );

  return {
    frameCount: totalFrames,
    outputDir,
    format,
    durationMs,
  };
}

/**
 * Capture a single frame (for image output or critique screenshots).
 * Uses ffmpeg to extract video frames instead of Chrome seeking.
 */
export async function captureSingleFrame(options: {
  htmlPath: string;
  outputPath: string;
  width: number;
  height: number;
  format?: "png" | "jpeg";
  quality?: number;
  /** Omit page background for transparent capture */
  omitBackground?: boolean;
  /** Time in seconds to capture at (default: 0 for static, or midpoint) */
  atTime?: number;
}): Promise<void> {
  const {
    htmlPath,
    outputPath,
    width,
    height,
    format = "png",
    omitBackground = false,
    quality,
    atTime,
  } = options;

  let browser: Browser | undefined;
  let page: Page | undefined;
  const tempDirs = new Set<string>();

  try {
    browser = await chromium.launch({
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
        "--mute-audio",
        "--no-first-run",
      ],
    });
    page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.setViewportSize({ width, height });

    const fileUrl = `file://${path.resolve(htmlPath)}`;
    await page.goto(fileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.waitForFunction(
      () => (window as any).__MP_READY === true,
      { timeout: 60000 }
    );

    // If a specific time is requested, advance the timeline. Swallow a throwing
    // component callback so one fragile scene doesn't abort the capture.
    if (atTime !== undefined && atTime > 0) {
      await page.evaluate((t: number) => {
        try { (window as any).__MP_TIMELINE.time(t); } catch { /* component callback threw; capture current state */ }
      }, atTime);
    }

    // Handle video elements: extract single frames with ffmpeg, replace with <img>
    const videoInfos: { src: string; startAt: number; index: number }[] = await page.evaluate(() => {
      const videos = document.querySelectorAll("video");
      return Array.from(videos).map((v, i) => ({
        src: v.src || v.getAttribute("src") || "",
        startAt: parseFloat(v.getAttribute("data-start-at") || "0"),
        index: i,
      }));
    });

    if (videoInfos.length > 0) {
      const captureTime = atTime || 0;
      // For each video, extract the single frame we need
      const framePathMap: Record<string, string> = {}; // videoSrc+startAt -> framePath
      const tempDir = `/tmp/vframes_single_${crypto.randomBytes(6).toString("hex")}`;
      await fs.mkdir(tempDir, { recursive: true });
      tempDirs.add(tempDir);

      for (const vInfo of videoInfos) {
        if (!vInfo.src) continue;
        const videoPath = resolveVideoPath(vInfo.src);

        try {
          await fs.access(videoPath);
        } catch {
          console.warn(`  Warning: Video file not found: ${videoPath}`);
          continue;
        }

        const targetTime = Math.max(0, captureTime - vInfo.startAt);
        const key = `${vInfo.src}__${vInfo.startAt}`;

        // Skip if we already extracted this exact frame
        if (framePathMap[key]) continue;

        const framePath = path.join(tempDir, `frame_${vInfo.index}.png`);
        await extractSingleVideoFrame(videoPath, targetTime, framePath);
        framePathMap[key] = framePath;
      }

      // Build browser lookup: index -> framePath
      const browserLookup: Record<number, string> = {};
      for (const vInfo of videoInfos) {
        const key = `${vInfo.src}__${vInfo.startAt}`;
        if (framePathMap[key]) {
          browserLookup[vInfo.index] = framePathMap[key];
        }
      }

      // Replace <video> with <img> in the DOM
      await page.evaluate((lookup: Record<number, string>) => {
        const videos = document.querySelectorAll("video");
        videos.forEach((video, idx) => {
          const framePath = lookup[idx];
          if (!framePath) return;

          const img = document.createElement("img");
          const cs = window.getComputedStyle(video);
          img.style.cssText = video.style.cssText;
          img.style.objectFit = cs.objectFit || "cover";
          img.style.display = cs.display === "none" ? "none" : (video.style.display || "block");
          img.style.width = video.style.width || cs.width;
          img.style.height = video.style.height || cs.height;

          const startAt = video.getAttribute("data-start-at");
          if (startAt) img.setAttribute("data-start-at", startAt);

          img.src = `file://${framePath}`;
          video.replaceWith(img);
        });
      }, browserLookup);

      // Wait for images to load
      await page.evaluate(() =>
        new Promise<void>((resolve) => {
          const imgs = document.querySelectorAll("img[data-start-at]");
          if (imgs.length === 0) { resolve(); return; }
          let pending = imgs.length;
          const done = () => { if (--pending <= 0) setTimeout(() => resolve(), 50); };
          imgs.forEach((img) => {
            if ((img as HTMLImageElement).complete) { done(); }
            else {
              img.addEventListener("load", () => done(), { once: true });
              img.addEventListener("error", () => done(), { once: true });
              setTimeout(() => done(), 5000);
            }
          });
        })
      );
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const screenshotOpts: any = {
      path: outputPath,
      type: format,
      omitBackground,
    };
    if (format === "jpeg" && quality !== undefined) {
      screenshotOpts.quality = quality;
    }

    await page.screenshot(screenshotOpts);
    console.log(`  Captured single frame: ${outputPath}`);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    // Cleanup temp dirs
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
