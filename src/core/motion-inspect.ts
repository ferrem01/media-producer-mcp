import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { assembleSceneAuto } from "./scene-assembler.js";
import { loadSource } from "./layout-inspect.js";
import { loadProject } from "../persistence/project.js";
import { config } from "../config.js";

/**
 * Scene MOTION inspection: drive the scene's timeline headless, sample every
 * component wrapper (and the camera rig) across scene time, and return both
 * the raw series and a plain-English summary per component.
 *
 * This is the "did the zoom actually fire?" tool. Agents ship motion bugs
 * because the only way to see motion was to render and watch the MP4; every
 * camera/choreography investigation in this repo started by hand-writing
 * exactly this probe. Exposed as MCP `get` target='motion'.
 */

export interface MotionSamplePoint {
  t: number;
  opacity: number;
  visible: boolean;
  rect: { x: number; y: number; w: number; h: number };
  /** Approximate scale factor from the wrapper's transform matrix (1 = none). */
  scale: number;
  /** Degrees of z-rotation from the same matrix (0 = upright). */
  rotation: number;
  /** Largest blur radius painted by the wrapper or its shallow content (px). */
  glow: number;
}

export interface ComponentMotion {
  id: string;
  type: string;
  /** Plain-English account of what this component measurably does. */
  summary: string;
  timeline: MotionSamplePoint[];
}

export interface CameraMotionSample {
  t: number;
  scale: number;
  translate: { x: number; y: number };
}

export interface MotionInspection {
  ok: boolean;
  error?: string;
  scene_id: string;
  duration: number;
  sampled_times: number[];
  components: ComponentMotion[];
  /** Present when the scene has a camera rig; scale 1 / translate 0 = wide. */
  camera?: CameraMotionSample[];
  warnings: string[];
}

/** 2D scale factor from a CSS matrix string ("matrix(a,b,c,d,e,f)" or matrix3d). */
function matrixScale(tr: string): number {
  if (!tr || tr === "none") return 1;
  const m = tr.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!m) return 1;
  const p = m[1].split(",").map((v) => parseFloat(v));
  const a = p[0], b = p[1];
  const s = Math.sqrt(a * a + b * b);
  return isFinite(s) && s > 0 ? Math.round(s * 1000) / 1000 : 1;
}

/** Degrees of z-rotation from a CSS matrix string (0 = upright). */
function matrixRotation(tr: string): number {
  if (!tr || tr === "none") return 0;
  const m = tr.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!m) return 0;
  const p = m[1].split(",").map((v) => parseFloat(v));
  const deg = Math.atan2(p[1], p[0]) * 180 / Math.PI;
  return isFinite(deg) ? Math.round(deg * 10) / 10 : 0;
}

function matrixTranslate(tr: string): { x: number; y: number } {
  const m = tr && tr.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!m) return { x: 0, y: 0 };
  const p = m[1].split(",").map((v) => parseFloat(v));
  const is3d = tr.startsWith("matrix3d");
  return { x: Math.round(p[is3d ? 12 : 4] || 0), y: Math.round(p[is3d ? 13 : 5] || 0) };
}

/** Derive the plain-English motion account from a sampled timeline. Pure --
 *  unit-tested directly. */
export function summarizeMotion(points: MotionSamplePoint[], sceneDuration: number): string {
  if (!points.length) return "no samples";
  const vis = points.filter((p) => p.visible && p.opacity > 0.05);
  if (!vis.length) return "NEVER VISIBLE in any sample -- check enter timing / opacity";
  const first = vis[0], last = vis[vis.length - 1];
  const parts: string[] = [];
  const firstIdx = points.indexOf(first);
  const lastIdx = points.indexOf(last);
  if (firstIdx > 0) parts.push(`enters ~${first.t.toFixed(1)}s`);
  else parts.push("visible from the start");
  if (lastIdx < points.length - 1) parts.push(`exits ~${points[lastIdx + 1].t.toFixed(1)}s`);
  // Movement: max center drift between consecutive visible samples.
  let maxDrift = 0;
  let totalDrift = 0;
  for (let i = 1; i < vis.length; i++) {
    const a = vis[i - 1].rect, b = vis[i].rect;
    const d = Math.hypot((b.x + b.w / 2) - (a.x + a.w / 2), (b.y + b.h / 2) - (a.y + a.h / 2));
    maxDrift = Math.max(maxDrift, d);
    totalDrift += d;
  }
  if (totalDrift > 8) parts.push(`moves (${Math.round(totalDrift)}px total path)`);
  const scales = vis.map((p) => p.scale);
  const sMin = Math.min(...scales), sMax = Math.max(...scales);
  if (sMax - sMin > 0.02) parts.push(`scales ${sMin.toFixed(2)}x -> ${sMax.toFixed(2)}x`);
  const oMin = Math.min(...vis.map((p) => p.opacity)), oMax = Math.max(...vis.map((p) => p.opacity));
  if (oMax - oMin > 0.1 && firstIdx === 0 && lastIdx === points.length - 1) parts.push("opacity animates");
  if (parts.length === 1 && firstIdx === 0 && lastIdx === points.length - 1 && totalDrift <= 8 && sMax - sMin <= 0.02) {
    return `static throughout (visible ${first.t.toFixed(1)}s-${last.t.toFixed(1)}s, no measurable wrapper motion)`;
  }
  return parts.join("; ");
}

