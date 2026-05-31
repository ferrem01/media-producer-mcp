/**
 * Capture Worker
 *
 * Standalone script that captures frames for a single scene.
 * Spawned as a child process to guarantee full memory cleanup
 * between scenes (Playwright/Chromium leaks memory over time).
 *
 * Usage: node capture-worker.js <jsonArgsPath>
 * The JSON file contains: { htmlPath, outputDir, fps, duration, width, height, format }
 */

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

interface WorkerArgs {
  htmlPath: string;
  outputDir: string;
  fps: number;
  duration: number;
  width: number;
  height: number;
  format: string;
}

async function main() {
  const argsPath = process.argv[2];
  if (!argsPath) {
    console.error("Usage: capture-worker.js <argsJsonPath>");
    process.exit(1);
  }

  const args: WorkerArgs = JSON.parse(await fs.readFile(argsPath, "utf-8"));
  const totalFrames = Math.ceil(args.duration * args.fps);

  await fs.mkdir(args.outputDir, { recursive: true });

  const browser = await chromium.launch({
    args: [
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: args.width, height: args.height });

    const fileUrl = `file://${path.resolve(args.htmlPath)}`;
    await page.goto(fileUrl, { waitUntil: "networkidle" });

    await page.waitForFunction(
      () => (window as any).__MP_READY === true,
      { timeout: 15000 }
    );

    for (let frame = 0; frame < totalFrames; frame++) {
      const time = frame / args.fps;

      await page.evaluate((t: number) => {
        (window as any).__MP_TIMELINE.time(t);
      }, time);

      await page.evaluate(() =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      );

      const frameName = `frame-${String(frame).padStart(6, "0")}.${args.format}`;
      await page.screenshot({
        path: path.join(args.outputDir, frameName),
        type: args.format as "png" | "jpeg",
      });

      // Progress logging every 10%
      if (totalFrames > 20 && frame % Math.ceil(totalFrames / 10) === 0) {
        const pct = Math.round((frame / totalFrames) * 100);
        console.log(`  Capture progress: ${pct}% (frame ${frame}/${totalFrames})`);
      }
    }

    console.log(`  Captured ${totalFrames} frames`);
    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Worker error:", err.message || err);
  process.exit(1);
});
