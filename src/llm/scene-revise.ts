/**
 * Scene revise — Studio's direct-manipulation revise primitive.
 *
 * Given a project + scene + a natural-language instruction (optionally scoped to a
 * clicked element), surgically patch the scene's codegen source via reviseComponent,
 * version the prior source, re-assemble the scene, and run the fast deterministic
 * gates (runtime + legibility). Returns the new preview HTML + any defects.
 *
 * Both `POST /api/revise` and the `revise` MCP tool call this. The heavier full
 * "regenerate this scene" path stays in runSceneRevisionPipeline (generate tool).
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadProject } from "../persistence/project.js";
import { projectDir } from "../persistence/paths.js";
import { reviseComponent } from "./component-revise.js";
import { assembleSceneAuto } from "../core/scene-assembler.js";
import { validateSceneRuntime } from "../core/capture.js";
import { inspectSceneLayout, formatInspectionForPrompt } from "../core/layout-inspect.js";
import { measureTextContrast } from "../core/text-contrast.js";
import { config } from "../config.js";
import type { LLMConfig } from "./client.js";

const CODEGEN_PREFIXES = ["scene_", "freeform_", "custom_", "template_"];

/** Selected-element context (absent = whole-scene revise). */
export interface ReviseElement {
  tagName?: string;
  classList?: string[];
  text?: string;
  outerHTMLSnippet?: string;
  compType?: string;
}

export interface ReviseSceneOpts {
  tenantId: string;
  projectId: string;
  sceneId: string;
  instruction: string;
  element?: ReviseElement;
  llmConfig: LLMConfig;
  /** Skip the fast gates (faster; default false). */
  skipGates?: boolean;
}

export interface ReviseSceneResult {
  ok: boolean;
  error?: string;
  blocksApplied?: number;
  fullRewrite?: boolean;
  componentType?: string;
  revisionId?: string;
  /** Preview HTML (http asset URLs) for hot-swapping into the Studio iframe. */
  sceneHtml?: string;
  /** Fast-gate findings (empty = clean). */
  defects?: { type: string; detail: string }[];
  /** Post-apply verification: CSS the patch declared that the browser did NOT
   *  honor (clamped/overridden/selector matched nothing). Empty = geometry took. */
  layout_warnings?: string[];
  /** Undo only: whether a prior version was restored, and how many remain. */
  restored?: boolean;
  remaining?: number;
}

/** Read a component source, searching project → tenant → library dirs. */
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
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
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

function buildInstructions(opts: ReviseSceneOpts, layoutFacts?: string): string {
  const inst = opts.instruction.trim();
  // Measured geometry turns symptom-level asks ("the video runs over the
  // bottom") into cause-level fixes (a 110px object-fit:cover crop) -- the
  // reviser must not patch a plausible-looking property that can't move
  // anything (padding on the parent of an absolutely-positioned child).
  const facts = layoutFacts
    ? `\n\nMEASURED LAYOUT FACTS (from a real render of the CURRENT scene -- trust these numbers over intuition; fix the stated cause, not the phrasing of the symptom):\n${layoutFacts}\n`
    : "";
  if (!opts.element) {
    return `Apply this change to the WHOLE scene: ${inst}\nChange only what's needed to achieve it; preserve everything else.${facts}`;
  }
  const e = opts.element;
  const desc = [
    e.compType ? `component type "${e.compType}"` : null,
    e.tagName ? `<${e.tagName}>` : null,
    e.classList?.length ? `class="${e.classList.join(" ")}"` : null,
    e.text ? `containing the text "${e.text.slice(0, 80)}"` : null,
  ].filter(Boolean).join(", ");
  const snippet = e.outerHTMLSnippet ? `\nIts current markup (for reference, locate it exactly):\n${e.outerHTMLSnippet.slice(0, 600)}` : "";
  return `The user selected this specific element in the scene: ${desc}.${snippet}\n` +
    `Apply this change to THAT element only (and the minimum needed to achieve it): ${inst}\n` +
    `Do NOT change unrelated elements, other text, or other colors.${facts}`;
}

