import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assembleSceneAuto } from "./scene-assembler.js";
import { sceneCompositesOverSpeaker } from "./speaker-mode.js";
import type { ComponentSource } from "./scene-assembler.js";
import { captureSingleFrame } from "./capture.js";
import { speakerSceneFilmStarts } from "./speaker-track.js";

/**
 * Scene thumbnails: a real captured still of the scene -- videos (screencast,
 * b-roll) AND the speaker camera included -- taken a few seconds in, once the
 * intro animations have developed. Cached on disk and invalidated whenever
 * the scene's content (or its camera moves, or the speaker track) changes.
 *
 * This replaces the old live-iframe thumbnails, which couldn't show video
 * content (no preload in thumbs) or the camera (no underlay: one 1080p
 * decoder per scene row would kill the tab) and usually sat on the blank
 * intro frame.
 */

export interface SceneThumbnailOptions {
  project: any;
  scene: any;
  tenantId: string;
  projectId: string;
  components: ComponentSource[];
  speakerUrl?: string;
  dataDir: string;
  gsapDir: string;
  componentLibDir: string;
}

/** The capture moment: 2s in -- past the intro, early enough to represent
 *  the scene's opening statement -- clamped safely inside short scenes. */
export function thumbnailTime(durationSeconds: number): number {
  const dur = durationSeconds || 5;
  return Math.min(2, Math.max(0.8, dur * 0.5));
}

// At most two captures at once: each is a browser page plus ffmpeg frame
// extractions; a 6-scene project opening cold shouldn't stampede the box.
let active = 0;
const waiters: Array<() => void> = [];
async function withCaptureSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= 2) {
    await new Promise<void>((r) => waiters.push(r));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = waiters.shift();
    if (next) next();
  }
}

// Dedupe concurrent requests for the same scene (Studio fires all rows at once).
const inflight = new Map<string, Promise<{ file: string; etag: string }>>();

export async function getSceneThumbnail(
  opts: SceneThumbnailOptions,
): Promise<{ file: string; etag: string }> {
  const { project, scene, tenantId, projectId } = opts;
  const mapKey = `${tenantId}/${projectId}/${scene.id}`;
  const existing = inflight.get(mapKey);
  if (existing) return existing;
  const job = buildSceneThumbnail(opts).finally(() => inflight.delete(mapKey));
  inflight.set(mapKey, job);
  return job;
}

async function buildSceneThumbnail(
  opts: SceneThumbnailOptions,
): Promise<{ file: string; etag: string }> {
  const { project, scene, tenantId, projectId, components, speakerUrl } = opts;
  const atTime = thumbnailTime(scene.duration_seconds);
  const spStarts = speakerSceneFilmStarts(project.scenes || []);
  const idx = (project.scenes || []).findIndex((s: any) => s.id === scene.id);
  const spOffset = idx >= 0 ? spStarts[idx] || 0 : 0;

  // Everything that changes what the frame looks like feeds the cache key.
  const etag = crypto
    .createHash("sha1")
    .update(
      JSON.stringify({
        // v2: captures rewrite /assets/ srcs to file:// so video geometry is
        // real -- bumped to regenerate every thumb cached with collapsed video.
        v: 2,
        scene,
        at: atTime,
        speakerUrl: speakerUrl || "",
        spOffset,
        brand: project.brand_kit || null,
        canvas: project.canvas || null,
      }),
    )
    .digest("hex");

  const thumbDir = path.join(opts.dataDir, tenantId, "projects", projectId, "thumbs");
  const file = path.join(thumbDir, `${scene.id}.jpg`);
  const keyFile = path.join(thumbDir, `${scene.id}.key`);
  try {
    const cachedKey = (await fs.readFile(keyFile, "utf-8")).trim();
    if (cachedKey === etag) {
      await fs.access(file);
      return { file, etag };
    }
  } catch {
    // no cache yet
  }

  return withCaptureSlot(async () => {
    // Re-check under the slot: a queued duplicate may have just built it.
    try {
      const cachedKey = (await fs.readFile(keyFile, "utf-8")).trim();
      if (cachedKey === etag) {
        await fs.access(file);
        return { file, etag };
      }
    } catch {
      // still stale
    }

    // Mirror the preview-scene route: speaker projects render transparent
    // (unless opted out) over the camera underlay, seeked to this scene's
    // film start -- the still shows what the viewer actually sees.
    const sceneForCapture =
      sceneCompositesOverSpeaker(scene, !!speakerUrl)
        ? { ...scene, transparent_background: true }
        : scene;
    const html = await assembleSceneAuto({
      scene: sceneForCapture,
      components,
      brandKit: project.brand_kit,
      canvas: project.canvas,
      gsapDir: opts.gsapDir,
      componentLibDir: opts.componentLibDir,
      preview: true,
      speakerUrl,
      speakerOffset: spOffset,
    });

    const tmpHtml = path.join(os.tmpdir(), `mp_thumb_${etag.slice(0, 12)}.html`);
    const tmpOut = path.join(thumbDir, `${scene.id}.tmp-${etag.slice(0, 8)}.jpg`);
    await fs.mkdir(thumbDir, { recursive: true });
    await fs.writeFile(tmpHtml, html, "utf-8");
    try {
      await captureSingleFrame({
        htmlPath: tmpHtml,
        outputPath: tmpOut,
        width: project.canvas?.width || 1920,
        height: project.canvas?.height || 1080,
        format: "jpeg",
        quality: 72,
        atTime,
      });
      await fs.rename(tmpOut, file);
      await fs.writeFile(keyFile, etag, "utf-8");
    } finally {
      await fs.unlink(tmpHtml).catch(() => {});
      await fs.unlink(tmpOut).catch(() => {});
    }
    return { file, etag };
  });
}
