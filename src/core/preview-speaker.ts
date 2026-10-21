/**
 * ONE FILE FOR THE PHONE PREVIEW. A per-scene take track plays in the Studio
 * as one <video> per take, swapped at every cut, the next take loaded a few
 * seconds ahead into a hidden standby element. A phone does not load a
 * hidden video ahead, so in the phone Preview every cut waited for the next
 * take from nothing, and the voice and music stopped between scenes (Marc,
 * Oct 21, proj_7d01a9e0 / proj_33f4fd99: "it is not loading").
 *
 * The render already joins the takes into one base on the film's clock
 * (buildSpeakerBase with slots: each take in its slot, black and silence
 * where a scene has none). The Preview plays that same join, at half size,
 * as ONE continuous clip: one element for the whole film, nothing to load
 * at a cut. Made on first request, cached in the film's output folder and
 * keyed by what it is made of, so an edit to a take makes a new one.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Project, SpeakerTrackClip } from "./types.js";
import { buildSpeakerBase, speakerSlots } from "./speaker-track.js";
import { resolveVideoPath } from "./video-path.js";
import { projectOutputDir } from "../persistence/paths.js";

const PREFIX = "preview-speaker-";
const inFlight = new Map<string, Promise<string | null>>();

/** The film's length as the render counts it: scenes plus transitions. */
function filmDuration(project: Pick<Project, "scenes">): number {
  const scenes = project.scenes || [];
  let total = 0;
  for (let i = 0; i < scenes.length; i++) {
    total += scenes[i].duration_seconds || 0;
    const t = scenes[i].transition_in;
    if (i > 0 && t && t.type !== "none") total += t.duration_seconds || 0;
  }
  return total;
}

/** The per-scene clips in scene order, when there are takes to join (two or
 *  more, one per scene). Null for a continuous track or a single take: the
 *  Preview already plays those as one element. */
export function joinableClips(project: Pick<Project, "scenes" | "speaker_track">): SpeakerTrackClip[] | null {
  const clips = (project.speaker_track?.clips || []).filter((c) => typeof c.scene_index === "number");
  if (clips.length < 2 || clips.length !== (project.speaker_track?.clips || []).length) return null;
  const sorted = [...clips].sort((a, b) => (a.scene_index as number) - (b.scene_index as number));
  return speakerSlots(sorted, project.scenes || [], filmDuration(project)) ? sorted : null;
}

/** The joined take's file name in the output folder, made if needed. Null
 *  when the film has no per-scene takes to join. */
export async function ensurePreviewSpeaker(project: Project, dataDir: string): Promise<string | null> {
  const clips = joinableClips(project);
  if (!clips) return null;
  const total = filmDuration(project);
  const slots = speakerSlots(clips, project.scenes, total)!;
  const even = (n: number) => Math.max(2, Math.round(n / 4) * 2);
  const width = even(project.canvas?.width || 1080);
  const height = even(project.canvas?.height || 1920);
  // Keyed by what it is made of: each source and its file time (a re-grade
  // replaces a take in place), the trims and the slots.
  const parts = await Promise.all(clips.map(async (c) => {
    const st = await fs.stat(resolveVideoPath(c.source, dataDir)).catch(() => null);
    return [c.source, st ? st.mtimeMs : 0, c.trim_start ?? c.start ?? 0, c.trim_end ?? null, c.scene_index];
  }));
  const key = crypto.createHash("sha1").update(JSON.stringify({ parts, slots, width, height, total })).digest("hex").slice(0, 16);
  const name = `${PREFIX}${key}.mp4`;
  const outDir = projectOutputDir(project.tenant_id, project.project_id);
  const out = path.join(outDir, name);
  if (await fs.access(out).then(() => true, () => false)) return name;

  const running = inFlight.get(out);
  if (running) return running;
  const job = (async () => {
    await fs.mkdir(outDir, { recursive: true });
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "mp-preview-speaker-"));
    const tmp = path.join(workDir, name);
    try {
      await buildSpeakerBase({ speakerTrack: { ...project.speaker_track!, clips }, totalDuration: total, width, height, outputPath: tmp, workDir, slots });
      await fs.rename(tmp, out).catch(async () => { await fs.copyFile(tmp, out); });
      // One joined take per film: the one it replaced is gone.
      for (const f of await fs.readdir(outDir).catch(() => [] as string[])) {
        if (f.startsWith(PREFIX) && f !== name) await fs.unlink(path.join(outDir, f)).catch(() => {});
      }
      return name;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  })().finally(() => { inFlight.delete(out); });
  inFlight.set(out, job);
  return job;
}
