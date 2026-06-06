/**
 * Frame Capture Pipeline
 *
 * Uses Playwright to load assembled scene HTML,
 * step through the GSAP timeline frame-by-frame,
 * and screenshot each frame.
 */

import { chromium, type Browser, type Page } from "playwright";
import { fork, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

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

/**
 * Capture a scene frame-by-frame using Playwright.
 */
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
 * Capture a single frame (for image output).
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

  try {
    browser = await chromium.launch({
      args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
    });
    page = await browser.newPage();
    await page.setViewportSize({ width, height });

    const fileUrl = `file://${path.resolve(htmlPath)}`;
    await page.goto(fileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    await page.waitForFunction(
      () => (window as any).__MP_READY === true,
      { timeout: 15000 }
    );

    // If a specific time is requested, advance the timeline
    if (atTime !== undefined && atTime > 0) {
      await page.evaluate((t: number) => {
        (window as any).__MP_TIMELINE.time(t);
      }, atTime);

      // Wait for video elements to load, seek, and render a frame
      await page.evaluate((seekTime: number) =>
        new Promise<void>((resolve) => {
          const videos = document.querySelectorAll("video");
          if (videos.length === 0) {
            requestAnimationFrame(() => resolve());
            return;
          }
          let pending = videos.length;
          const done = () => { if (--pending <= 0) setTimeout(() => requestAnimationFrame(() => resolve()), 100); };
          videos.forEach((v) => {
            const startAt = parseFloat(v.getAttribute("data-start-at") || "0");
            const targetTime = Math.max(0, seekTime - startAt);

            const seekAndWait = () => {
              // Always wait for seeked event after setting currentTime.
              // Even with readyState >= 3, the new frame is not decoded until seeked fires.
              v.addEventListener("seeked", () => done(), { once: true });
              v.addEventListener("error", () => done(), { once: true });
              setTimeout(() => done(), 5000);
              v.currentTime = targetTime;
            };

            // Wait for video to have enough data before seeking
            if (v.readyState >= 2) {
              seekAndWait();
            } else {
              v.addEventListener("loadeddata", () => seekAndWait(), { once: true });
              v.addEventListener("error", () => done(), { once: true });
              setTimeout(() => done(), 8000); // fallback if video never loads
            }
          });
        }),
        atTime || 0,
      );
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const screenshotOpts: any = {
      path: outputPath,
      type: format,
    };
    if (format === "jpeg" && quality !== undefined) {
      screenshotOpts.quality = quality;
    }

    await page.screenshot(screenshotOpts);
    console.log(`  Captured single frame: ${outputPath}`);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
