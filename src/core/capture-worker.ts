/**
 * Capture Worker
 *
 * Standalone script that captures frames for a single scene.
 * Spawned as a child process to guarantee full memory cleanup
 * between scenes (Playwright/Chromium leaks memory over time).
 *
 * Usage: node capture-worker.js <jsonArgsPath>
 * The JSON file contains: { htmlPath, outputDir, fps, duration, width, height, format }
 *
 * Video handling: Instead of seeking <video> elements in Chrome (which breaks
 * with multiple videos), we pre-extract all frames with ffmpeg, replace <video>
 * elements with <img> elements, and swap src on each frame tick.
 */

import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);

interface WorkerArgs {
  htmlPath: string;
  outputDir: string;
  fps: number;
  duration: number;
  width: number;
  height: number;
  format: string;
  omitBackground?: boolean;
}

/** Info about a video source whose frames have been extracted */
interface ExtractedVideo {
  framesDir: string;
  totalFrames: number;
}

/** Info collected from a <video> element in the DOM */
interface VideoElementInfo {
  src: string;
  startAt: number;
  index: number;
}

const DATA_DIR = "/data/media-producer";

/**
 * Convert a video src URL to a filesystem path.
 * Handles file:// URLs and http://localhost:3200 URLs.
 */
function resolveVideoPath(src: string): string {
  // file:// URL -> strip prefix
  if (src.startsWith("file://")) {
    return src.slice(7);
  }

  // http://localhost:3200/assets/{tenant}/projects/{projectId}/assets/{file}
  const projMatch = src.match(
    /^https?:\/\/localhost:\d+\/assets\/([^/]+)\/projects\/([^/]+)\/assets\/(.+)$/
  );
  if (projMatch) {
    return path.join(DATA_DIR, projMatch[1], "projects", projMatch[2], "assets", projMatch[3]);
  }

  // http://localhost:3200/assets/{tenant}/brand-kit/{rest}
  const brandMatch = src.match(
    /^https?:\/\/localhost:\d+\/assets\/([^/]+)\/brand-kit\/(.+)$/
  );
  if (brandMatch) {
    return path.join(DATA_DIR, brandMatch[1], "brand-kit", "assets", brandMatch[2]);
  }

  // Already a filesystem path
  return src;
}

/**
 * Extract all frames from a video file at the given fps using ffmpeg.
 * Returns the temp directory and total frame count.
 */
async function extractVideoFrames(
  videoPath: string,
  fps: number
): Promise<ExtractedVideo> {
  const hash = crypto.createHash("md5").update(videoPath).digest("hex").slice(0, 12);
  const framesDir = `/tmp/vframes_${hash}`;

  // If already extracted (shared src), just count frames
  try {
    const existing = await fs.readdir(framesDir);
    const pngFiles = existing.filter((f) => f.endsWith(".png"));
    if (pngFiles.length > 0) {
      console.log(`  Reusing ${pngFiles.length} pre-extracted frames for ${path.basename(videoPath)}`);
      return { framesDir, totalFrames: pngFiles.length };
    }
  } catch {
    // Dir doesn't exist, will create
  }

  await fs.mkdir(framesDir, { recursive: true });

  console.log(`  Extracting frames from ${path.basename(videoPath)} at ${fps}fps...`);
  await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-vf", `fps=${fps}`,
    "-start_number", "0",
    `${framesDir}/frame-%06d.png`,
  ], { timeout: 120_000 });

  const files = await fs.readdir(framesDir);
  const totalFrames = files.filter((f) => f.endsWith(".png")).length;
  console.log(`  Extracted ${totalFrames} frames from ${path.basename(videoPath)}`);

  return { framesDir, totalFrames };
}

/**
 * Clean up all extracted frame directories.
 */
async function cleanupFrameDirs(dirs: Set<string>): Promise<void> {
  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
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
      "--allow-file-access-from-files",
    ],
  });

  const frameDirsToCleanup = new Set<string>();

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: args.width, height: args.height });

    const fileUrl = `file://${path.resolve(args.htmlPath)}`;
    await page.goto(fileUrl, { waitUntil: "networkidle" });

    await page.waitForFunction(
      () => (window as any).__MP_READY === true,
      { timeout: 15000 }
    );

    // ── Phase 1: Discover video elements ──
    const videoInfos: VideoElementInfo[] = await page.evaluate(() => {
      const videos = document.querySelectorAll("video");
      return Array.from(videos).map((v, i) => ({
        src: v.src || v.getAttribute("src") || "",
        startAt: parseFloat(v.getAttribute("data-start-at") || "0"),
        index: i,
      }));
    });

    // DEBUG: write sentinel file
    // ── Phase 2: Extract frames with ffmpeg ──
    const extractionMap = new Map<string, ExtractedVideo>();

    if (videoInfos.length > 0) {
      // Collect unique sources
      const uniqueSrcs = [...new Set(videoInfos.map((v) => v.src).filter(Boolean))];
      console.log(`  Found ${videoInfos.length} video element(s), ${uniqueSrcs.length} unique source(s)`);

      for (const src of uniqueSrcs) {
        const videoPath = resolveVideoPath(src);

        // Verify the file exists
        try {
          await fs.access(videoPath);
        } catch {
          console.warn(`  Warning: Video file not found: ${videoPath} (src: ${src})`);
          continue;
        }

        const extracted = await extractVideoFrames(videoPath, args.fps);
        extractionMap.set(src, extracted);
        frameDirsToCleanup.add(extracted.framesDir);
      }

      // ── Phase 3: Hide <video> elements and insert sibling <img> overlays ──
      // (Don't replace -- keep GSAP animation targets intact)
      await page.evaluate(() => {
        const videos = document.querySelectorAll("video");
        videos.forEach((video, idx) => {
          video.style.setProperty("visibility", "hidden", "important");
          video.style.setProperty("pointer-events", "none", "important");

          const img = document.createElement("img");
          img.id = `__render_frame_${idx}__`;
          img.className = "__render_frame__";
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

          video.parentElement?.appendChild(img);
        });
      });
    }

    const hasVideos = extractionMap.size > 0;

    // ── Capture loop ──
    for (let frame = 0; frame < totalFrames; frame++) {
      const time = frame / args.fps;

      // Advance GSAP timeline
      await page.evaluate((t: number) => {
        (window as any).__MP_TIMELINE.time(t);
      }, time);

      // Update video frame images via file:// paths (not data URIs --
      // 9 base64 1080p PNGs overwhelm Chrome evaluate pipeline)
      if (hasVideos) {
        const frameUpdates: Array<{ imgId: string; src: string }> = [];
        for (const vInfo of videoInfos) {
          const extracted = extractionMap.get(vInfo.src);
          if (!extracted) continue;
          const targetTime = Math.max(0, time - vInfo.startAt);
          const frameIndex = Math.min(Math.round(targetTime * args.fps), extracted.totalFrames - 1);
          const framePath = path.join(extracted.framesDir, `frame-${String(frameIndex).padStart(6, "0")}.png`);
          frameUpdates.push({ imgId: `__render_frame_${vInfo.index}__`, src: `file://${framePath}` });
        }

        await page.evaluate((updates: Array<{ imgId: string; src: string }>) =>
          new Promise<void>((resolve) => {
            let pending = updates.length;
            if (pending === 0) { requestAnimationFrame(() => resolve()); return; }
            const done = () => { if (--pending <= 0) requestAnimationFrame(() => resolve()); };
            for (const { imgId, src } of updates) {
              const img = document.getElementById(imgId) as HTMLImageElement | null;
              if (!img) { done(); continue; }
              if (img.src === src) { done(); continue; }
              img.addEventListener("load", () => done(), { once: true });
              img.addEventListener("error", () => done(), { once: true });
              setTimeout(() => done(), 3000);
              img.src = src;
            }
          }),
          frameUpdates
        );
      } else {
        await page.evaluate(() =>
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        );
      }

      const frameName = `frame-${String(frame).padStart(6, "0")}.${args.format}`;
      await page.screenshot({
        omitBackground: args.omitBackground || false,
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
    // ── Phase 4: Cleanup extracted frames ──
    await cleanupFrameDirs(frameDirsToCleanup);
  }
}

main().catch((err) => {
  console.error("Worker error:", err.message || err);
  process.exit(1);
});
