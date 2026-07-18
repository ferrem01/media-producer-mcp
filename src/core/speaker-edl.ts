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
import { mapSourceTime, solveMediaEdits } from "./media-edl.js";
import { resolveVideoPath } from "./video-path.js";
import type { Project, Scene } from "./types.js";

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

// ─────────────────────────────────────────────────────────────────────────
// applySpeakerCut -- the referee (ROADMAP #8 stages 2+4).
//
// ONE atomic operation: "remove this span of FILM time from the speaker."
// The speaker is the film's master clock, so a speaker cut removes time
// itself; this op writes every consequence in one pass:
//   - the cut lands in the speaker clip's EDL (mapped through its existing
//     kept spans to ORIGINAL-source time), and the bake is re-derived;
//   - the linked screen (and camera-follower) EDLs get the same film span
//     removed, mapped through their own segments to their own source clocks;
//   - the scene shrinks; captions/chapters/spine/booth-script shift left;
//   - pins inside the removed span are dropped.
// ─────────────────────────────────────────────────────────────────────────

interface CutRange { src_start: number; src_end: number }

/** Merge a new cut into a sorted, non-overlapping cut list. */
export function mergeCut(cuts: CutRange[], add: CutRange): CutRange[] {
  const all = [...cuts, add].sort((a, b) => a.src_start - b.src_start);
  const out: CutRange[] = [];
  for (const c of all) {
    const last = out[out.length - 1];
    if (last && c.src_start <= last.src_end + 0.01) last.src_end = Math.max(last.src_end, c.src_end);
    else out.push({ ...c });
  }
  return out;
}

/** Map a BAKE-clock time (the derived audio's clock) to ORIGINAL-source
 *  time through the clip's existing cuts. Exported for tests. */
export function bakeToSourceTime(cuts: CutRange[], bakeTime: number): number {
  let remaining = bakeTime;
  let cursor = 0;
  for (const c of [...cuts].sort((a, b) => a.src_start - b.src_start)) {
    const keptLen = c.src_start - cursor;
    if (remaining < keptLen) return cursor + remaining;
    remaining -= keptLen;
    cursor = c.src_end;
  }
  return cursor + remaining;
}

export interface SpeakerCutResult {
  removed_seconds: number;
  scene_id: string;
  speaker_cut: CutRange;
  screen_cut: CutRange | null;
  narration_url: string | null;
}

