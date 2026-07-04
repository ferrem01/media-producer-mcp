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
// Optional explicit Chromium path (e.g. constrained CI/remote envs where the
// bundled Playwright revision isn't downloaded). Honors MP_CHROMIUM_PATH.
const LAUNCH_OPTS = {
  args: BROWSER_ARGS,
  ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
};
let pooledBrowser: Browser | undefined;
let pooledBrowserPromise: Promise<Browser> | undefined;
let pooledLaunches = 0;

/** Number of times the pool actually launched a browser (for tests/telemetry). */
export function pooledLaunchCount(): number { return pooledLaunches; }

async function getPooledBrowser(): Promise<Browser> {
  if (pooledBrowser?.isConnected()) return pooledBrowser;
  if (pooledBrowserPromise) return pooledBrowserPromise;
  pooledBrowserPromise = chromium.launch(LAUNCH_OPTS)
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
    catch { ownBrowser = await chromium.launch(LAUNCH_OPTS); browser = ownBrowser; }
    page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.setViewportSize({ width, height });
    let pageError: string | undefined;
    page.on("pageerror", (e) => { if (!pageError) pageError = String((e as any)?.message || e); });

    await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 60000 });

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
  /** Effective opacity (element and ancestors multiplied). Text between 0.5 and
   *  0.85 is reported (dim-but-visible) so contrast can composite it; below 0.5
   *  is skipped as mid-fade/decorative. */
  opacity: number;
  /** Fraction (0-1) of the text's area cut off by the canvas edge or an
   *  overflow-hidden ancestor. Nonzero = truncated text ("xt", half a headline). */
  clippedFraction: number;
}

/** A candidate "surface" (card/window/panel) measured for separation from the
 *  page background -- used to catch ghost panels that vanish into the backdrop. */
export interface SurfaceMetric {
  /** Short descriptor for reporting (tag + first text/class). */
  label: string;
  x: number; y: number; w: number; h: number;
  /** Computed background-color, e.g. "rgb(245, 245, 247)". */
  bg: string;
  /** Thickest border edge in px. */
  borderWidth: number;
  /** Computed border color. */
  borderColor: string;
  /** True if box-shadow is set (a real elevation cue). */
  hasShadow: boolean;
}

