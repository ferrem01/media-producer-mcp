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

function buildInstructions(opts: ReviseSceneOpts): string {
  const inst = opts.instruction.trim();
  if (!opts.element) {
    return `Apply this change to the WHOLE scene: ${inst}\nChange only what's needed to achieve it; preserve everything else.`;
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
    `Do NOT change unrelated elements, other text, or other colors.`;
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

  const revised = await reviseComponent({
    existingSource,
    instructions: buildInstructions(opts),
    componentName: type,
    llmConfig: opts.llmConfig,
    brandKit: project.brand_kit,
    canvas: project.canvas,
  });

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

  return {
    ok: true,
    blocksApplied: revised.blocksApplied,
    fullRewrite: revised.fullRewrite,
    componentType: type,
    revisionId,
    sceneHtml,
    defects,
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