export async function applySpeakerCut(
  project: Project,
  filmFrom: number,
  filmTo: number,
  dataDir?: string,
): Promise<SpeakerCutResult> {
  const clips = project.speaker?.clips || [];
  if (clips.length !== 1) throw new Error("speaker cutting currently supports single-clip films");
  const clip = clips[0];
  const d = filmTo - filmFrom;
  if (!(d > 0.05)) throw new Error("cut span is empty");

  // The scene the film span lives in (the walkthrough). Cuts may not cross
  // scene bounds -- bookends are not narrated.
  const scenes: Scene[] = project.scenes || [];
  let sceneStart = 0;
  let target: Scene | null = null;
  for (const s of scenes) {
    const dur = s.duration_seconds || 0;
    const hasMedia = !!(s as any).media_edits || (s.components || []).some((c: any) => c.type === "screencast-frame" && !/brand-kit/.test(c.data?.video_url || ""));
    if (hasMedia && filmFrom >= sceneStart - 0.01 && filmTo <= sceneStart + dur + 0.01) { target = s; break; }
    sceneStart += dur;
  }
  if (!target) throw new Error("cut span must lie within a single narrated scene");

  // ── Speaker: film -> bake clock -> original-source clock ──
  const bakeFrom = filmFrom - clip.at;
  const bakeTo = filmTo - clip.at;
  if (bakeFrom < -0.01) throw new Error("cut span starts before the speaker does");
  const existing = clip.edl?.cuts || [];
  const speakerCut: CutRange = {
    src_start: Math.round(bakeToSourceTime(existing, Math.max(0, bakeFrom)) * 1000) / 1000,
    src_end: Math.round(bakeToSourceTime(existing, bakeTo) * 1000) / 1000,
  };
  clip.edl = { cuts: mergeCut(existing, speakerCut), segments: clip.edl?.segments || [] };

  // ── Screen (linked): film -> scene-local -> screen-source clock ──
  const localFrom = filmFrom - sceneStart;
  const localTo = filmTo - sceneStart;
  const me: any = (target as any).media_edits || {};
  let screenCut: CutRange | null = null;
  for (const key of Object.keys(me)) {
    const edit = me[key];
    const segments = edit.segments || [];
    const sFrom = Math.round(mapSourceTime(segments, localFrom) * 1000) / 1000;
    const sTo = Math.round(mapSourceTime(segments, localTo) * 1000) / 1000;
    if (!(sTo > sFrom)) continue; // span fell inside a hold -- nothing to remove
    const cuts = mergeCut(edit.cuts || [], { src_start: sFrom, src_end: sTo });
    // Pins inside the removed footage can no longer hold; drop them.
    const pins = (edit.pins || []).filter((p: any) => !(p.src > sFrom && p.src < sTo));
    const srcEnd = segments.length ? segments[segments.length - 1].src_end : sTo;
    const solved = solveMediaEdits({ cuts, rate_regions: edit.rate_regions || [], pins }, srcEnd);
    edit.cuts = cuts;
    edit.pins = pins;
    edit.segments = solved.segments;
    edit.pin_status = solved.pin_status;
    edit.proposed = false; // a human made this
    if (key === "screencast") screenCut = { src_start: sFrom, src_end: sTo };
  }
  (target as any).media_edits = me;

  // ── Time ripple: the film is now shorter ──
  target.duration_seconds = Math.max(0.5, Math.round((target.duration_seconds - d) * 10) / 10);

  const shift = (t: number) => (t >= localTo ? t - d : t);
  const dropIn = (a: number, b: number) => a >= localFrom && b <= localTo;
  for (const c of target.components as any[]) {
    if (c.type !== "narration-track" || !c.data) continue;
    c.data.captions = (c.data.captions || [])
      .filter((cap: any) => !dropIn(cap.start, cap.end))
      .map((cap: any) => ({
        ...cap,
        start: Math.round(shift(Math.min(cap.start, cap.start >= localFrom && cap.start < localTo ? localFrom : cap.start)) * 100) / 100,
        end: Math.round(shift(Math.min(cap.end, cap.end > localFrom && cap.end <= localTo ? localFrom : cap.end)) * 100) / 100,
      }))
      .filter((cap: any) => cap.end - cap.start > 0.2);
    c.data.chapters = (c.data.chapters || [])
      .filter((ch: any) => !(ch.at >= localFrom && ch.at < localTo))
      .map((ch: any) => ({ ...ch, at: Math.round(shift(ch.at) * 100) / 100 }));
  }

  // Spine lives on the BAKE clock; same span there.
  if (project.spine) {
    const bShift = (t: number) => (t >= bakeTo ? t - d : t);
    project.spine.sentences = (project.spine.sentences || [])
      .filter((s: any) => !(s.start >= bakeFrom && s.end <= bakeTo))
      .map((s: any) => ({ ...s, start: Math.round(bShift(Math.min(s.start, s.start >= bakeFrom && s.start < bakeTo ? bakeFrom : s.start)) * 100) / 100, end: Math.round(bShift(Math.min(s.end, s.end > bakeFrom && s.end <= bakeTo ? bakeFrom : s.end)) * 100) / 100 }))
      .filter((s: any) => s.end - s.start > 0.15);
    project.spine.chapters = (project.spine.chapters || [])
      .map((ch: any) => ({ ...ch, start: Math.round(bShift(ch.start) * 100) / 100, end: Math.round(bShift(ch.end) * 100) / 100 }))
      .filter((ch: any) => ch.end - ch.start > 1);
  }

  // Booth-script cues ride the film clock.
  if (project.booth_script) {
    project.booth_script.cues = (project.booth_script.cues || [])
      .filter((cue) => !(cue.at >= filmFrom && cue.at < filmTo))
      .map((cue) => ({ ...cue, at: Math.round((cue.at >= filmTo ? cue.at - d : cue.at) * 10) / 10 }));
  }

  // ── Re-derive the bake; the narration track follows automatically ──
  const narrationUrl = await ensureSpeakerDerived(project, dataDir);

  project.updated_at = new Date().toISOString();
  return {
    removed_seconds: Math.round(d * 100) / 100,
    scene_id: target.id,
    speaker_cut: speakerCut,
    screen_cut: screenCut,
    narration_url: narrationUrl,
  };
}