/** Run the fast deterministic gates (runtime + legibility) on assembled HTML. */
async function runFastGates(
  scene: any, sources: { type: string; source: string }[], project: any, revisionId: string,
): Promise<{ type: string; detail: string }[]> {
  const defects: { type: string; detail: string }[] = [];
  const tmpDir = path.join(os.tmpdir(), `revise_gate_${revisionId.replace(/[^a-z0-9]/gi, "_")}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const htmlPath = path.join(tmpDir, "scene.html");
  try {
    // file:// asset resolution so the gates can load assets locally
    const html = await assembleSceneAuto({
      scene, components: sources, brandKit: project.brand_kit, canvas: project.canvas,
      gsapDir: config.gsapDir, componentLibDir: config.componentLibDir, preview: false,
    });
    await fs.writeFile(htmlPath, html);
    const dur = scene.duration_seconds || 5;

    const runtime = await validateSceneRuntime({
      htmlPath, width: project.canvas.width, height: project.canvas.height, duration: dur,
    });
    if (!runtime.ok) defects.push({ type: "runtime", detail: `Scene throws at ${(runtime.atTime ?? 0).toFixed(1)}s: ${runtime.error}` });

    const isVideoOnly = scene.components.length === 1 && scene.components[0].type === "video";
    if (!isVideoOnly) {
      const contrast = await measureTextContrast({
        htmlPath, width: project.canvas.width, height: project.canvas.height,
        atTimes: [dur * 0.35, dur * 0.6, dur * 0.85],
      });
      for (const d of contrast) {
        defects.push({
          type: "illegible",
          detail: d.reason === "no-backing"
            ? `Text "${d.text}" over video has no legibility backing`
            : `Text "${d.text}" low contrast ${d.contrast}:1 (needs ${d.threshold}:1)`,
        });
      }
    }
  } catch (e: any) {
    // gates are best-effort — never block the revise on a gate infra failure
    console.warn(`  [revise] fast gates skipped: ${e?.message || e}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
  return defects;
}

// ── Post-apply geometry verification ──
// A revise can "succeed" while the browser quietly refuses the change: a
// global reset clamps the width, a later rule wins the cascade, a selector
// typo matches nothing. The patch DECLARED it; nothing checked it RENDERED.
// So: diff the geometry-critical declarations the patch changed, boot the
// revised scene once, and compare declared vs rendered. Runs even with
// skipGates -- it verifies the revise itself, not scene quality.

const GEO_PROPS = new Set([
  "width", "height", "left", "top", "right", "bottom",
  "max-width", "max-height", "aspect-ratio", "border-radius",
  "object-fit", "object-position",
]);

interface GeoCheck { selector: string; prop: string; value: string }

export function extractGeoDecls(source: string): Map<string, Record<string, string>> {
  const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const css = (styleMatch?.[1] || "").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map<string, Record<string, string>>();
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css))) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    const decls: Record<string, string> = {};
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      const prop = d.slice(0, i).trim().toLowerCase();
      const value = d.slice(i + 1).trim().replace(/!important\s*$/i, "").trim();
      if (GEO_PROPS.has(prop) && value) decls[prop] = value;
    }
    if (Object.keys(decls).length) out.set(selector, { ...(out.get(selector) || {}), ...decls });
  }
  return out;
}

