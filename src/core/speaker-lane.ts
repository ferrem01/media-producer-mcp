/**
 * The speaker lane of a per-scene take track, as the Studio timeline draws
 * it: each scene's clip at its film start, its words and its waveform cut
 * to the clip's window. Pure functions over project data; the routes feed
 * them the per-source transcripts and peaks.
 */
import type { Project, SpeakerTrackClip } from "./types.js";
import { speakerSceneFilmStarts } from "./speaker-track.js";

export interface LaneClip {
  source: string;
  scene_index: number;
  trim_start: number;
  trim_end: number | null;
  film_start: number;
  duration: number;
}

/** True when the track is one clip per scene (any clip carries scene_index). */
export function isPerSceneTrack(clips: SpeakerTrackClip[] | undefined): boolean {
  return !!clips && clips.some((c) => c.scene_index !== undefined && c.scene_index !== null);
}

/** The clips laid on the film's clock, in scene order. Null for a
 *  continuous track (one recording, no scene markers). */
export function laneClips(project: Pick<Project, "scenes" | "speaker_track">): LaneClip[] | null {
  const clips = project.speaker_track?.clips;
  if (!isPerSceneTrack(clips)) return null;
  const scenes = project.scenes || [];
  const starts = speakerSceneFilmStarts(scenes);
  const lane = clips!
    .filter((c) => c.scene_index !== undefined && c.scene_index !== null && scenes[c.scene_index!])
    .map((c) => ({
      source: c.source,
      scene_index: c.scene_index!,
      trim_start: c.trim_start ?? c.start ?? 0,
      trim_end: c.trim_end ?? null,
      film_start: starts[c.scene_index!] || 0,
      duration: scenes[c.scene_index!].duration_seconds || 0,
    }))
    .sort((a, b) => a.scene_index - b.scene_index);
  // Per-scene markers but nothing to lay them on (no built scenes yet):
  // not a lane. The caller falls back to the continuous path.
  return lane.length ? lane : null;
}

/** Words of every clip on the film clock: each source's words windowed to
 *  the clip and shifted to its scene's film start. */
export function laneWords(
  clips: LaneClip[],
  wordsBySource: Record<string, Array<{ text: string; start: number; end: number }> | null | undefined>,
): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  for (const c of clips) {
    const words = wordsBySource[c.source];
    if (!words) continue;
    const to = c.trim_end != null ? c.trim_end : Infinity;
    for (const w of words) {
      if (w.start < c.trim_start - 0.05 || w.start >= to) continue;
      const start = c.film_start + Math.max(0, w.start - c.trim_start);
      const end = c.film_start + Math.max(0, Math.min(w.end, to) - c.trim_start);
      if (start >= c.film_start + c.duration + 0.05) continue;
      out.push({ text: w.text, start: round3(start), end: round3(end) });
    }
  }
  return out;
}

/** Waveform peaks of the whole film: each clip's peaks cut to its window
 *  and laid at its film start; silence between. */
export function lanePeaks(
  clips: LaneClip[],
  peaksBySource: Record<string, { peaks: number[]; bucketsPerSecond: number } | null | undefined>,
  totalDuration: number,
  bucketsPerSecond = 6,
): number[] {
  const n = Math.max(0, Math.ceil(totalDuration * bucketsPerSecond));
  const out = new Array<number>(n).fill(0);
  for (const c of clips) {
    const src = peaksBySource[c.source];
    if (!src || !src.peaks.length) continue;
    const scale = src.bucketsPerSecond / bucketsPerSecond;
    const from = c.film_start, to = c.film_start + c.duration;
    for (let i = Math.floor(from * bucketsPerSecond); i < Math.min(n, Math.ceil(to * bucketsPerSecond)); i++) {
      const filmT = i / bucketsPerSecond;
      const srcT = c.trim_start + (filmT - c.film_start);
      if (c.trim_end != null && srcT >= c.trim_end) break;
      const j = Math.floor(srcT * bucketsPerSecond * scale);
      if (j >= 0 && j < src.peaks.length) out[i] = src.peaks[j];
    }
  }
  return out;
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }
