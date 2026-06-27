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

// ── Headless-browser pool ───────────────────────────────────────────────────
// In-process captures (per-scene critique frames + runtime validation) used to
// COLD-LAUNCH a fresh Chromium per call (~1-2s each) -- on a multi-scene video
// with retries that is dozens of launches. Reuse ONE long-lived browser and just
// open/close a page per capture. Quality-neutral; Playwright supports many
// concurrent pages on one browser. The pool self-heals if the browser dies, and
// callers fall back to a one-off launch if pooling ever fails.
const BROWSER_ARGS = [
  "--enable-gpu", "--use-gl=swiftshader", "--enable-webgl",
  "--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox",
  "--allow-file-access-from-files", "--disable-extensions",
  "--disable-background-networking", "--disable-default-apps",
  "--mute-audio", "--no-first-run",
];
let pooledBrowser: Browser | undefined;
let pooledBrowserPromise: Promise<Browser> | undefined;
let pooledLaunches = 0;

/** Number of times the pool actually launched a browser (for tests/telemetry). */
export function pooledLaunchCount(): number { return pooledLaunches; }

async function getPooledBrowser(): Promise<Browser> {
  if (pooledBrowser?.isConnected()) return pooledBrowser;
  if (pooledBrowserPromise) return pooledBrowserPromise;
  pooledBrowserPromise = chromium.launch({ args: BROWSER_ARGS })
    .then((b) => {
      pooledLaunches++;
      pooledBrowser = b;
      b.on("disconnected", () => { if (pooledBrowser === b) { pooledBrowser = undefined; } });
      pooledBrowserPromise = undefined;
      return b;
    })
    .catch((e) => { pooledBrowserPromise = undefined; throw e; });
  return pooledBrowserPromise;
}

/** Close the pooled browser (call on shutdown; safe to call when none exists). */
export async function closePooledBrowser(): Promise<void> {
  const b = pooledBrowser;
  pooledBrowser = undefined;
  pooledBrowserPromise = undefined;
  await b?.close().catch(() => {});
}

// Best-effort cleanup so the pooled browser doesn't outlive the process.
process.once("exit", () => { try { pooledBrowser?.close(); } catch { /* */ } });


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
 * Runtime "smoke test" for a scene: load the assembled HTML and seek the master
 * GSAP timeline across the whole duration, collecting any JavaScript error that
 * a component callback throws (e.g. setting textContent on a null element).
 *
 * This is the correctness counterpart to the vision critique: the vision model
 * judges whether a scene LOOKS good, but it cannot see that a callback threw
 * mid-animation (the frame still renders). A thrown error means an element the
 * scene's timeline touches doesn't exist -- the scene will render degraded.
 *
 * Returns { ok: true } if the animation runs clean across all sampled times,
 * or { ok: false, error, atTime } with the first error encountered. Infra
 * failures (launch/load/timeout) return ok:true so they never block generation.
 */
export async function validateSceneRuntime(options: {
  htmlPath: string;
  width: number;
  height: number;
  duration: number;
  /** Number of seek steps across the timeline (default 12) */
  steps?: number;
}): Promise<{ ok: boolean; error?: string; atTime?: number }> {
  const { htmlPath, width, height, duration, steps = 12 } = options;
  let page: Page | undefined;
  let ownBrowser: Browser | undefined;
  try {
    let browser: Browser;
    try { browser = await getPooledBrowser(); }
    catch { ownBrowser = await chromium.launch({ args: BROWSER_ARGS }); browser = ownBrowser; }
    page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.setViewportSize({ width, height });
    let pageError: string | undefined;
    page.on("pageerror", (e) => { if (!pageError) pageError = String((e as any)?.message || e); });

    await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 60000 });

    // Seek across the timeline; the first synchronous throw from a component
    // callback is caught here. Async/load errors surface via the pageerror listener.
    const swept = await page.evaluate((args: { dur: number; steps: number }) => {
      const tl = (window as any).__MP_TIMELINE;
      if (!tl || typeof tl.time !== "function") return { err: "__MP_TIMELINE not defined", at: 0 };
      const n = Math.max(1, args.steps);
      for (let i = 0; i <= n; i++) {
        const t = (args.dur * i) / n;
        try { tl.time(t); } catch (e: any) { return { err: String(e?.message || e), at: t }; }
      }
      return { err: null as string | null, at: 0 };
    }, { dur: duration, steps });

    const error = swept.err || pageError;
    if (error) return { ok: false, error, atTime: swept.at };
    return { ok: true };
  } catch {
    // Validation infrastructure failure -- do not block generation.
    return { ok: true };
  } finally {
    await page?.close().catch(() => {});
    await ownBrowser?.close().catch(() => {});
  }
}

/**
 * Capture a single frame (for image output or critique screenshots).
 * Uses ffmpeg to extract video frames instead of Chrome seeking.
 */
