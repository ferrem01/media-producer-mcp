/**
 * A film's POSTER: the still that makes a library card recognisable.
 *
 * Nobody recognises a film by its id, and most of these films have never been
 * rendered. So the poster comes from whatever the film already is: a frame of
 * the render when there is one, otherwise the first scene photographed the
 * way the storyboard cards are. It is cached beside the output and only
 * re-made when the project itself has moved on.
 *
 * Posters are built ON DEMAND, one per request, behind a small gate: a library
 * of 251 films asking at once must not launch 251 browsers.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { projectOutputDir, projectJsonPath } from "../persistence/paths.js";
import { loadProject } from "../persistence/project.js";
import { assembleScene } from "./scene-assembler.js";
import { captureSingleFrame } from "./capture.js";
import { loadComponentSources } from "./render.js";
import { config } from "../config.js";
import type { Project } from "./types.js";

const execFileAsync = promisify(execFile);

const POSTER_W = 640;
const inFlight = new Map<string, Promise<string | null>>();

/** At most two posters being MADE at once: the rest wait rather than pile
 *  browsers onto the box that is also rendering films. */
let active = 0;
const waiting: Array<() => void> = [];
async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => waiting.push(r));
  active++;
  try { return await fn(); }
  finally { active--; const next = waiting.shift(); if (next) next(); }
}

async function mtimeOf(p: string): Promise<number> {
  try { return (await fs.stat(p)).mtimeMs; } catch { return 0; }
}

async function fromRender(project: Project, mp4: string, out: string): Promise<boolean> {
  const total = (project.scenes || []).reduce((s, x) => s + (Number(x.duration_seconds) || 0), 0);
  // A second in, or a third of the way through a very short film: frame 0 of a
  // film is usually its fade-up, which is black.
  const at = Math.max(0, Math.min(1.0, total / 3));
  for (const seek of [at, 0]) {
    try {
      await execFileAsync("ffmpeg", [
        "-y", "-ss", String(seek), "-i", mp4,
        "-frames:v", "1", "-update", "1",
        "-vf", `scale=${POSTER_W}:-2`, "-q:v", "4", out,
      ], { timeout: 20_000 });
      if ((await mtimeOf(out)) > 0) return true;
    } catch { /* try the next seek */ }
  }
  return false;
}

async function fromScene(project: Project, out: string, index: number): Promise<boolean> {
  const scene = (project.scenes || [])[index];
  if (!scene || !(scene.components || []).length) return false;
  const canvas = (project.canvas || { width: 1920, height: 1080 }) as any;
  const dir = await fs.mkdtemp(path.join(path.dirname(out), ".poster-"));
  try {
    const sources = await loadComponentSources(project, config.componentLibDir);
    const html = await assembleScene({
      scene, components: sources,
      brandKit: (project as any).brand_kit || { colors: {}, fonts: [] },
      canvas, gsapDir: config.gsapDir,
    } as any);
    const htmlPath = path.join(dir, "scene.html");
    await fs.writeFile(htmlPath, html);
    // Past the entrance, before the exit: the frame the scene is ABOUT.
    const dur = Number(scene.duration_seconds) || 3;
    // The scene has to be photographed at its real size or the layout is not
    // the layout; the POSTER is then scaled down to card size. Shipping the
    // full frame meant a shelf of 251 films handing the browser 251 full-HD
    // jpegs (28 KB each against 6 KB).
    const full = path.join(dir, "full.jpg");
    await captureSingleFrame({
      htmlPath, outputPath: full,
      width: canvas.width, height: canvas.height,
      format: "jpeg", quality: 82,
      atTime: Math.min(dur * 0.6, Math.max(0.5, dur * 0.35)),
    });
    if ((await mtimeOf(full)) === 0) return false;
    try {
      await execFileAsync("ffmpeg", [
        "-y", "-i", full, "-vf", `scale=${POSTER_W}:-2`, "-q:v", "4", out,
      ], { timeout: 20_000 });
    } catch {
      await fs.copyFile(full, out);   // no ffmpeg: a big poster beats none
    }
    return (await mtimeOf(out)) > 0;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The poster for a film, made if it does not exist yet. Returns the file path,
 * or null when the film has nothing to photograph.
 */
/**
 * The poster for a film, or for ONE SCENE of it.
 *
 * The scene stills are the same pictures Studio shows down its left side, and
 * a card that can page through them says what a film IS in a way one frame
 * cannot. They are captured per scene, on demand, and cached beside the film.
 */
export async function ensureProjectPoster(
  tenantId: string,
  projectId: string,
  sceneIndex?: number,
): Promise<string | null> {
  const key = `${tenantId}/${projectId}/${sceneIndex ?? "cover"}`;
  const running = inFlight.get(key);
  if (running) return running;

  const job = (async () => {
    const outDir = projectOutputDir(tenantId, projectId);
    const out = path.join(outDir, sceneIndex == null ? "poster.jpg" : `poster_s${sceneIndex}.jpg`);
    const projectMtime = await mtimeOf(projectJsonPath(tenantId, projectId));
    if (projectMtime === 0) return null;
    const posterMtime = await mtimeOf(out);
    if (posterMtime >= projectMtime) return out;   // still current

    const project = await loadProject(tenantId, projectId);
    if (!project) return null;
    await fs.mkdir(outDir, { recursive: true });

    // The COVER may come from the render (the film as it actually plays); a
    // named scene is always photographed, so paging is the same pictures
    // Studio shows and not a guess at where that scene sits in the mp4.
    if (sceneIndex == null) {
      const mp4 = path.join(outDir, "output.mp4");
      if ((await mtimeOf(mp4)) > 0 && await gate(() => fromRender(project, mp4, out))) return out;
    }
    try {
      if (await gate(() => fromScene(project, out, sceneIndex ?? 0))) return out;
    } catch (e: any) {
      console.warn(`poster: ${projectId} scene ${sceneIndex ?? 0} capture failed (${e?.message})`);
    }
    return null;
  })().finally(() => { inFlight.delete(key); });

  inFlight.set(key, job);
  return job;
}
