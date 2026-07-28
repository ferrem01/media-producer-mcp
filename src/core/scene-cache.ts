/**
 * Scene-level render cache.
 *
 * A full render re-captures EVERY scene frame-by-frame through Playwright
 * (~2 min per scene at 30fps/1080p), so a one-word copy edit costs the whole
 * film. This cache keys each scene's encoded mp4 by everything that can
 * change its pixels; unchanged scenes are reused and only edited scenes
 * re-render before the (cheap) transition + concat restitch.
 *
 * The key covers:
 *   - the scene JSON itself (components, data, positions, camera_moves,
 *     beats, duration, background, enter/exit)
 *   - canvas (width/height/fps -- preview and production cache separately)
 *   - the brand kit (colors/fonts/style feed the assembler)
 *   - project media edits (EDL swaps frames mid-scene)
 *   - the SOURCE of every component type the scene uses (incl. nested
 *     <component type="..."> refs) -- a component edit + deploy invalidates
 *   - every file in the shared runtime dir (atmosphere.js et al)
 *
 * NOT covered: changes to the capture/assembler/encoder code itself. Bump
 * CACHE_VERSION when scene-worker/capture/scene-assembler/encode change
 * rendered output.
 *
 * Disable entirely with MP_SCENE_CACHE=0.
 */
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { projectDir } from "../persistence/paths.js";
import type { Project } from "./types.js";

const CACHE_VERSION = 3; // 3: micro-shot entrance compression in scene-assembler (2: camera rig z-index fix)

export function sceneCacheEnabled(): boolean {
  return process.env.MP_SCENE_CACHE !== "0";
}

function cacheDir(project: Project): string {
  return path.join(projectDir(project.tenant_id, project.project_id), "scene-cache");
}

function safeId(sceneId: string): string {
  return sceneId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function hashDirContents(dir: string): Promise<string> {
  const h = createHash("sha256");
  try {
    const entries = (await fs.readdir(dir)).sort();
    for (const name of entries) {
      const p = path.join(dir, name);
      try {
        const stat = await fs.stat(p);
        if (!stat.isFile()) continue;
        h.update(name);
        h.update(await fs.readFile(p));
      } catch {
        /* unreadable entry -- skip */
      }
    }
  } catch {
    /* dir missing -- hash of nothing */
  }
  return h.digest("hex");
}

/**
 * Compute the cache key for one scene. `componentSources` must be the
 * resolved sources for the types THIS scene uses (nested refs included) --
 * pass what loadComponentSources returns for a single-scene projection.
 */
export async function sceneCacheKey(
  project: Project,
  sceneIndex: number,
  componentSources: Array<{ type: string; source: string }>,
  componentLibDir: string,
): Promise<string> {
  const scene = project.scenes[sceneIndex];
  const sharedHash = await hashDirContents(path.join(componentLibDir, "shared"));
  const sortedSources = [...componentSources]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((s) => ({ type: s.type, hash: createHash("sha256").update(s.source).digest("hex") }));

  const key = createHash("sha256");
  key.update(
    JSON.stringify({
      v: CACHE_VERSION,
      scene,
      canvas: project.canvas,
      brand_kit: project.brand_kit ?? null,
      sources: sortedSources,
      shared: sharedHash,
    }),
  );
  return key.digest("hex").slice(0, 24);
}

/**
 * Return the cached mp4 path for (sceneId, key), or null on miss.
 */
export async function getCachedSceneMp4(
  project: Project,
  sceneId: string,
  key: string,
): Promise<string | null> {
  const p = path.join(cacheDir(project), `${safeId(sceneId)}.${key}.mp4`);
  try {
    const stat = await fs.stat(p);
    if (stat.isFile() && stat.size > 0) return p;
  } catch {
    /* miss */
  }
  return null;
}

/**
 * Store a rendered scene mp4 under (sceneId, key). Atomic (tmp + rename),
 * and prunes older cache entries for the same scene id so the dir holds at
 * most one mp4 per scene.
 */
export async function putCachedSceneMp4(
  project: Project,
  sceneId: string,
  key: string,
  mp4Path: string,
): Promise<void> {
  const dir = cacheDir(project);
  await fs.mkdir(dir, { recursive: true });
  const id = safeId(sceneId);
  const dest = path.join(dir, `${id}.${key}.mp4`);
  const tmp = `${dest}.tmp-${process.pid}`;
  await fs.copyFile(mp4Path, tmp);
  await fs.rename(tmp, dest);

  // Prune stale entries for this scene (older keys).
  try {
    const entries = await fs.readdir(dir);
    for (const name of entries) {
      if (name.startsWith(`${id}.`) && name.endsWith(".mp4") && name !== `${id}.${key}.mp4`) {
        await fs.unlink(path.join(dir, name)).catch(() => {});
      }
    }
  } catch {
    /* prune is best-effort */
  }
}