/**
 * BANNED MOVES -- the negative half of the physics contract.
 *
 * `visual_system.motion` promises a physics, and cutout-physics gets that
 * promise kept positively (12fps stepping + ink boil, applied by the
 * assembler). `calm` and `punchy` have no positive machinery, so what makes
 * them real is this: the moves each one forbids are measured, and a film that
 * breaks its own contract says so out loud in the motion inspection.
 *
 * Pure and exported so the thresholds are unit-testable without a browser.
 *
 * NOT detected yet: morph (border-radius / clip-path animating between
 * shapes). It needs per-frame shape sampling the inspector does not do, and a
 * check that silently never fires is worse than an acknowledged gap.
 */
export function checkBannedMoves(
  motion: string | undefined,
  components: ComponentMotion[],
): string[] {
  if (motion !== "calm" && motion !== "cutout-physics") return [];
  const out: string[] = [];
  for (const c of components) {
    const vis = c.timeline.filter((p) => p.visible && p.opacity > 0.05);
    if (vis.length < 3) continue;

    // OVERSHOOT / ELASTIC: the wrapper passes its resting scale and comes
    // back. Both contracts ban it -- "settle, never bounce" for calm, and a
    // rigid paper cutout has no springiness to overshoot with.
    const rest = vis[vis.length - 1].scale;
    const peak = Math.max(...vis.map((p) => p.scale));
    if (peak - rest > 0.03 && peak - Math.min(...vis.map((p) => p.scale)) > 0.03) {
      out.push(
        `${c.type} (${c.id}): overshoots to ${peak.toFixed(2)}x and settles back to ${rest.toFixed(2)}x` +
        ` -- ${motion} forbids elastic/bounce entrances`);
    }

    // TILT: calm type stands upright. (cutout-physics WANTS rotation: a
    // sticker lands askew and stays askew -- that is the look, not a defect.)
    if (motion === "calm") {
      const tilt = Math.max(...vis.map((p) => Math.abs(p.rotation)));
      if (tilt > 1.5) {
        out.push(`${c.type} (${c.id}): tilts ${tilt.toFixed(1)}deg -- calm keeps elements upright`);
      }
    }

    // GLOW: flat printed pieces do not emit light. A hard offset shadow is
    // fine; a wide soft bloom is the tell.
    if (motion === "cutout-physics") {
      const glow = Math.max(...vis.map((p) => p.glow));
      if (glow > 24) {
        out.push(`${c.type} (${c.id}): paints a ${glow}px blur -- cutout-physics forbids glows (flat pieces, hard edges)`);
      }
    }
  }
  return out;
}

