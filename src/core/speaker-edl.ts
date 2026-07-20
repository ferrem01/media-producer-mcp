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
import { complementRanges, cutAudioTo, cutAudioToWithGaps } from "./idle-silence.js";
import { probeMediaDuration } from "./auto-compress.js";
import { mapSourceTime, solveMediaEdits } from "./media-edl.js";
import { resolveVideoPath } from "./video-path.js";
import type { Project, Scene } from "./types.js";

export type SpeakerClip = NonNullable<Project["speaker"]>["clips"][number];

/** Stable cache key for a clip's derived audio: source identity + cut list. */
export function speakerDeriveKey(clip: SpeakerClip): string {
  const cuts = clip.edl?.cuts || [];
  const gaps = clip.edl?.gaps || [];
  return crypto
    .createHash("sha1")
    .update(clip.source + "|" + JSON.stringify(cuts) + (gaps.length ? "|g" + JSON.stringify(gaps) : ""))
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
    const gaps = clip.edl?.gaps || [];
    if (!cuts.length && !gaps.length) {
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
    if (gaps.length) await cutAudioToWithGaps(srcPath, kept, gaps, outPath);
    else await cutAudioTo(srcPath, kept, outPath);
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
// applySpeakerCut -- the referee (ROADMAP #8, re-fit model agreed 2026-07-19).
//
// ONE atomic operation: "remove this span of FILM time from the speaker."
// The speaker is the film's master clock, so a speaker cut removes TIME --
// never screen content. This op writes every consequence in one pass:
//   - the cut lands in the speaker clip's EDL (mapped through its existing
//     kept spans to ORIGINAL-source time), and the bake is re-derived;
//   - SCREEN targets keep every frame: their maps RE-SOLVE into the shorter
//     scene through pins -- an implicit anchor at the cut seam (sync is
//     preserved up to the seam) and a terminal anchor at the new scene end
//     (the remaining footage compresses to fit), both tagged so restore can
//     remove them; user pins shift with their words;
//   - FOLLOWER targets (the camera bubble -- the same take as the voice)
//     mirror the cut in source terms: the lips must lose exactly the span
//     the voice did;
//   - the scene shrinks; captions/chapters/spine/booth-script shift left.
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
/** Re-derive a speaker clip's kept-span segments from its cuts (rate 1).
 *  The source's total length comes from the OLD segments; with no prior
 *  segments there is nothing to re-derive and the empty list stands. */
function speakerSegmentsFor(
  cuts: CutRange[],
  oldSegments: Array<{ src_start: number; src_end: number; rate?: number }>,
): Array<{ src_start: number; src_end: number; rate: number }> {
  const srcEnd = oldSegments.length ? oldSegments[oldSegments.length - 1].src_end : 0;
  if (!(srcEnd > 0)) return oldSegments.map((s) => ({ src_start: s.src_start, src_end: s.src_end, rate: s.rate || 1 }));
  return complementRanges(cuts.map((c) => ({ from: c.src_start, to: c.src_end })), srcEnd)
    .map((r) => ({ src_start: r.from, src_end: r.to, rate: 1 }));
}

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
  /** The removed span on the PREVIOUS bake's clock -- what transcript and
   *  waveform consumers need to shift their word/peak times. */
  bake_from: number;
  bake_to: number;
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
  // Keep segments CONSISTENT with cuts: they are the same fact in two
  // encodings, and a consumer reading stale segments desyncs from the bake.
  const mergedCuts = mergeCut(existing, speakerCut);
  clip.edl = { cuts: mergedCuts, segments: speakerSegmentsFor(mergedCuts, clip.edl?.segments || []) };

  // ── Screen re-fits, followers mirror ──
  const localFrom = filmFrom - sceneStart;
  const localTo = filmTo - sceneStart;
  const newDur = Math.max(0.5, Math.round((target.duration_seconds - d) * 10) / 10);
  const me: any = (target as any).media_edits || {};
  const cutTag = `refit-${speakerCut.src_start.toFixed(2)}`;
  const spkSrcName = (clip.source || "").split("/").pop() || "";

  // Films whose assembly made no idle-silence cuts have NO media-edits
  // entries at all. The loop below only re-fits entries that EXIST, so
  // without seeding, a speaker cut would silently truncate the screen's
  // tail and leave the camera bubble un-mirrored. Seed identity maps over
  // what is currently visible: screen = [0, oldDur] of its own clock;
  // camera follower = the speaker's clock with its existing cuts.
  const oldDur = target.duration_seconds || 0;
  {
    const keys = Object.keys(me);
    const isFollowerKey = (k: string) => !!spkSrcName && k.includes(spkSrcName);
    let hasFollower = keys.some(isFollowerKey);
    let hasScreen = keys.some((k) => !isFollowerKey(k));
    for (const c of (target.components || []) as any[]) {
      const u = c?.data?.video_url || "";
      if (!u || /brand-kit/.test(u)) continue;
      const name = u.split("/").pop() || "";
      if (spkSrcName && name === spkSrcName) {
        if (!hasFollower) {
          const seedCuts = existing.map((x) => ({ ...x }));
          const spkSrcEnd = Math.round(bakeToSourceTime(existing, oldDur) * 1000) / 1000;
          const solved = solveMediaEdits({ cuts: seedCuts, rate_regions: [], pins: [] }, spkSrcEnd);
          me[`video[src*="${name}"]`] = {
            segments: solved.segments, cuts: seedCuts,
            pins: [], rate_regions: [], pin_status: solved.pin_status, proposed: false,
          };
          hasFollower = true;
        }
      } else if (!hasScreen) {
        me.screencast = {
          segments: [{ src_start: 0, src_end: oldDur, rate: 1 }],
          cuts: [], pins: [], rate_regions: [], pin_status: [], proposed: false,
        };
        hasScreen = true;
      }
    }
  }
  let screenCut: CutRange | null = null;
  for (const key of Object.keys(me)) {
    const edit = me[key];
    const segments = edit.segments || [];
    if (!segments.length) continue;
    const srcEnd = segments[segments.length - 1].src_end;

    if (key.includes(spkSrcName)) {
      // FOLLOWER (camera bubble): same clock as the voice -- mirror the cut
      // in source terms so the face loses exactly the span the voice did.
      const cuts = mergeCut(edit.cuts || [], { ...speakerCut });
      const pins = (edit.pins || []).filter((p: any) => !(p.src > speakerCut.src_start && p.src < speakerCut.src_end));
      const solved = solveMediaEdits({ cuts, rate_regions: edit.rate_regions || [], pins }, srcEnd);
      edit.cuts = cuts;
      edit.pins = pins;
      edit.segments = solved.segments;
      edit.pin_status = solved.pin_status;
      edit.proposed = false;
      screenCut = { ...speakerCut };
      continue;
    }

    // SCREEN: keep all content; re-solve the map into the shorter scene.
    // The seam anchor freezes sync up to the cut; the terminal anchor makes
    // the remaining footage compress to fit; both carry the cut's tag so a
    // restore can lift them cleanly.
    const seamSrc = Math.round(mapSourceTime(segments, localFrom) * 1000) / 1000;
    let pins = (edit.pins || [])
      .filter((p: any) => !(p.out >= localFrom && p.out < localTo))
      .map((p: any) => (p.out >= localTo ? { ...p, out: Math.round((p.out - d) * 100) / 100 } : p));
    if (localFrom > 0.3 && !pins.some((p: any) => Math.abs(p.out - localFrom) < 0.3)) {
      pins.push({ out: Math.round(localFrom * 100) / 100, src: seamSrc, word: "⚓", auto: cutTag });
    }
    const terminal = pins.find((p: any) => p.auto === "refit-end");
    if (terminal) terminal.out = newDur;
    else pins.push({ out: newDur, src: srcEnd, word: "⚓", auto: "refit-end" });
    pins = pins.sort((a: any, b: any) => a.out - b.out);
    const solved = solveMediaEdits({ cuts: edit.cuts || [], rate_regions: edit.rate_regions || [], pins }, srcEnd);
    edit.pins = pins;
    edit.segments = solved.segments;
    edit.pin_status = solved.pin_status;
    edit.proposed = false;
  }
  (target as any).media_edits = me;

  // ── Time ripple: the film is now shorter ──
  target.duration_seconds = newDur;

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
    bake_from: Math.round(bakeFrom * 100) / 100,
    bake_to: Math.round(bakeTo * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Transcript-cache maintenance around speaker edits (shared by the HTTP
// routes and the MCP edit_speaker tool). A cut changes word TIMES, not
// words: shift + re-key the cache so the lane never waits on a re-whisper.
// MUST snap against the OLD bake first -- users cut on the snapped clock
// (raw whisper smears words across silences; see PR #435). A restore drops
// the cache: the cut span's words are gone from it, so re-transcribe.
// ─────────────────────────────────────────────────────────────────────────

export async function maintainTranscriptCacheAfterCut(
  tenantId: string,
  projectId: string,
  oldNarrSrc: string | undefined,
  result: SpeakerCutResult,
  dataDir?: string,
): Promise<void> {
  try {
    if (!result.narration_url) return;
    const { rekeyShiftTranscriptCache, snapWordsOutOfSilences, shiftWordsForCut } = await import("./transcribe.js");
    const { detectSilence } = await import("./idle-silence.js");
    const base = dataDir || process.env.MP_DATA_DIR || "/data/media-producer";
    const cacheDir = path.join(base, tenantId, "projects", projectId, "thumbs");
    let oldSilences: Array<{ from: number; to: number }> = [];
    if (oldNarrSrc) {
      try { oldSilences = await detectSilence(resolveVideoPath(oldNarrSrc, dataDir)); } catch { /* optional */ }
    }
    await rekeyShiftTranscriptCache(cacheDir, resolveVideoPath(result.narration_url, dataDir), (segs) =>
      shiftWordsForCut(
        oldSilences.length ? snapWordsOutOfSilences(segs, oldSilences) : segs,
        result.bake_from,
        result.bake_to,
      ),
    );
  } catch { /* cache maintenance is best-effort */ }
}

export async function dropTranscriptCache(
  tenantId: string,
  projectId: string,
  dataDir?: string,
): Promise<void> {
  const base = dataDir || process.env.MP_DATA_DIR || "/data/media-producer";
  try { await fs.unlink(path.join(base, tenantId, "projects", projectId, "thumbs", "transcript.json")); } catch { /* none */ }
}

// ─────────────────────────────────────────────────────────────────────────
// applySpeakerRestore -- the reverse referee: give a cut's time back.
// The film grows by the cut's length at the seam; the re-fit anchors this
// cut planted are lifted, user pins and captions/spine/cues shift right,
// the follower's mirrored cut is removed, screens re-solve (they relax
// back toward their natural rates), and the bake is re-derived. Captions
// that were dropped by the original cut are gone for good -- restoring
// brings back TIME and the voice, not derived text.
// ─────────────────────────────────────────────────────────────────────────

export interface SpeakerRestoreResult {
  restored_seconds: number;
  scene_id: string;
  narration_url: string | null;
  /** Where the time came back, on the pre-restore bake clock. */
  bake_seam: number;
}

export async function applySpeakerRestore(
  project: Project,
  srcStart: number,
  srcEnd: number,
  dataDir?: string,
): Promise<SpeakerRestoreResult> {
  const clips = project.speaker?.clips || [];
  if (clips.length !== 1) throw new Error("speaker restore currently supports single-clip films");
  const clip = clips[0];
  const cuts = clip.edl?.cuts || [];
  const idx = cuts.findIndex(
    (c) => Math.abs(c.src_start - srcStart) < 0.05 && Math.abs(c.src_end - srcEnd) < 0.05,
  );
  if (idx === -1) throw new Error("no matching speaker cut to restore");
  const cut = cuts[idx];
  const d = cut.src_end - cut.src_start;

  // Seam position on the CURRENT (pre-restore) clocks: source -> bake -> film.
  const removedBefore = cuts
    .filter((c) => c.src_start < cut.src_start)
    .reduce((t, c) => t + (c.src_end - c.src_start), 0);
  const bakeSeam = cut.src_start - removedBefore;
  const filmSeam = clip.at + bakeSeam;

  const scenes: Scene[] = project.scenes || [];
  let sceneStart = 0;
  let target: Scene | null = null;
  for (const s of scenes) {
    const dur = s.duration_seconds || 0;
    const hasMedia = !!(s as any).media_edits || (s.components || []).some((c: any) => c.type === "screencast-frame" && !/brand-kit/.test(c.data?.video_url || ""));
    if (hasMedia && filmSeam >= sceneStart - 0.01 && filmSeam <= sceneStart + dur + 0.01) { target = s; break; }
    sceneStart += dur;
  }
  if (!target) throw new Error("the restored span does not land in a narrated scene");
  const localSeam = filmSeam - sceneStart;
  const newDur = Math.round((target.duration_seconds + d) * 10) / 10;

  // Speaker EDL: lift the cut.
  const remainingCuts = cuts.filter((_, i) => i !== idx);
  clip.edl = { cuts: remainingCuts, segments: speakerSegmentsFor(remainingCuts, clip.edl?.segments || []) };

  const cutTag = `refit-${cut.src_start.toFixed(2)}`;
  const spkSrcName = (clip.source || "").split("/").pop() || " ";
  const me: any = (target as any).media_edits || {};
  for (const key of Object.keys(me)) {
    const edit = me[key];
    const segments = edit.segments || [];
    if (!segments.length) continue;
    const srcEnd2 = segments[segments.length - 1].src_end;

    if (key.includes(spkSrcName)) {
      // Follower: remove the mirrored cut.
      const fCuts = (edit.cuts || []).filter(
        (c: any) => !(Math.abs(c.src_start - cut.src_start) < 0.05 && Math.abs(c.src_end - cut.src_end) < 0.05),
      );
      const solved = solveMediaEdits({ cuts: fCuts, rate_regions: edit.rate_regions || [], pins: edit.pins || [] }, srcEnd2);
      edit.cuts = fCuts;
      edit.segments = solved.segments;
      edit.pin_status = solved.pin_status;
      continue;
    }

    // Screen: lift this cut's anchors, shift everything after the seam
    // right, keep the terminal anchor on the (new) scene end, re-solve.
    let pins = (edit.pins || []).filter((p: any) => p.auto !== cutTag);
    pins = pins.map((p: any) => {
      if (p.auto === "refit-end") return { ...p, out: newDur };
      if (p.out >= localSeam - 0.01) return { ...p, out: Math.round((p.out + d) * 100) / 100 };
      return p;
    });
    const solved = solveMediaEdits({ cuts: edit.cuts || [], rate_regions: edit.rate_regions || [], pins }, srcEnd2);
    edit.pins = pins;
    edit.segments = solved.segments;
    edit.pin_status = solved.pin_status;
  }
  (target as any).media_edits = me;

  target.duration_seconds = newDur;

  const shift = (t: number) => (t >= localSeam - 0.01 ? Math.round((t + d) * 100) / 100 : t);
  for (const c of target.components as any[]) {
    if (c.type !== "narration-track" || !c.data) continue;
    c.data.captions = (c.data.captions || []).map((cap: any) => ({ ...cap, start: shift(cap.start), end: shift(cap.end) }));
    c.data.chapters = (c.data.chapters || []).map((ch: any) => ({ ...ch, at: shift(ch.at) }));
  }
  if (project.spine) {
    const bShift = (t: number) => (t >= bakeSeam - 0.01 ? Math.round((t + d) * 100) / 100 : t);
    project.spine.sentences = (project.spine.sentences || []).map((s: any) => ({ ...s, start: bShift(s.start), end: bShift(s.end) }));
    project.spine.chapters = (project.spine.chapters || []).map((ch: any) => ({ ...ch, start: bShift(ch.start), end: bShift(ch.end) }));
  }
  if (project.booth_script) {
    project.booth_script.cues = (project.booth_script.cues || []).map((cue) => ({
      ...cue,
      at: cue.at >= filmSeam - 0.01 ? Math.round((cue.at + d) * 10) / 10 : cue.at,
    }));
  }

  const narrationUrl = await ensureSpeakerDerived(project, dataDir);
  project.updated_at = new Date().toISOString();
  return {
    restored_seconds: Math.round(d * 100) / 100,
    scene_id: target.id,
    narration_url: narrationUrl,
    bake_seam: Math.round(bakeSeam * 100) / 100,
  };
}

// ── Timelapse beats (Marc's "the AI takes so long" scenario) ─────────────
// A deliberate ⏩ beat: a span of SCREEN footage plays in exactly
// out_seconds, however fast that requires (cap-exempt; sampled rendering
// above ~8x). The beat's film time is FUNDED by splicing a matching gap of
// silence into the talk track at that spot -- the voice pauses, the beat
// plays, the voice resumes exactly where it left off. The camera follower
// freezes for the beat. removeTimelapse reverses all of it.

export interface TimelapseResult {
  scene_id: string;
  key: string;
  src_start: number;
  src_end: number;
  out_seconds: number;
  /** Film seconds ADDED by the beat (gap length; 0 when it fit already). */
  added_seconds: number;
  /** Film position where the beat begins. */
  film_at: number;
  /** Bake position of the inserted narration gap (for transcript shifts). */
  gap_bake_at: number | null;
}

/** Output-clock time at which `src` first appears in a segment map. */
function outTimeAtSource(segments: Array<{ src_start: number; src_end: number; rate: number; hold?: number }>, src: number): number {
  let acc = 0;
  for (const s of segments) {
    const isHold = typeof s.hold === "number" && s.hold > 0;
    if (isHold) { acc += s.hold!; continue; }
    if (src < s.src_start) return acc;                    // src sits in a cut before this segment
    const rate = Math.max(0.1, s.rate || 1);
    if (src <= s.src_end) return acc + (src - s.src_start) / rate;
    acc += (s.src_end - s.src_start) / rate;
  }
  return acc;
}

/** Splice a freeze into a segment map at follower source time `src`. */
function spliceHold(
  segments: Array<{ src_start: number; src_end: number; rate: number; hold?: number }>,
  src: number,
  holdSeconds: number,
): Array<{ src_start: number; src_end: number; rate: number; hold?: number }> {
  const out: Array<{ src_start: number; src_end: number; rate: number; hold?: number }> = [];
  let placed = false;
  for (const s of segments) {
    const isHold = typeof s.hold === "number" && s.hold > 0;
    if (placed || isHold || src <= s.src_start + 0.01 || src >= s.src_end - 0.01) {
      out.push({ ...s });
      if (!placed && !isHold && Math.abs(src - s.src_end) <= 0.01) {
        out.push({ src_start: src, src_end: src, rate: 0, hold: holdSeconds });
        placed = true;
      }
      continue;
    }
    out.push({ src_start: s.src_start, src_end: src, rate: s.rate });
    out.push({ src_start: src, src_end: src, rate: 0, hold: holdSeconds });
    out.push({ src_start: src, src_end: s.src_end, rate: s.rate });
    placed = true;
  }
  if (!placed) out.push({ src_start: src, src_end: src, rate: 0, hold: holdSeconds });
  return out;
}

/**
 * Add (or resize) a deliberate timelapse beat on a screen target.
 * Idempotent per (key, src_start, src_end): re-applying with a new
 * out_seconds resizes the beat (gap adjusts by the difference).
 */
export async function applyTimelapse(
  project: Project,
  args: { scene_id: string; key: string; src_start: number; src_end: number; out_seconds: number },
  dataDir?: string,
): Promise<TimelapseResult> {
  const scene = (project.scenes || []).find((s) => s.id === args.scene_id) as any;
  if (!scene) throw new Error(`scene ${args.scene_id} not found`);
  const me = scene.media_edits || {};
  const edit = me[args.key];
  if (!edit) throw new Error(`no media edit for target ${args.key}`);
  const outSeconds = Math.max(0.5, Math.min(30, args.out_seconds));

  const clips = project.speaker?.clips || [];
  const clip = clips.length === 1 ? clips[0] : null;

  // Solve the CURRENT intents fresh -- stored segments may be a strained
  // (overrunning) map, which is exactly why the beat is being added.
  const tls = ((edit.timelapses || []) as Array<{ src_start: number; src_end: number; out_seconds: number }>).slice();
  const existingTl = tls.find((t) => Math.abs(t.src_start - args.src_start) < 0.25 && Math.abs(t.src_end - args.src_end) < 0.25);
  const srcEnd = Math.max(
    edit.segments && edit.segments.length ? edit.segments[edit.segments.length - 1].src_end : 0,
    args.src_end,
    ...((edit.pins || []) as any[]).map((p: any) => p.src || 0),
  );
  const solvedBefore = solveMediaEdits(
    { cuts: edit.cuts || [], rate_regions: edit.rate_regions || [], pins: edit.pins || [], timelapses: tls },
    srcEnd,
  );
  let sceneStart = 0;
  for (const s of project.scenes) { if (s.id === scene.id) break; sceneStart += s.duration_seconds || 0; }
  // The beat starts where the film SAYS the span starts: the pin at/before
  // src_start when one exists (pins are the film's truth -- a hold or a
  // strained map showing the frame earlier/later is derived, not normative).
  const pinsByOut = ((edit.pins || []) as any[]).slice().sort((a: any, b: any) => a.out - b.out);
  const prevPin = pinsByOut.filter((p: any) => p.src <= args.src_start + 0.3).pop();
  const beatLocal = prevPin ? prevPin.out : outTimeAtSource(solvedBefore.segments, args.src_start);
  const filmAt = sceneStart + beatLocal;

  // The span's NORMATIVE footprint: up to the next pin at/after its end.
  // Unpinned ends fall back to the solved map.
  const nextPin = pinsByOut.find((p: any) => p.src >= args.src_end - 0.3 && p.out > beatLocal + 0.05);
  const prevOut = existingTl
    ? existingTl.out_seconds
    : Math.max(0.1, (nextPin ? nextPin.out : outTimeAtSource(solvedBefore.segments, args.src_end)) - beatLocal);
  const wantDelta = Math.round((outSeconds - prevOut) * 100) / 100;
  if (existingTl) existingTl.out_seconds = outSeconds;
  else tls.push({ src_start: args.src_start, src_end: args.src_end, out_seconds: outSeconds });
  edit.timelapses = tls;

  // Fund positive deltas with narration silence; refunds are bounded by the
  // gap that actually exists (film time never shrinks below the narration).
  let actualDelta = 0;
  let gapBakeAt: number | null = null;
  if (clip && Math.abs(wantDelta) > 0.05) {
    const bakeAt = Math.max(0, filmAt - (clip.at || 0));
    const spkSrcAt = Math.round(bakeToSourceTime(clip.edl?.cuts || [], bakeAt) * 1000) / 1000;
    const gaps = (clip.edl?.gaps || []).slice();
    const existingGap = gaps.find((g) => Math.abs(g.src_at - spkSrcAt) < 0.5);
    if (wantDelta > 0) {
      actualDelta = wantDelta;
      if (existingGap) existingGap.seconds = Math.round((existingGap.seconds + wantDelta) * 100) / 100;
      else gaps.push({ src_at: spkSrcAt, seconds: wantDelta });
    } else if (existingGap) {
      const refund = Math.min(-wantDelta, existingGap.seconds);
      actualDelta = -refund;
      existingGap.seconds = Math.round((existingGap.seconds - refund) * 100) / 100;
      if (existingGap.seconds < 0.05) gaps.splice(gaps.indexOf(existingGap), 1);
    }
    if (Math.abs(actualDelta) > 0.01) {
      clip.edl = { cuts: clip.edl?.cuts || [], segments: clip.edl?.segments || [], gaps };
      gapBakeAt = bakeAt;
      rippleFilmTime(project, scene, me, args.key, beatLocal, filmAt, bakeAt, actualDelta);
      // Camera follower: freeze (or unfreeze) for the beat's added time.
      const spkName = (clip.source || "").split("/").pop() || "";
      for (const key2 of Object.keys(me)) {
        if (!spkName || !key2.includes(spkName)) continue;
        const e2 = me[key2];
        e2.segments = adjustHold(e2.segments || [], spkSrcAt, actualDelta);
      }
      await ensureSpeakerDerived(project, dataDir);
    }
  }

  // Re-solve the screen with the beat as a fixed constraint.
  const solved = solveMediaEdits(
    { cuts: edit.cuts || [], rate_regions: edit.rate_regions || [], pins: edit.pins || [], timelapses: edit.timelapses },
    srcEnd,
  );
  edit.segments = solved.segments;
  edit.pin_status = solved.pin_status;
  edit.proposed = false;
  scene.media_edits = me;
  project.updated_at = new Date().toISOString();

  return {
    scene_id: scene.id, key: args.key,
    src_start: args.src_start, src_end: args.src_end, out_seconds: outSeconds,
    added_seconds: Math.round(actualDelta * 100) / 100, film_at: Math.round(filmAt * 100) / 100,
    gap_bake_at: gapBakeAt,
  };
}

/** Shift everything at/after a film position by delta (captions, chapters,
 *  spine, booth cues, this target's pins, scene duration). */
function rippleFilmTime(
  project: Project, scene: any, me: any, key: string,
  beatLocal: number, filmAt: number, bakeAt: number, delta: number,
): void {
  scene.duration_seconds = Math.round((scene.duration_seconds + delta) * 10) / 10;
  const localAt = beatLocal + 0.01;
  const e = me[key];
  e.pins = (e.pins || []).map((p: any) => (p.out >= localAt && p.auto !== "refit-end" ? { ...p, out: Math.round((p.out + delta) * 100) / 100 } : p));
  const term = (e.pins || []).find((p: any) => p.auto === "refit-end");
  if (term) term.out = scene.duration_seconds;
  for (const c of (scene.components || []) as any[]) {
    if (c.type !== "narration-track" || !c.data) continue;
    c.data.captions = (c.data.captions || []).map((cap: any) =>
      cap.start >= localAt ? { ...cap, start: Math.round((cap.start + delta) * 100) / 100, end: Math.round((cap.end + delta) * 100) / 100 } : cap);
    c.data.chapters = (c.data.chapters || []).map((ch: any) =>
      ch.at >= localAt ? { ...ch, at: Math.round((ch.at + delta) * 100) / 100 } : ch);
  }
  if (project.spine) {
    project.spine.sentences = (project.spine.sentences || []).map((sn: any) =>
      sn.start >= bakeAt ? { ...sn, start: Math.round((sn.start + delta) * 100) / 100, end: Math.round((sn.end + delta) * 100) / 100 } : sn);
    project.spine.chapters = (project.spine.chapters || []).map((ch: any) =>
      ch.start >= bakeAt ? { ...ch, start: Math.round((ch.start + delta) * 100) / 100, end: Math.round((ch.end + delta) * 100) / 100 } : ch);
  }
  if (project.booth_script) {
    project.booth_script.cues = (project.booth_script.cues || []).map((cue) =>
      cue.at >= filmAt ? { ...cue, at: Math.round((cue.at + delta) * 10) / 10 } : cue);
  }
}

/** Add `delta` seconds of freeze at follower source `src` (delta<0 shrinks
 *  or removes an existing hold there). */
function adjustHold(
  segments: Array<{ src_start: number; src_end: number; rate: number; hold?: number }>,
  src: number,
  delta: number,
): Array<{ src_start: number; src_end: number; rate: number; hold?: number }> {
  const existing = segments.find((s) => typeof s.hold === "number" && s.hold > 0 && Math.abs(s.src_start - src) < 0.5);
  if (existing) {
    existing.hold = Math.round(Math.max(0, (existing.hold || 0) + delta) * 100) / 100;
    return segments.filter((s) => !(typeof s.hold === "number" && s.hold < 0.05 && s.src_start === s.src_end));
  }
  if (delta <= 0.01) return segments;
  return spliceHold(segments, src, Math.round(delta * 100) / 100);
}

/** Remove a timelapse beat: lift the block, refund its narration gap, and
 *  shrink the film back to the narration's length. */
export async function removeTimelapse(
  project: Project,
  args: { scene_id: string; key: string; src_start: number },
  dataDir?: string,
): Promise<TimelapseResult> {
  const scene = (project.scenes || []).find((s) => s.id === args.scene_id) as any;
  if (!scene) throw new Error(`scene ${args.scene_id} not found`);
  const me = scene.media_edits || {};
  const edit = me[args.key];
  const tls = (edit?.timelapses || []) as Array<{ src_start: number; src_end: number; out_seconds: number }>;
  const tl = tls.find((t) => Math.abs(t.src_start - args.src_start) < 0.25);
  if (!edit || !tl) throw new Error("no timelapse at that position");

  const clips = project.speaker?.clips || [];
  const clip = clips.length === 1 ? clips[0] : null;
  let sceneStart = 0;
  for (const s of project.scenes) { if (s.id === scene.id) break; sceneStart += s.duration_seconds || 0; }
  // Same pin-anchored position as applyTimelapse, so the gap lookup matches.
  const pinsByOut = ((edit.pins || []) as any[]).slice().sort((a: any, b: any) => a.out - b.out);
  const prevPin = pinsByOut.filter((p: any) => p.src <= tl.src_start + 0.3).pop();
  const beatLocal = prevPin ? prevPin.out : outTimeAtSource(edit.segments || [], tl.src_start);
  const filmAt = sceneStart + beatLocal;

  let refunded = 0;
  let gapBakeAt: number | null = null;
  if (clip) {
    const bakeAt = Math.max(0, filmAt - (clip.at || 0));
    gapBakeAt = bakeAt;
    const spkSrcAt = Math.round(bakeToSourceTime(clip.edl?.cuts || [], bakeAt) * 1000) / 1000;
    const gaps = (clip.edl?.gaps || []).slice();
    const g = gaps.find((x) => Math.abs(x.src_at - spkSrcAt) < 0.5);
    if (g) {
      refunded = g.seconds;
      gaps.splice(gaps.indexOf(g), 1);
      clip.edl = { cuts: clip.edl?.cuts || [], segments: clip.edl?.segments || [], gaps };
      rippleFilmTime(project, scene, me, args.key, beatLocal, filmAt, bakeAt, -refunded);
      const spkName = (clip.source || "").split("/").pop() || "";
      for (const key2 of Object.keys(me)) {
        if (!spkName || !key2.includes(spkName)) continue;
        me[key2].segments = adjustHold(me[key2].segments || [], spkSrcAt, -refunded);
      }
      await ensureSpeakerDerived(project, dataDir);
    }
  }

  edit.timelapses = tls.filter((t) => t !== tl);
  const srcEnd = Math.max(
    edit.segments && edit.segments.length ? edit.segments[edit.segments.length - 1].src_end : 0,
    tl.src_end,
    ...((edit.pins || []) as any[]).map((p: any) => p.src || 0),
  );
  const solved = solveMediaEdits(
    { cuts: edit.cuts || [], rate_regions: edit.rate_regions || [], pins: edit.pins || [], timelapses: edit.timelapses },
    srcEnd,
  );
  edit.segments = solved.segments;
  edit.pin_status = solved.pin_status;
  project.updated_at = new Date().toISOString();
  return {
    scene_id: scene.id, key: args.key, src_start: tl.src_start, src_end: tl.src_end,
    out_seconds: 0, added_seconds: -Math.round(refunded * 100) / 100,
    film_at: Math.round(filmAt * 100) / 100, gap_bake_at: gapBakeAt,
  };
}

/** Transcript maintenance after a gap insert/removal: words don't change,
 *  their times shift by delta at/after the gap's bake position. */
export async function maintainTranscriptCacheAfterGap(
  tenantId: string,
  projectId: string,
  narrationUrl: string | undefined,
  gapBakeAt: number,
  delta: number,
  dataDir?: string,
): Promise<void> {
  try {
    if (!narrationUrl || Math.abs(delta) < 0.01) return;
    const { rekeyShiftTranscriptCache } = await import("./transcribe.js");
    const base = dataDir || process.env.MP_DATA_DIR || "/data/media-producer";
    const cacheDir = path.join(base, tenantId, "projects", projectId, "thumbs");
    await rekeyShiftTranscriptCache(cacheDir, resolveVideoPath(narrationUrl, dataDir), (segs) =>
      segs.map((s: any) => (s.start >= gapBakeAt - 0.01
        ? { ...s, start: Math.round((s.start + delta) * 100) / 100, end: Math.round((s.end + delta) * 100) / 100 }
        : s)),
    );
  } catch { /* best-effort */ }
}

/** When a solve leaves a pin strained past the 16x cap (more footage than
 *  film time), auto-create the timelapse beat that makes it land -- Marc's
 *  ratified rule: "suggest when it's ugly, auto only when it's impossible."
 *  Returns the applied beat (for a toast) or null when nothing strained. */
export async function autoTimelapseForStrain(
  project: Project,
  sceneId: string,
  key: string,
  dataDir?: string,
): Promise<TimelapseResult | null> {
  const scene = (project.scenes || []).find((s) => s.id === sceneId) as any;
  const edit = scene?.media_edits?.[key];
  if (!edit) return null;
  const strained = (edit.pin_status || []).find(
    (x: any) => x.status === "strained" && /faster|16x cap/.test(x.detail || ""),
  );
  if (!strained) return null;
  const pins = (edit.pins || []).slice().sort((a: any, b: any) => a.out - b.out);
  const pin = pins.find((p: any) => Math.abs(p.out - strained.out) < 0.3);
  if (!pin) return null;
  const prev = pins.filter((p: any) => p.out < pin.out - 0.05).pop();
  const spanStart = prev ? prev.src : (edit.segments && edit.segments.length ? edit.segments[0].src_start : 0);
  const spanEnd = Math.max(spanStart + 1, pin.src - 0.5);
  if (spanEnd - spanStart < 3) return null;
  // Default beat length: enough to read, never a chore. ~1s of film per
  // 30s of waiting, clamped 3..8s.
  let kept = 0, cursor = spanStart;
  for (const c of (edit.cuts || []).slice().sort((a: any, b: any) => a.src_start - b.src_start)) {
    if (c.src_end <= cursor || c.src_start >= spanEnd) continue;
    kept += Math.max(0, Math.min(c.src_start, spanEnd) - cursor);
    cursor = Math.max(cursor, c.src_end);
  }
  kept += Math.max(0, spanEnd - cursor);
  const outSeconds = Math.max(3, Math.min(8, Math.round(kept / 30)));
  return applyTimelapse(project, { scene_id: sceneId, key, src_start: spanStart, src_end: spanEnd, out_seconds: outSeconds }, dataDir);
}