/** Layout/composition measurements for the deterministic design gate. */
export interface LayoutProbeResult {
  vw: number; vh: number;
  /** Base page background color (body, falling back to html). */
  pageBg: string;
  /** Candidate panels/cards/windows to check for surface separation. */
  surfaces: SurfaceMetric[];
  /** Bounding boxes of all visible, meaningful content (text/img/svg/button/panel). */
  contentBoxes: Array<{ x: number; y: number; w: number; h: number }>;
  /** True if a near-full-bleed element carries a gradient or image fill -- i.e.
   *  empty regions are richly filled (a colorful backdrop), not flat dead space. */
  hasRichFullBleedBg: boolean;
  /** Text elements whose glyphs are cut off by an overflow-clipping ancestor or
   *  the canvas edge ("One brief" rendering as "One br"). */
  clippedTexts: Array<{ text: string; el: string; container: string; overflowX: number; overflowY: number }>;
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
  /** Layout probe: collect surfaces + content bounding boxes so the caller can
   *  measure surface separation (ghost panels) and content coverage (dead zones). */
  layoutProbe?: boolean;
}): Promise<{ textElements?: TextElementMetric[]; layout?: LayoutProbeResult }> {
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
    layoutProbe = false,
  } = options;
  let textElements: TextElementMetric[] | undefined;
  let layout: LayoutProbeResult | undefined;

  let ownBrowser: Browser | undefined;
  let page: Page | undefined;
  const tempDirs = new Set<string>();

  try {
    let browser: Browser;
    try { browser = await getPooledBrowser(); }
    catch { ownBrowser = await chromium.launch(LAUNCH_OPTS); browser = ownBrowser; }
    page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.setViewportSize({ width, height });

    const fileUrl = `file://${path.resolve(htmlPath)}`;
    await page.goto(fileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.waitForFunction(
      () => (window as any).__MP_READY === true,
      undefined,
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
        // A <video> whose src was dropped/empty has v.src resolve to the document
        // URL (.../scene.html); without this guard that gets handed to ffmpeg as a
        // "video" and fails with "Invalid data found" (seen on intro/outro clips).
        if (!/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(vInfo.src)) {
          console.warn(`  Skipping non-video <video> src: ${vInfo.src.slice(0, 80)}`);
          continue;
        }
        const videoPath = resolveVideoPath(vInfo.src);

        try {
          await fs.access(videoPath);
        } catch {
          console.warn(`  Warning: Video file not found: ${videoPath}`);
          continue;
        }

        // Seek semantics (offset + time), matching the preview and the
        // render frame swapper -- data-start-at is not a delay.
        const targetTime = Math.max(0, vInfo.startAt + captureTime);
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
          // Skip mid-fade text (opacity gate) -- but keep DIM text (0.5-0.85):
          // permanently low-opacity captions are a low-contrast classic, and
          // skipping them made them invisible to the gate at every sample. The
          // opacity is reported so contrast is measured on the composited color.
          const elOpacity = effectiveOpacity(el);
          if (elOpacity < 0.5) return;
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 6) return;
          if (r.x >= vw || r.y >= vh || r.x + r.width <= 0 || r.y + r.height <= 0) return; // fully off-canvas: never visible
          // Clipped-text measurement: how much of this text run is cut off by
          // the canvas or by an overflow-hidden ancestor (component containers
          // are overflow:hidden, so sidebar labels clipped to "xt" land here).
          let clipLeft = 0, clipTop = 0, clipRight = vw, clipBottom = vh;
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const acs = getComputedStyle(a);
            if (/(hidden|clip|scroll|auto)/.test(acs.overflow + acs.overflowX + acs.overflowY)) {
              const ar = a.getBoundingClientRect();
              clipLeft = Math.max(clipLeft, ar.left);
              clipTop = Math.max(clipTop, ar.top);
              clipRight = Math.min(clipRight, ar.right);
              clipBottom = Math.min(clipBottom, ar.bottom);
            }
          }
          const visW = Math.max(0, Math.min(r.right, clipRight) - Math.max(r.left, clipLeft));
          const visH = Math.max(0, Math.min(r.bottom, clipBottom) - Math.max(r.top, clipTop));
          const area = r.width * r.height;
          const clippedFraction = area > 0 ? 1 - (visW * visH) / area : 0;
          const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
          const covers = (e: Element) => {
            const er = e.getBoundingClientRect();
            return er.left <= cx && er.right >= cx && er.top <= cy && er.bottom >= cy;
          };
          const overVideo = footageEls.some(covers);
          // Backing = the legibility "treatment" actually being present. Recognize
          // ALL the techniques we offer, so we don't falsely flag treated text:
          //  - a non-footage element (text bg, ancestor, or scrim/panel div) with a
          //    meaningful bg covering the text center -- INCLUDING ::before/::after
          //    pseudo-element scrims (a very common way to do it);
          //  - the footage itself graded/darkened via a filter (technique C) -- the
          //    contrast sampling then validates against the graded frame.
          let hasBacking = false;
          if (overVideo) {
            const footageGraded = footageEls.some((f) => {
              const fcs = getComputedStyle(f);
              const filt = fcs.filter || (fcs as any).webkitFilter || "";
              return !!filt && filt !== "none";
            });
            const backs = (e: Element) => {
              if (footageEls.includes(e) || !covers(e)) return false;
              return meaningfulBg(getComputedStyle(e))
                || meaningfulBg(getComputedStyle(e, "::before"))
                || meaningfulBg(getComputedStyle(e, "::after"));
            };
            hasBacking = footageGraded || allEls.some(backs);
          }
          out.push({
            text: txt.slice(0, 60), color: cs.color, fontSize: fs,
            x, y, w: Math.round(Math.min(r.width, vw - x)), h: Math.round(Math.min(r.height, vh - y)),
            overVideo, hasBacking,
            opacity: elOpacity, clippedFraction: Math.round(clippedFraction * 100) / 100,
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

    // Layout probe: collect surfaces (candidate panels) + content boxes + whether
    // a rich full-bleed background fills the empty space. Pure geometry/styles --
    // no pixel reads -- so the caller can deterministically gate ghost panels and
    // dead zones.
    if (layoutProbe) {
      layout = await page.evaluate(({ vw, vh }) => {
        const area = vw * vh;
        const visible = (cs: CSSStyleDeclaration) =>
          cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity || "1") >= 0.5;
        const onCanvas = (r: DOMRect) =>
          r.width >= 8 && r.height >= 6 && r.x < vw && r.y < vh && r.x + r.width > 0 && r.y + r.height > 0;
        const alphaOf = (col: string) => {
          const m = col.match(/rgba?\(([^)]+)\)/);
          if (!m) return 0;
          const p = m[1].split(",").map((s) => parseFloat(s));
          return p.length >= 4 ? p[3] : (p.length === 3 ? 1 : 0);
        };
        const richFill = (cs: CSSStyleDeclaration) => {
          const bi = cs.backgroundImage || "";
          return bi !== "none" && (bi.includes("gradient") || bi.includes("url("));
        };

        const bodyCs = getComputedStyle(document.body);
        let pageBg = bodyCs.backgroundColor;
        if (alphaOf(pageBg) < 0.5) {
          const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
          if (alphaOf(htmlBg) >= 0.5) pageBg = htmlBg;
        }

        const els = Array.from(document.querySelectorAll("body *"));
        let hasRichFullBleedBg = false;
        const surfaces: any[] = [];
        const contentBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
        const clippedTexts: Array<{ text: string; el: string; container: string; overflowX: number; overflowY: number }> = [];

        for (const el of els) {
          const cs = getComputedStyle(el);
          if (!visible(cs)) continue;
          const r = el.getBoundingClientRect();
          if (!onCanvas(r)) continue;
          const aFrac = (r.width * r.height) / area;
          const box = {
            x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)),
            w: Math.round(Math.min(r.width, vw)), h: Math.round(Math.min(r.height, vh)),
          };

          // Near-full-bleed element that paints the whole frame (gradient/image
          // fill, or a canvas/svg/video/img backdrop) -> empty space is filled.
          const fullBleed = r.width >= vw * 0.9 && r.height >= vh * 0.9;
          const paintsFrame = richFill(cs) ||
            ["canvas", "svg", "video", "img"].includes(el.tagName.toLowerCase());
          if (fullBleed && paintsFrame) hasRichFullBleedBg = true;

          // Content boxes: anything that visibly occupies space and reads as content.
          const tag = el.tagName.toLowerCase();
          const directText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3).map((n) => n.textContent || "").join("").trim();
          const isMedia = tag === "img" || tag === "svg" || tag === "video" || tag === "canvas";
          const isButton = tag === "button" || (el.getAttribute("role") === "button");
          const hasOwnFill = alphaOf(cs.backgroundColor) >= 0.5 || richFill(cs);
          const fontSize = parseFloat(cs.fontSize) || 0;
          if ((directText.length >= 2 && fontSize >= 14) || isMedia || isButton) {
            contentBoxes.push(box);
          }

          // Clipped text: significant text whose glyphs are cut off -- by its
          // own overflow-hidden box, by the nearest clipping ancestor, or by
          // the canvas edge. This is the defect class where "One brief"
          // renders as "One br": obvious to a human, invisible to contrast
          // and coverage measurements.
          if (directText.length >= 3 && fontSize >= 16) {
            const se = el as HTMLElement;
            let clipX = 0, clipY = 0, container = "";
            if (se.scrollWidth - se.clientWidth > 8) { clipX = se.scrollWidth - se.clientWidth; container = "its own box"; }
            if (se.scrollHeight - se.clientHeight > 14) { clipY = se.scrollHeight - se.clientHeight; container = container || "its own box"; }
            let anc = el.parentElement;
            while (anc && anc !== document.body) {
              const acs = getComputedStyle(anc);
              if (/(hidden|clip)/.test(String(acs.overflow) + String(acs.overflowX) + String(acs.overflowY))) {
                const ar = anc.getBoundingClientRect();
                const ox = Math.max(0, Math.round(r.right - ar.right), Math.round(ar.left - r.left));
                const oy = Math.max(0, Math.round(r.bottom - ar.bottom), Math.round(ar.top - r.top));
                if (ox > 8 || oy > 14) {
                  container = anc.tagName.toLowerCase() +
                    (anc.className && typeof anc.className === "string" ? "." + anc.className.split(/\s+/)[0] : "");
                  clipX = Math.max(clipX, ox);
                  clipY = Math.max(clipY, oy);
                }
                break; // nearest clipping ancestor decides
              }
              anc = anc.parentElement;
            }
            const ex = Math.max(0, Math.round(r.right - vw), Math.round(0 - r.left));
            const ey = Math.max(0, Math.round(r.bottom - vh), Math.round(0 - r.top));
            if ((ex > 8 || ey > 14) && !container) { clipX = Math.max(clipX, ex); clipY = Math.max(clipY, ey); container = "the canvas edge"; }
            if ((clipX > 8 || clipY > 14) && container) {
              clippedTexts.push({
                text: directText.slice(0, 40),
                el: tag + (el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/)[0] : ""),
                container, overflowX: clipX, overflowY: clipY,
              });
            }
          }

          // Surfaces: mid-sized filled containers (panels/cards/windows). Skip the
          // full-bleed background layer and tiny chips. Include panels whose fill
          // is only PARTIALLY opaque (alpha 0.06-0.5): a ghost card with a 20%
          // white wash is still a panel ATTEMPT and must be measured -- skipping
          // it is how invisible cards slip the gate entirely.
          const isPanelSized = aFrac >= 0.01 && aFrac < 0.6 && r.width >= 120 && r.height >= 70;
          const notFullBleed = !(r.width >= vw * 0.9 && r.height >= vh * 0.9);
          const hasFillAttempt = alphaOf(cs.backgroundColor) >= 0.06 || richFill(cs);
          if (isPanelSized && notFullBleed && hasFillAttempt && !richFill(cs)) {
            const bw = Math.max(
              parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderRightWidth) || 0,
              parseFloat(cs.borderBottomWidth) || 0, parseFloat(cs.borderLeftWidth) || 0,
            );
            const label = `${tag}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/)[0] : ""}` +
              (directText ? ` "${directText.slice(0, 24)}"` : "");
            surfaces.push({
              label: label.slice(0, 48), x: box.x, y: box.y, w: box.w, h: box.h,
              bg: cs.backgroundColor, borderWidth: bw, borderColor: cs.borderTopColor,
              // A shadow only counts as an elevation cue when it's VISIBLE:
              // ghost panels declare box-shadows at 3-8% alpha that satisfy
              // "has a shadow" while reading as nothing. Require real alpha.
              hasShadow: (() => {
                const bs = cs.boxShadow;
                if (!bs || bs === "none") return false;
                let maxA = 0;
                const re = /rgba?\(([^)]+)\)/g;
                let m: RegExpExecArray | null;
                while ((m = re.exec(bs))) {
                  const parts = m[1].split(",");
                  const a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
                  if (a > maxA) maxA = a;
                }
                return maxA >= 0.12;
              })(),
            });
          }
        }
        return { vw, vh, pageBg, surfaces, contentBoxes, hasRichFullBleedBg, clippedTexts };
      }, { vw: width, vh: height });
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
  return { textElements, layout };
}
