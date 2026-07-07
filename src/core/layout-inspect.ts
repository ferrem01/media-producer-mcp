import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { assembleSceneAuto } from "./scene-assembler.js";
import { resolveVideoPath } from "./video-path.js";
import { loadProject } from "../persistence/project.js";
import { config } from "../config.js";

/**
 * Scene layout inspection: render the scene headless and return MEASURED
 * geometry facts -- element boxes, container chains, video intrinsic sizes
 * and the object-fit crop math -- plus plain-English warnings.
 *
 * This is the diagnostic half of surgical revision. A user (or agent) sees a
 * SYMPTOM ("the video runs over the bottom of the frame"); the cause is
 * usually numeric and invisible in the source (an object-fit:cover crop, a
 * padding that an absolute child ignores). Exposed two ways:
 *   - MCP `get` target='layout' -> any agent can pull the facts;
 *   - injected into the revise prompt -> symptom-level instructions get
 *     cause-level fixes.
 */

export interface BoxRect { x: number; y: number; w: number; h: number }

export interface AncestorFact {
  descriptor: string;
  box: BoxRect;
  overflow: string;
  borderRadius: string;
  position: string;
}

export interface VideoLayoutFact {
  descriptor: string;
  src: string;
  box: BoxRect;
  objectFit: string;
  objectPosition: string;
  /** Actual pixel size of the media file (ffmpeg probe); null if unreadable. */
  intrinsic: { w: number; h: number } | null;
  /** For cover: how many px of the (scaled) media are cropped per edge.
   *  For contain: negative values mean empty gutters instead. */
  crop?: { top: number; bottom: number; left: number; right: number; mode: "cropped" | "gutters" };
  containers: AncestorFact[];
}

export interface ElementLayoutFact {
  descriptor: string;
  box: BoxRect;
  position: string;
  overflow: string;
  display: string;
  containers: AncestorFact[];
}

export interface LayoutInspection {
  ok: boolean;
  error?: string;
  canvas: { width: number; height: number };
  atTime: number;
  videos: VideoLayoutFact[];
  /** Present when a selector was passed. */
  elements?: ElementLayoutFact[];
  /** Plain-English findings an agent (or the revise LLM) can act on. */
  warnings: string[];
}

/** Read a component source, searching project -> tenant -> library dirs. */
async function loadSource(type: string, tenantId: string, projectId: string): Promise<string | null> {
  const dirs = [
    path.join(config.dataDir, tenantId, "projects", projectId, "components"),
    path.join(config.dataDir, tenantId, "components"),
    config.componentLibDir,
  ];
  const filename = `${type}.component.html`;
  for (const dir of dirs) {
    const found = await findFile(dir, filename);
    if (found != null) return found;
  }
  return null;
}

async function findFile(dir: string, filename: string): Promise<string | null> {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name === filename) return fs.readFile(full, "utf-8");
    if (e.isDirectory()) {
      const r = await findFile(full, filename);
      if (r != null) return r;
    }
  }
  return null;
}