export async function inspectSceneMotion(opts: {
  tenantId: string;
  projectId: string;
  sceneId: string;
  /** Number of evenly spaced samples across the scene (default 13, max 40). */
  samples?: number;
}): Promise<MotionInspection> {
  const empty = (error: string): MotionInspection => ({
    ok: false, error, scene_id: opts.sceneId, duration: 0, sampled_times: [], components: [], warnings: [],
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

  const canvas = project.canvas || { width: 1920, height: 1080 };
  const dur = scene.duration_seconds || 5;
  const n = Math.max(3, Math.min(40, opts.samples || 13));
  const times: number[] = [];
  for (let i = 0; i < n; i++) times.push(Math.round((i * (dur - 0.05) / (n - 1)) * 100) / 100);

  let html: string;
  try {
    html = await assembleSceneAuto({
      scene, components: sources, brandKit: project.brand_kit, canvas,
      gsapDir: config.gsapDir, componentLibDir: config.componentLibDir, preview: false,
    });
  } catch (e: any) {
    return empty(`Assembly failed: ${e?.message || e}`);
  }

  const tmpHtml = path.join(os.tmpdir(), `mp_motion_${crypto.randomBytes(5).toString("hex")}.html`);
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
    } catch { /* sample anyway */ }

    const series: Array<{ t: number; comps: Record<string, any>; camera: { scale: number; tx: number; ty: number } | null }> = [];
    for (const t of times) {
      const snap = await page.evaluate((tt: number) => {
        try { (window as any).__MP_TIMELINE.pause(); (window as any).__MP_TIMELINE.time(tt); } catch { /* best-effort */ }
        const comps: Record<string, any> = {};
        document.querySelectorAll(".mp-component[data-cid]").forEach((el) => {
          const cs = getComputedStyle(el as HTMLElement);
          const r = (el as HTMLElement).getBoundingClientRect();
          // Entrances usually animate elements INSIDE the wrapper (the
          // wrapper itself stays opacity 1) -- so "is content visible" walks
          // the subtree carrying the cumulative opacity product and takes
          // the max over content-bearing nodes (text/svg/img/video/canvas).
          let effOpacity = 0;
          let contentExists = false; // ANY content node, visible or not
          const walk = (node: Element, product: number, depth: number) => {
            if (depth > 6) return;
            const ncs = getComputedStyle(node as HTMLElement);
            // A hidden branch still PROVES content exists (a gsap autoAlpha
            // entrance is visibility:hidden before its `at`); it just
            // contributes zero visible opacity.
            const hidden = ncs.display === "none" || ncs.visibility === "hidden";
            const p = hidden ? 0 : product * (parseFloat(ncs.opacity) || 0);
            const tag = node.tagName;
            const hasText = !!(node.childNodes && Array.from(node.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim()));
            if (hasText || tag === "svg" || tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "PATH") {
              contentExists = true;
              if (p > effOpacity) effOpacity = p;
            }
            let kids = 0;
            for (const child of Array.from(node.children)) {
              if (++kids > 24) break;
              walk(child, p, depth + 1);
            }
          };
          walk(el, 1, 0);
          if (!contentExists) effOpacity = parseFloat(cs.opacity) || 0; // truly content-less: fall back to the wrapper
          comps[(el as HTMLElement).getAttribute("data-cid") || ""] = {
            opacity: Math.round(effOpacity * 100) / 100,
            visible: cs.visibility !== "hidden" && cs.display !== "none" && r.width > 0 && r.height > 0 && effOpacity > 0.02,
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            transform: cs.transform,
            // Largest blur radius the wrapper or its shallow content paints
            // with -- the measurable signature of a "glow".
            glow: (function () {
              let px = 0;
              for (const node of [el as HTMLElement, ...Array.from(el.children).slice(0, 6)]) {
                const s2 = getComputedStyle(node as HTMLElement);
                for (const decl of [s2.boxShadow, s2.textShadow, s2.filter]) {
                  if (!decl || decl === "none") continue;
                  for (const m of decl.matchAll(/(-?[\d.]+)px/g)) px = Math.max(px, Math.abs(parseFloat(m[1])));
                }
              }
              return Math.round(px);
            })(),
          };
        });
        const rig = document.querySelector(".__mp_camera_rig") as HTMLElement | null;
        const camera = rig ? { transform: getComputedStyle(rig).transform } : null;
        return { comps, camera };
      }, t);
      series.push({
        t,
        comps: snap.comps,
        camera: snap.camera
          ? { scale: matrixScale((snap.camera as any).transform), ...(() => { const tr = matrixTranslate((snap.camera as any).transform); return { tx: tr.x, ty: tr.y }; })() }
          : null,
      });
    }

    const warnings: string[] = [];
    const components: ComponentMotion[] = (scene.components as any[]).map((c) => {
      const timeline: MotionSamplePoint[] = series.map((s) => {
        const m = s.comps[c.id] || { opacity: 0, visible: false, rect: { x: 0, y: 0, w: 0, h: 0 }, transform: "none" };
        return {
          t: s.t, opacity: Math.round(m.opacity * 100) / 100, visible: !!m.visible, rect: m.rect,
          scale: matrixScale(m.transform), rotation: matrixRotation(m.transform), glow: (m as any).glow || 0,
        };
      });
      const summary = summarizeMotion(timeline, dur);
      if (summary.startsWith("NEVER VISIBLE")) warnings.push(`${c.type} (${c.id}): never visible in any sample`);
      return { id: c.id, type: c.type, summary, timeline };
    });

    warnings.push(...checkBannedMoves((scene as any).motion_physics, components));

    let camera: CameraMotionSample[] | undefined;
    if (series.some((s) => s.camera)) {
      camera = series.map((s) => ({
        t: s.t,
        scale: s.camera ? s.camera.scale : 1,
        translate: { x: s.camera ? s.camera.tx : 0, y: s.camera ? s.camera.ty : 0 },
      }));
      const camScales = camera.map((c) => c.scale);
      const camMoves = Math.max(...camScales) - Math.min(...camScales) > 0.02
        || camera.some((c) => Math.abs(c.translate.x) > 4 || Math.abs(c.translate.y) > 4);
      if ((scene.camera_moves || []).length && !camMoves) {
        warnings.push(`scene authors ${(scene.camera_moves as any[]).length} camera move(s) but the rig never measurably moves -- check anchors/timing`);
      }
    }

    return { ok: true, scene_id: opts.sceneId, duration: dur, sampled_times: times, components, camera, warnings };
  } catch (e: any) {
    return empty(`Motion inspection failed: ${e?.message || e}`);
  } finally {
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { await fs.unlink(tmpHtml); } catch { /* ignore */ }
  }
}
