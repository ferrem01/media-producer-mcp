/**
 * Frame Capture Pipeline
 *
 * Uses Playwright to load assembled scene HTML,
 * step through the GSAP timeline frame-by-frame,
 * and screenshot each frame.
 */

import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

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
// Shared browser instance to avoid OOM from launching per scene
let _sharedBrowser: Browser | undefined;
let _browserUseCount = 0;
const MAX_BROWSER_USES = 20; // restart after N scenes to prevent memory creep

async function getSharedBrowser(): Promise<Browser> {
  if (!_sharedBrowser || !_sharedBrowser.isConnected() || _browserUseCount >= MAX_BROWSER_USES) {
    if (_sharedBrowser) {
      await _sharedBrowser.close().catch(() => {});
    }
    _sharedBrowser = await chromium.launch({
      args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
    _browserUseCount = 0;
  }
  _browserUseCount++;
  return _sharedBrowser;
}

export async function captureScene(options: CaptureOptions): Promise<CaptureResult> {
  const {
    htmlPath,
    outputDir,
    fps,
    duration,
    width,
    height,
    format = "png",
    quality,
  } = options;

  const totalFrames = Math.ceil(duration * fps);
  const startTime = Date.now();

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await getSharedBrowser();
  let page: Awaited<ReturnType<Browser['newPage']>> | undefined;

  try {
    page = await browser.newPage();
    await page.setViewportSize({ width, height });

    // Load the scene HTML
    const fileUrl = `file://${path.resolve(htmlPath)}`;
    await page.goto(fileUrl, { waitUntil: "networkidle" });

    // Wait for the scene to signal readiness
    await page.waitForFunction(
      () => (window as any).__MP_READY === true,
      { timeout: 15000 }
    );

    // Capture frame by frame
    for (let frame = 0; frame < totalFrames; frame++) {
      const time = frame / fps;

      // Advance the GSAP master timeline to this time
      await page.evaluate((t: number) => {
        (window as any).__MP_TIMELINE.time(t);
      }, time);

      // Let the browser settle (one animation frame)
      await page.evaluate(() =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      );

      // Screenshot
      const frameName = `frame-${String(frame).padStart(6, "0")}.${format}`;
      const screenshotOpts: any = {
        path: path.join(outputDir, frameName),
        type: format,
      };
      if (format === "jpeg" && quality !== undefined) {
        screenshotOpts.quality = quality;
      }

      await page.screenshot(screenshotOpts);

      // Progress logging every 10%
      if (totalFrames > 20 && frame % Math.ceil(totalFrames / 10) === 0) {
        const pct = Math.round((frame / totalFrames) * 100);
        console.log(`  Capture progress: ${pct}% (frame ${frame}/${totalFrames})`);
      }
    }

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
  } finally {
    // Close the page, not the browser (browser is shared)
    if (page) await page.close().catch(() => {});
  }
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
  /** Time in seconds to capture at (default: 0 for static, or midpoint) */
  atTime?: number;
}): Promise<void> {
  const {
    htmlPath,
    outputPath,
    width,
    height,
    format = "png",
    quality,
    atTime,
  } = options;

  const browser = await getSharedBrowser();
  let page: Awaited<ReturnType<Browser['newPage']>> | undefined;

  try {
    page = await browser.newPage();
    await page.setViewportSize({ width, height });

    const fileUrl = `file://${path.resolve(htmlPath)}`;
    await page.goto(fileUrl, { waitUntil: "networkidle" });

    await page.waitForFunction(
      () => (window as any).__MP_READY === true,
      { timeout: 15000 }
    );

    // If a specific time is requested, advance the timeline
    if (atTime !== undefined && atTime > 0) {
      await page.evaluate((t: number) => {
        (window as any).__MP_TIMELINE.time(t);
      }, atTime);

      await page.evaluate(() =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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
  }
}