/** Pixel dimensions of a media file from ffmpeg's stream line (no ffprobe dependency). */
export async function probeVideoDimensions(filePath: string): Promise<{ w: number; h: number } | null> {
  const stderr: string = await new Promise((resolve) => {
    const ff = spawn("ffmpeg", ["-i", filePath]);
    const errs: Buffer[] = [];
    ff.stderr.on("data", (c) => errs.push(c));
    ff.on("error", () => resolve(""));
    ff.on("close", () => resolve(Buffer.concat(errs).toString()));
  });
  const m = stderr.match(/Stream[^\n]*Video[^\n]*?(\d{2,5})x(\d{2,5})/);
  if (!m) return null;
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

/** object-position computed style ("50% 0%") -> alignment fractions. */
function parseObjectPosition(op: string): { fx: number; fy: number } {
  const parts = (op || "50% 50%").trim().split(/\s+/);
  const frac = (v: string, axis: "x" | "y"): number => {
    if (v.endsWith("%")) return Math.max(0, Math.min(1, parseFloat(v) / 100));
    if (v === "left" || (axis === "y" && v === "top")) return 0;
    if (v === "right" || (axis === "y" && v === "bottom")) return 1;
    if (v === "top") return 0;
    if (v === "bottom") return 1;
    return 0.5;
  };
  return { fx: frac(parts[0] || "50%", "x"), fy: frac(parts[1] || parts[0] || "50%", "y") };
}

function cropMath(
  box: BoxRect,
  intrinsic: { w: number; h: number },
  objectFit: string,
  objectPosition: string,
): VideoLayoutFact["crop"] | undefined {
  if (box.w <= 0 || box.h <= 0 || intrinsic.w <= 0 || intrinsic.h <= 0) return undefined;
  const { fx, fy } = parseObjectPosition(objectPosition);
  if (objectFit === "cover" || objectFit === "" || objectFit === "none") {
    const scale = objectFit === "none" ? 1 : Math.max(box.w / intrinsic.w, box.h / intrinsic.h);
    const overW = Math.round(intrinsic.w * scale - box.w);
    const overH = Math.round(intrinsic.h * scale - box.h);
    return {
      left: Math.round(overW * fx),
      right: Math.round(overW * (1 - fx)),
      top: Math.round(overH * fy),
      bottom: Math.round(overH * (1 - fy)),
      mode: "cropped",
    };
  }
  if (objectFit === "contain") {
    const scale = Math.min(box.w / intrinsic.w, box.h / intrinsic.h);
    const gapW = Math.round(box.w - intrinsic.w * scale);
    const gapH = Math.round(box.h - intrinsic.h * scale);
    return {
      left: Math.round(gapW * fx), right: Math.round(gapW * (1 - fx)),
      top: Math.round(gapH * fy), bottom: Math.round(gapH * (1 - fy)),
      mode: "gutters",
    };
  }
  return undefined; // fill / scale-down: no crop story worth telling
}

function buildWarnings(inspection: LayoutInspection): string[] {
  const out: string[] = [];
  for (const v of inspection.videos) {
    if (!v.intrinsic || !v.crop) continue;
    if (v.crop.mode === "cropped") {
      const edges = (["top", "bottom", "left", "right"] as const)
        .filter((e) => (v.crop as any)[e] > 8)
        .map((e) => `${(v.crop as any)[e]}px at the ${e}`);
      if (edges.length) {
        const ar = (v.intrinsic.w / v.intrinsic.h).toFixed(3);
        out.push(
          `<video ${v.descriptor}> (${v.intrinsic.w}x${v.intrinsic.h}) fills a ${v.box.w}x${v.box.h} box with object-fit:${v.objectFit || "cover"} (object-position ${v.objectPosition}) -- the recording is CROPPED ${edges.join(" and ")}; that content is invisible. Real fixes: change object-position (moves which edge is cropped), switch to object-fit:contain (adds gutters instead), or resize the container toward aspect-ratio ${ar}. Nudging heights by a few px will NOT fix this.`,
        );
      }
    } else if (v.crop.mode === "gutters") {
      const edges = (["top", "bottom", "left", "right"] as const)
        .filter((e) => (v.crop as any)[e] > 8)
        .map((e) => `${(v.crop as any)[e]}px ${e}`);
      if (edges.length) out.push(`<video ${v.descriptor}> letterboxes with empty gutters (${edges.join(", ")}) from object-fit:contain in a box that doesn't match its aspect.`);
    }
  }
  for (const el of inspection.elements || []) {
    if (el.position === "absolute" || el.position === "fixed") {
      out.push(`${el.descriptor} is position:${el.position} -- it ignores its parent's padding; size it via inset/width/height or move the parent's bounds instead.`);
    }
    const clipper = el.containers.find((c) => /hidden|clip|auto|scroll/.test(c.overflow));
    if (clipper) {
      const below = el.box.y + el.box.h - (clipper.box.y + clipper.box.h);
      const right = el.box.x + el.box.w - (clipper.box.x + clipper.box.w);
      if (below > 4) out.push(`${el.descriptor} extends ${Math.round(below)}px below its clipping ancestor ${clipper.descriptor} -- that part is cut off.`);
      if (right > 4) out.push(`${el.descriptor} extends ${Math.round(right)}px past the right edge of ${clipper.descriptor} -- that part is cut off.`);
    }
  }
  return out;
}

export async function inspectSceneLayout(opts: {
  tenantId: string;
  projectId: string;
  sceneId: string;
  /** Optional CSS selector to measure specific element(s) too. */
  selector?: string;
  /** Timeline second to measure at (default: mid-scene, where layout has settled). */
  atTime?: number;
}): Promise<LayoutInspection> {
  const empty = (error: string): LayoutInspection => ({
    ok: false, error, canvas: { width: 0, height: 0 }, atTime: 0, videos: [], warnings: [],
  });

  const project = await loadProject(opts.tenantId, opts.projectId);
  if (!project) return empty(`Project ${opts.projectId} not found`);
  const scene = (project.scenes as any[]).find((s) => s.id === opts.sceneId);
  if (!scene) return empty(`Scene ${opts.sceneId} not found`);

  const sources: { type: string; source: string }[] = [];
  for (const c of scene.components as any[]) {
    if (sources.some((s) => s.type === c.type)) continue;
    const src = await loadSource(c.type, opts.tenantId, opts.projectId);
    if (src != null) sources.push({ type: c.type, source: src });
  }
  if (!sources.length) return empty("No component sources found for scene");

  const canvas = project.canvas || { width: 1920, height: 1080 };
  const dur = scene.duration_seconds || 5;
  const atTime = opts.atTime != null ? opts.atTime : Math.min(dur * 0.5, dur - 0.1);

  let html: string;
  try {
    html = await assembleSceneAuto({
      scene, components: sources, brandKit: project.brand_kit, canvas,
      gsapDir: config.gsapDir, componentLibDir: config.componentLibDir, preview: false,
    });
  } catch (e: any) {
    return empty(`Assembly failed: ${e?.message || e}`);
  }

  const tmpHtml = path.join(os.tmpdir(), `mp_inspect_${crypto.randomBytes(5).toString("hex")}.html`);
  await fs.writeFile(tmpHtml, html, "utf-8");

  let browser;
  try {
    browser = await chromium.launch({
      args: [
        "--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox",
        "--allow-file-access-from-files", "--mute-audio", "--no-first-run",
      ],
      ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
    });
    const page = await browser.newPage();
    await page.setViewportSize({ width: canvas.width, height: canvas.height });
    await page.goto(`file://${path.resolve(tmpHtml)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    try {
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    } catch {
      // measure anyway -- static layout is usually settled even if a script hangs
    }
    await page.evaluate((t: number) => {
      try { (window as any).__MP_TIMELINE.time(t); } catch { /* best-effort */ }
    }, atTime);

    const raw = await page.evaluate((sel: string | null) => {
      const desc = (el: Element) => {
        const cls = typeof (el as any).className === "string" ? (el as any).className.trim() : "";
        return el.tagName.toLowerCase() + (cls ? "." + cls.split(/\s+/).slice(0, 3).join(".") : "");
      };
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const chain = (el: Element) => {
        const outC: any[] = [];
        let p = el.parentElement, depth = 0;
        while (p && p !== document.body && depth++ < 8) {
          const cs = getComputedStyle(p);
          outC.push({ descriptor: desc(p), box: box(p), overflow: cs.overflow, borderRadius: cs.borderRadius, position: cs.position });
          p = p.parentElement;
        }
        return outC;
      };
      const videos = Array.from(document.querySelectorAll("video"))
        .filter((v) => v.id !== "__mp_speaker_base")
        .map((v) => {
          const cs = getComputedStyle(v);
          return {
            descriptor: desc(v), src: v.getAttribute("src") || "",
            box: box(v), objectFit: cs.objectFit, objectPosition: cs.objectPosition,
            position: cs.position, containers: chain(v),
          };
        });
      let elements: any = undefined;
      if (sel) {
        try {
          elements = Array.from(document.querySelectorAll(sel)).slice(0, 5).map((el) => {
            const cs = getComputedStyle(el);
            return { descriptor: desc(el), box: box(el), position: cs.position, overflow: cs.overflow, display: cs.display, containers: chain(el) };
          });
        } catch (e: any) {
          elements = [];
        }
      }
      return { videos, elements };
    }, opts.selector || null);

    const videos: VideoLayoutFact[] = [];
    for (const v of raw.videos as any[]) {
      let intrinsic: { w: number; h: number } | null = null;
      if (v.src && /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(v.src)) {
        try {
          const p = resolveVideoPath(v.src);
          await fs.access(p);
          intrinsic = await probeVideoDimensions(p);
        } catch { /* unreadable media -> no intrinsic facts */ }
      }
      const fact: VideoLayoutFact = {
        descriptor: v.descriptor, src: v.src, box: v.box,
        objectFit: v.objectFit, objectPosition: v.objectPosition,
        intrinsic, containers: v.containers,
      };
      if (intrinsic) fact.crop = cropMath(v.box, intrinsic, v.objectFit, v.objectPosition);
      videos.push(fact);
    }

    const inspection: LayoutInspection = {
      ok: true,
      canvas: { width: canvas.width, height: canvas.height },
      atTime,
      videos,
      elements: raw.elements,
      warnings: [],
    };
    inspection.warnings = buildWarnings(inspection);
    return inspection;
  } catch (e: any) {
    return empty(`Inspection failed: ${e?.message || e}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await fs.unlink(tmpHtml).catch(() => {});
  }
}

/** Compact single-string rendering for prompt injection. */
export function formatInspectionForPrompt(ins: LayoutInspection): string {
  if (!ins.ok) return "";
  const lines: string[] = [];
  lines.push(`Canvas ${ins.canvas.width}x${ins.canvas.height}, measured at t=${ins.atTime.toFixed(1)}s.`);
  for (const v of ins.videos) {
    const parent = v.containers[0];
    lines.push(
      `- <video ${v.descriptor}>${v.intrinsic ? ` source ${v.intrinsic.w}x${v.intrinsic.h}` : ""} renders at ${v.box.w}x${v.box.h}` +
      `${parent ? ` inside ${parent.descriptor} (overflow:${parent.overflow})` : ""}, object-fit:${v.objectFit}, object-position ${v.objectPosition}.`,
    );
  }
  for (const el of ins.elements || []) {
    lines.push(`- selected ${el.descriptor}: box ${el.box.w}x${el.box.h} at (${el.box.x},${el.box.y}), position:${el.position}.`);
  }
  for (const w of ins.warnings) lines.push(`! ${w}`);
  return lines.join("\n");
}
