/**
 * One still per take, at its trim: the picture the speaker lane wears and
 * the storyboard card shows once a take is in. Made on first request with
 * ffmpeg, cached beside the thumbnails.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import type { Project, Take } from "./types.js";
import { resolveVideoPath } from "./video-path.js";

export async function ensureTakePoster(project: Project, take: Take, dataDir: string): Promise<string | null> {
  const posterDir = path.join(dataDir, project.tenant_id, "projects", project.project_id, "thumbs");
  const posterFile = path.join(posterDir, `take-poster-${take.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.jpg`);
  try { await fs.access(posterFile); return posterFile; } catch { /* make it */ }
  await fs.mkdir(posterDir, { recursive: true });
  // Half a second past the trim: past the first-word breath, on the face.
  const at = Math.max(0, (take.trim_start || 0) + Math.min(0.5, Math.max(0, (take.duration || 1) * 0.25)));
  const ok = await new Promise<boolean>((resolve) => {
    execFile("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(at), "-i", resolveVideoPath(take.source, dataDir), "-frames:v", "1", "-vf", "scale=-2:640", "-q:v", "4", posterFile],
      (err) => resolve(!err));
  });
  if (!ok) { console.warn(`  take poster failed for ${take.id}`); return null; }
  return posterFile;
}

/** A still for any provided clip on the board (a screen recording, b-roll),
 *  one second in, cached beside the thumbnails: the card is a file:// page
 *  and cannot play the clip, so it wears this frame. */
export async function ensureMediaPoster(project: Pick<Project, "tenant_id" | "project_id">, src: string, dataDir: string): Promise<string | null> {
  const posterDir = path.join(dataDir, project.tenant_id, "projects", project.project_id, "thumbs");
  const key = path.basename(src).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const posterFile = path.join(posterDir, `media-poster-${key}.jpg`);
  try { await fs.access(posterFile); return posterFile; } catch { /* make it */ }
  await fs.mkdir(posterDir, { recursive: true });
  const ok = await new Promise<boolean>((resolve) => {
    execFile("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1", "-i", resolveVideoPath(src, dataDir), "-frames:v", "1", "-vf", "scale=-2:720", "-q:v", "3", posterFile],
      (err) => resolve(!err));
  });
  if (!ok) { console.warn(`  media poster failed for ${path.basename(src)}`); return null; }
  return posterFile;
}