export interface TextElementMetric {
  /** Sample of the element's text (for reporting) */
  text: string;
  /** Computed text color, e.g. "rgb(26, 34, 64)" */
  color: string;
  /** Computed font-size in px */
  fontSize: number;
  /** Bounding box in viewport pixels (clamped to the canvas) */
  x: number; y: number; w: number; h: number;
  /** True if this text sits over a full-bleed video/footage element. */
  overVideo: boolean;
  /** True if a meaningful backing (scrim/panel/opaque bg) sits between the text
   *  and the footage -- the legibility "treatment". Only meaningful when overVideo. */
  hasBacking: boolean;
}

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
  /** Legibility probe: collect significant text elements, then HIDE their glyphs
   *  so the screenshot is the clean backdrop behind the text. Returns the
   *  collected metrics so the caller can measure text-vs-backdrop contrast. */
  contrastProbe?: boolean;
}): Promise<{ textElements?: TextElementMetric[] }> {
  const {
    htmlPath,
    outputPath,
    width,
    height,
    format = "png",
    omitBackground = false,
    quality,
    atTime,
    contrastProbe = false,
  } = options;
  let textElements: TextElementMetric[] | undefined;

  let ownBrowser: Browser | undefined;
  let page: Page | undefined;
  const tempDirs = new Set<string>();

  try {
    let browser: Browser;
    try { browser = await getPooledBrowser(); }
    catch { ownBrowser = await chromium.launch({ args: BROWSER_ARGS }); browser = ownBrowser; }
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

    // Legibility probe: record significant text elements (color/size/box), then
    // hide their glyphs so the screenshot below is the pure backdrop behind them.
    if (contrastProbe) {
      textElements = await page.evaluate(({ vw, vh }) => {
        function effectiveOpacity(el: Element | null): number {
          let o = 1;
          for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
            const op = parseFloat(getComputedStyle(e).opacity);
            if (!isNaN(op)) o *= op;
          }
          return o;
        }
        // Full-bleed footage elements. By probe time a <video> may already be
        // swapped for an <img data-start-at> still, so match both, plus b-roll class.
        function isFullBleed(el: Element): boolean {
          const r = el.getBoundingClientRect();
          return r.width >= vw * 0.6 && r.height >= vh * 0.6;
        }
        const footageEls = Array.from(
          document.querySelectorAll("video, img[data-start-at], .mp-broll, [class*='broll']")
        ).filter(isFullBleed);
        // A "meaningful backing" = an opaque-ish color bg, a gradient/image bg, or
        // a backdrop blur. A flimsy <0.25-alpha tint does not count as treatment.
        function meaningfulBg(cs: CSSStyleDeclaration): boolean {
          const bc = cs.backgroundColor || "";
          const m = bc.match(/rgba?\(([^)]+)\)/);
          let alpha = 0;
          if (m) { const p = m[1].split(",").map((s) => parseFloat(s)); alpha = p.length >= 4 ? p[3] : (p.length === 3 ? 1 : 0); }
          const hasColor = alpha >= 0.25;
          const hasImg = !!cs.backgroundImage && cs.backgroundImage !== "none";
          const bf = (cs as any).backdropFilter || (cs as any).webkitBackdropFilter || "";
          const hasBlur = !!bf && bf !== "none";
          return hasColor || hasImg || hasBlur;
        }
        const allEls = Array.from(document.querySelectorAll("body *"));
        const out: any[] = [];
        document.querySelectorAll("body *").forEach((el) => {
          const txt = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent || "")
            .join("").trim();
          if (txt.length < 2) return;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") return;
          const fs = parseFloat(cs.fontSize) || 0;
          if (fs < 14) return;
          if (effectiveOpacity(el) < 0.85) return; // skip mid-fade text
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 6) return;
          if (r.x > vw || r.y > vh || r.x + r.width < 0 || r.y + r.height < 0) return; // off-canvas
          const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
          const covers = (e: Element) => {
            const er = e.getBoundingClientRect();
            return er.left <= cx && er.right >= cx && er.top <= cy && er.bottom >= cy;
          };
          const overVideo = footageEls.some(covers);
          // Backing = any non-footage element (the text's own bg, an ancestor, or a
          // dedicated scrim/panel div) with a meaningful bg covering the text center.
          let hasBacking = false;
          if (overVideo) {
            hasBacking = allEls.some((e) =>
              !footageEls.includes(e) && covers(e) && meaningfulBg(getComputedStyle(e))
            );
          }
          out.push({
            text: txt.slice(0, 60), color: cs.color, fontSize: fs,
            x, y, w: Math.round(Math.min(r.width, vw - x)), h: Math.round(Math.min(r.height, vh - y)),
            overVideo, hasBacking,
          });
        });
        return out;
      }, { vw: width, vh: height });

      await page.evaluate(() => {
        document.querySelectorAll("body *").forEach((el) => {
          const txt = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || "").join("").trim();
          if (txt.length >= 2) {
            (el as HTMLElement).style.setProperty("color", "transparent", "important");
            (el as HTMLElement).style.setProperty("text-shadow", "none", "important");
          }
        });
      });
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
    if (ownBrowser) await ownBrowser.close().catch(() => {});  // only close a one-off; keep the pool alive
    // Cleanup temp dirs
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  return { textElements };
}
