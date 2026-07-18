/**
 * SPEAKER lane derivation (symmetric-EDL plan of record, ROADMAP #8).
 *
 * `project.speaker` is the declarative truth: placed clips, each with an
 * optional EDL over the ORIGINAL recording. This module renders that truth
 * into the audio file the mixer/preview actually play -- the "bake" is a
 * CACHE of the EDL (keyed by source + cut list), regenerated whenever the
 * EDL changes and never edited directly. Editing flows change the EDL and
 * call ensureSpeakerDerived; everything downstream follows.
 *
 * Stage 1 scope: cut application (rate!=1 audio -- timelapse over silence --
 * is future polish; today's speaker EDLs only carry cuts).
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { complementRanges, cutAudioTo } from "./idle-silence.js";
import { probeMediaDuration } from "./auto-compress.js";
import { resolveVideoPath } from "./video-path.js";
import type { Project } from "./types.js";

export type SpeakerClip = NonNullable<Project["speaker"]>["clips"][number];

/** Stable cache key for a clip's derived audio: source identity + cut list. */
export function speakerDeriveKey(clip: SpeakerClip): string {
  const cuts = clip.edl?.cuts || [];
  return crypto
    .createHash("sha1")
    .update(clip.source + "|" + JSON.stringify(cuts))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Ensure every speaker clip's derived audio exists and is current, and (for
 * the common single-clip case) point the project's narration track at it.
 * Idempotent: unchanged EDLs are no-ops. Returns the narration source URL
 * (derived file, or the clip source itself when there is no EDL).
 */
export async function ensureSpeakerDerived(
  project: Project,
  dataDir?: string,
): Promise<string | null> {
  const clips = project.speaker?.clips || [];
  if (!clips.length) return null;

  const assetsDir = path.join(
    dataDir || process.env.MP_DATA_DIR || "/data/media-producer",
    project.tenant_id, "projects", project.project_id, "assets",
  );

  for (const clip of clips) {
    const cuts = clip.edl?.cuts || [];
    if (!cuts.length) {
      // No source-map: the original IS the rendering.
      clip.derived_audio = clip.source;
      clip.derived_key = speakerDeriveKey(clip);
      continue;
    }
    const key = speakerDeriveKey(clip);
    const name = `speaker-derived-${key}.m4a`;
    const outPath = path.join(assetsDir, name);
    const url = `/assets/${project.tenant_id}/projects/${project.project_id}/assets/${name}`;
    if (clip.derived_key === key && clip.derived_audio === url) {
      try { await fs.access(outPath); continue; } catch { /* cache file lost -- rebake */ }
    }
    await fs.mkdir(assetsDir, { recursive: true });
    const srcPath = resolveVideoPath(clip.source, dataDir);
    const dur = await probeMediaDuration(clip.source, dataDir);
    if (!(dur > 0)) throw new Error(`speaker clip unreadable: ${clip.source}`);
    const kept = complementRanges(
      cuts.map((c) => ({ from: c.src_start, to: c.src_end })),
      dur,
    );
    await cutAudioTo(srcPath, kept, outPath);
    clip.derived_audio = url;
    clip.derived_key = key;
  }

  // Single-clip films (every recorder film today): the narration audio track
  // mirrors the clip -- derived source, placed at the clip's film time.
  if (clips.length === 1) {
    const clip = clips[0];
    const audio: any = (project.audio as any) || { tracks: [] };
    const narr = (audio.tracks || []).find((t: any) => t.id === "narration");
    if (narr) {
      narr.source = clip.derived_audio;
      if (clip.at > 0) narr.start_time = clip.at;
      else delete narr.start_time;
    }
  }
  return clips[0].derived_audio || null;
}
