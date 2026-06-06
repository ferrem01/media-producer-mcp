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

    // Wait for all video elements to load before starting capture
    await page.evaluate(() =>
      new Promise<void>((resolve) => {
        const videos = document.querySelectorAll("video");
        if (videos.length === 0) { resolve(); return; }
        let pending = videos.length;
        const done = () => { if (--pending <= 0) resolve(); };
        videos.forEach((v) => {
          if (v.readyState >= 2) { done(); }
          else {
            v.addEventListener("loadeddata", () => done(), { once: true });
            v.addEventListener("error", () => done(), { once: true });
            setTimeout(() => done(), 10000);
          }
        });
      })
    );

    for (let frame = 0; frame < totalFrames; frame++) {
      const time = frame / args.fps;

      await page.evaluate((t: number) => {
        (window as any).__MP_TIMELINE.time(t);
      }, time);

      // Sync video elements to current frame time
      await page.evaluate((t: number) =>
        new Promise<void>((resolve) => {
          const videos = document.querySelectorAll("video");
          if (videos.length === 0) {
            requestAnimationFrame(() => resolve());
            return;
          }
          let pending = videos.length;
          const done = () => { if (--pending <= 0) requestAnimationFrame(() => resolve()); };
          videos.forEach((v) => {
            const startAt = parseFloat(v.getAttribute("data-start-at") || "0");
            const targetTime = Math.max(0, t - startAt);
            // Always wait for seeked event after setting currentTime.
            // Even with readyState >= 3, the frame is not decoded until seeked fires.
            v.addEventListener("seeked", () => done(), { once: true });
            setTimeout(() => done(), 2000);
            v.currentTime = targetTime;
          });
        }),
        time
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