/** Geometry declarations present/changed in the new source vs the old one. */
export function changedGeoChecks(oldSource: string, newSource: string): GeoCheck[] {
  const before = extractGeoDecls(oldSource);
  const after = extractGeoDecls(newSource);
  const checks: GeoCheck[] = [];
  for (const [selector, decls] of after) {
    if (selector.includes(":")) continue; // pseudo-classes/-elements: not queryable as-is
    const prev = before.get(selector) || {};
    for (const [prop, value] of Object.entries(decls)) {
      if (prev[prop] === value) continue;
      if (/var\(|calc\(|auto|inherit|initial|unset/i.test(value)) continue; // not comparable
      checks.push({ selector, prop, value });
    }
  }
  return checks.slice(0, 24);
}

/** Boot the revised scene and compare each declared value with the rendered one. */
export async function verifyAppliedGeometry(
  scene: any, sources: { type: string; source: string }[], project: any,
  revisionId: string, checks: GeoCheck[],
): Promise<string[]> {
  if (!checks.length) return [];
  const { chromium } = await import("playwright");
  const canvas = project.canvas || { width: 1920, height: 1080 };
  const tmpDir = path.join(os.tmpdir(), `revise_verify_${revisionId.replace(/[^a-z0-9]/gi, "_")}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const htmlPath = path.join(tmpDir, "scene.html");
  const warnings: string[] = [];
  let browser;
  try {
    const html = await assembleSceneAuto({
      scene, components: sources, brandKit: project.brand_kit, canvas,
      gsapDir: config.gsapDir, componentLibDir: config.componentLibDir, preview: false,
    });
    await fs.writeFile(htmlPath, html);
    browser = await chromium.launch({
      args: [
        "--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox",
        "--allow-file-access-from-files", "--mute-audio", "--no-first-run",
      ],
      ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
    });
    const page = await browser.newPage();
    await page.setViewportSize({ width: canvas.width, height: canvas.height });
    await page.goto(`file://${path.resolve(htmlPath)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 12000 });
    } catch { /* verify against whatever settled */ }

    const results = await page.evaluate((cks: GeoCheck[]) => {
      return cks.map((c) => {
        let el: Element | null = null;
        try { el = document.querySelector(c.selector); } catch { return { c, status: "bad-selector" }; }
        if (!el) return { c, status: "not-found" };
        const cs = getComputedStyle(el);
        const camel = c.prop.replace(/-([a-z])/g, (_s, g) => g.toUpperCase());
        const rect = el.getBoundingClientRect();
        const p = el.parentElement;
        const pbox = p ? p.getBoundingClientRect() : rect;
        return {
          c, status: "ok",
          computed: (cs as any)[camel] ?? cs.getPropertyValue(c.prop),
          rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
          pbox: { x: pbox.left, y: pbox.top, w: pbox.width, h: pbox.height },
          maxWidth: cs.maxWidth, maxHeight: cs.maxHeight,
        };
      });
    }, checks);

    for (const r of results as any[]) {
      const { selector, prop, value } = r.c;
      const decl = `${selector} { ${prop}: ${value} }`;
      if (r.status === "bad-selector") continue;
      if (r.status === "not-found") {
        warnings.push(`${decl} -- selector matches NO element in the rendered scene (typo, or the element is created later by script).`);
        continue;
      }
      const pctMatch = value.match(/^(-?\d+(?:\.\d+)?)%$/);
      if (pctMatch && ["width", "height", "left", "top", "right", "bottom"].includes(prop)) {
        const pct = Number(pctMatch[1]) / 100;
        const horizontal = prop === "width" || prop === "left" || prop === "right";
        const base = horizontal ? r.pbox.w : r.pbox.h;
        const expected = pct * base;
        const actual = prop === "width" ? r.rect.w
          : prop === "height" ? r.rect.h
          : prop === "left" ? r.rect.x - r.pbox.x
          : prop === "top" ? r.rect.y - r.pbox.y
          : prop === "right" ? (r.pbox.x + r.pbox.w) - (r.rect.x + r.rect.w)
          : (r.pbox.y + r.pbox.h) - (r.rect.y + r.rect.h);
        if (Math.abs(expected - actual) > 2.5) {
          let culprit = "";
          if (prop === "width" && r.maxWidth !== "none") culprit = ` -- clamped by max-width: ${r.maxWidth} (likely the global img,video reset; add max-width: none)`;
          if (prop === "height" && r.maxHeight !== "none") culprit = ` -- clamped by max-height: ${r.maxHeight}`;
          warnings.push(`${decl} did NOT take: rendered ${Math.round(actual)}px, the declaration implies ${Math.round(expected)}px${culprit}.`);
        }
        continue;
      }
      const pxMatch = value.match(/^(-?\d+(?:\.\d+)?)px$/);
      const computed = String(r.computed || "").trim();
      if (pxMatch) {
        const computedPx = parseFloat(computed);
        if (Number.isFinite(computedPx) && Math.abs(computedPx - Number(pxMatch[1])) > 1.5) {
          warnings.push(`${decl} did NOT take: computed value is ${computed} (another rule wins the cascade).`);
        }
        continue;
      }
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
      if (computed && norm(computed) !== norm(value) && !computed.includes("(")) {
        warnings.push(`${decl} did NOT take: computed value is "${computed}" (another rule wins the cascade).`);
      }
    }
  } catch (e: any) {
    console.warn(`  [revise] geometry verification skipped: ${e?.message || e}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
  return warnings;
}

export async function reviseScene(opts: ReviseSceneOpts): Promise<ReviseSceneResult> {
  if (!opts.instruction?.trim()) return { ok: false, error: "instruction is required" };

  const project = await loadProject(opts.tenantId, opts.projectId);
  if (!project) return { ok: false, error: `Project ${opts.projectId} not found` };
  const scene = project.scenes.find((s: any) => s.id === opts.sceneId);
  if (!scene) return { ok: false, error: `Scene ${opts.sceneId} not found in project ${opts.projectId}` };

  const codegenComp = scene.components.find((c: any) => CODEGEN_PREFIXES.some((p) => c.type.startsWith(p)));
  if (!codegenComp) return { ok: false, error: `Scene ${opts.sceneId} has no codegen component to revise` };
  const type = codegenComp.type;

  const existingSource = await loadSource(type, opts.tenantId, opts.projectId);
  if (existingSource == null) return { ok: false, error: `Source for component "${type}" not found` };

  // Measure the CURRENT scene so the reviser sees real geometry, not just
  // source code. Best-effort: a broken/slow scene must not block the revise.
  let layoutFacts: string | undefined;
  try {
    const selector = opts.element?.classList?.length ? "." + opts.element.classList[0] : undefined;
    const inspection = await inspectSceneLayout({
      tenantId: opts.tenantId, projectId: opts.projectId, sceneId: opts.sceneId, selector,
    });
    if (inspection.ok) layoutFacts = formatInspectionForPrompt(inspection) || undefined;
  } catch (e: any) {
    console.warn(`  [revise] layout inspection skipped: ${e?.message || e}`);
  }

  const revised = await reviseComponent({
    existingSource,
    instructions: buildInstructions(opts, layoutFacts),
    componentName: type,
    llmConfig: opts.llmConfig,
    brandKit: project.brand_kit,
    canvas: project.canvas,
  });

  // Static JS syntax gate: a SEARCH/REPLACE patch can splice a statement
  // mid-expression and produce a script no browser will parse -- which then
  // ships (the fast gates are best-effort) and kills the RENDER with a
  // ready-timeout. Parse without executing; refuse the revise rather than
  // overwrite a working scene with one that cannot run.
  const patchedScript = revised.source.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (patchedScript) {
    try {
      new Function(patchedScript[1]);
    } catch (e: any) {
      return { ok: false, error: `Revise produced a script with a JavaScript syntax error (${e.message}) -- keeping the existing scene source.` };
    }
  }

  // Version the prior source, then write the new one.
  const compDir = path.join(projectDir(opts.tenantId, opts.projectId), "components");
  const revisionId = `${type}.${Date.now()}`;
  const revDir = path.join(compDir, "_revisions");
  await fs.mkdir(revDir, { recursive: true });
  await fs.writeFile(path.join(revDir, `${revisionId}.component.html`), existingSource);
  await fs.mkdir(compDir, { recursive: true });
  await fs.writeFile(path.join(compDir, `${type}.component.html`), revised.source);

  // Gather sources (with the revised codegen source) for assembly + gates.
  const sources: { type: string; source: string }[] = [];
  for (const c of scene.components as any[]) {
    if (sources.some((s) => s.type === c.type)) continue;
    const src = c.type === type ? revised.source : await loadSource(c.type, opts.tenantId, opts.projectId);
    if (src != null) sources.push({ type: c.type, source: src });
  }

  let sceneHtml: string | undefined;
  try {
    sceneHtml = await assembleSceneAuto({
      scene, components: sources, brandKit: project.brand_kit, canvas: project.canvas,
      gsapDir: config.gsapDir, componentLibDir: config.componentLibDir, preview: true,
    });
  } catch (e: any) {
    console.warn(`  [revise] preview assembly failed: ${e?.message || e}`);
  }

  const defects = opts.skipGates ? [] : await runFastGates(scene, sources, project, revisionId);

  // Verify the patch's own geometry landed (runs even with skipGates -- this
  // checks the revise, not the scene). Best-effort: never blocks the result.
  let layoutWarnings: string[] = [];
  try {
    const checks = changedGeoChecks(existingSource, revised.source);
    if (checks.length) {
      layoutWarnings = await verifyAppliedGeometry(scene, sources, project, revisionId, checks);
      for (const w of layoutWarnings) console.warn(`  [revise] geometry: ${w}`);
    }
  } catch (e: any) {
    console.warn(`  [revise] geometry verification failed: ${e?.message || e}`);
  }

  return {
    ok: true,
    blocksApplied: revised.blocksApplied,
    fullRewrite: revised.fullRewrite,
    componentType: type,
    revisionId,
    sceneHtml,
    defects,
    layout_warnings: layoutWarnings,
  };
}

/** Undo: restore the most recent versioned source for a scene's codegen component. */
export async function undoScene(opts: { tenantId: string; projectId: string; sceneId: string }): Promise<ReviseSceneResult> {
  const project = await loadProject(opts.tenantId, opts.projectId);
  if (!project) return { ok: false, error: `Project ${opts.projectId} not found` };
  const scene = project.scenes.find((s: any) => s.id === opts.sceneId);
  if (!scene) return { ok: false, error: `Scene ${opts.sceneId} not found in project ${opts.projectId}` };
  const codegenComp = scene.components.find((c: any) => CODEGEN_PREFIXES.some((p) => c.type.startsWith(p)));
  if (!codegenComp) return { ok: false, error: `Scene ${opts.sceneId} has no codegen component` };
  const type = codegenComp.type;

  const compDir = path.join(projectDir(opts.tenantId, opts.projectId), "components");
  const revDir = path.join(compDir, "_revisions");
  const suffix = ".component.html";
  let files: string[] = [];
  try { files = await fs.readdir(revDir); } catch { /* none */ }
  const mine = files
    .filter((f) => f.startsWith(type + ".") && f.endsWith(suffix))
    .map((f) => ({ f, ts: parseInt(f.slice(type.length + 1, -suffix.length), 10) || 0 }))
    .sort((a, b) => b.ts - a.ts);

  if (mine.length === 0) return { ok: true, componentType: type, restored: false, remaining: 0 };

  const latest = mine[0];
  const restoredSource = await fs.readFile(path.join(revDir, latest.f), "utf-8");
  await fs.writeFile(path.join(compDir, `${type}${suffix}`), restoredSource);
  await fs.unlink(path.join(revDir, latest.f)).catch(() => {});

  // Re-assemble the restored scene for the iframe.
  const sources: { type: string; source: string }[] = [];
  for (const c of scene.components as any[]) {
    if (sources.some((s) => s.type === c.type)) continue;
    const src = await loadSource(c.type, opts.tenantId, opts.projectId);
    if (src != null) sources.push({ type: c.type, source: src });
  }
  let sceneHtml: string | undefined;
  try {
    sceneHtml = await assembleSceneAuto({
      scene, components: sources, brandKit: project.brand_kit, canvas: project.canvas,
      gsapDir: config.gsapDir, componentLibDir: config.componentLibDir, preview: true,
    });
  } catch (e: any) {
    console.warn(`  [undo] preview assembly failed: ${e?.message || e}`);
  }

  return { ok: true, componentType: type, restored: true, remaining: mine.length - 1, sceneHtml };
}
