/**
 * The measured spine (SPEC-take-flow.md): once a take exists for a scene,
 * the scene's clock is what was actually said. This module turns a take
 * into a Spine (whisper word times, repaired the same way the Studio word
 * lane is) and re-times a scene against it -- at attach, and again at build.
 */

import path from "node:path";
import type { Project, Take } from "./types.js";
import { getTranscript, whisperAvailable, snapLeadingWords, snapWordsOutOfSilences } from "./transcribe.js";
import { getWaveformPeaks } from "./waveform.js";
import { detectSilence } from "./idle-silence.js";
import { resolveVideoPath } from "./video-path.js";
import { activeTake, attachTake } from "./take-needs.js";
import { assertedSpine, measuredSpine, applySpine, splitByScripts, type Spine, type ResolveReport } from "./word-anchors.js";

const dataDirOf = (dataDir?: string) => dataDir || process.env.MP_DATA_DIR || "/data/media-producer";

/** Word-level transcript of a take, or null where whisper is not installed. */
export async function wordsForTake(project: Project, take: Take, dataDir?: string): Promise<Array<{ text: string; start: number; end: number }> | null> {
  if (!(await whisperAvailable())) return null;
  const dd = dataDirOf(dataDir);
  const file = resolveVideoPath(take.source, dd);
  // One cache per take: the project-level transcript.json is the Studio
  // lane's and is keyed to whatever speaker clip it looked at last.
  const cacheDir = path.join(dd, project.tenant_id, "projects", project.project_id, "thumbs", `take-${path.basename(take.source).replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  const tr = await getTranscript(file, cacheDir);
  let segs = tr.segments;
  try {
    const wf = await getWaveformPeaks(file, cacheDir);
    const onsetIdx = wf.peaks.findIndex((pk) => pk > 0.08);
    if (onsetIdx > 0) segs = snapLeadingWords(segs, onsetIdx / wf.bucketsPerSecond);
  } catch { /* waveform optional */ }
  try {
    const silences = await detectSilence(file);
    if (silences.length) segs = snapWordsOutOfSilences(segs, silences);
  } catch { /* ffmpeg optional */ }
  return segs.map((s) => ({ text: s.text, start: s.start, end: s.end }));
}

/**
 * The spine a scene should be resolved against right now: MEASURED when
 * the scene has a take and whisper can read it, else ASSERTED from the
 * script over the scene's (or the take's) duration.
 */
export async function spineForScene(
  project: Project | null,
  sceneIndex: number,
  script: string,
  duration: number,
  dataDir?: string,
): Promise<Spine> {
  const take = project ? activeTake(project, sceneIndex) : undefined;
  const dur = takeDuration(take) || duration;
  if (take) {
    try {
      const words = await wordsForTake(project!, take, dataDir);
      if (words && words.length) return measuredSpine(windowWords(words, take), dur);
    } catch (e: any) {
      console.warn(`  [spine] scene ${sceneIndex + 1}: transcript failed (${e?.message || e}) -- asserting from the script over the take's length`);
    }
  }
  return assertedSpine(script, dur);
}

/** The scene's share of the recording: the trimmed window's length, else
 *  the whole take. */
export function takeDuration(take?: Take): number {
  if (!take) return 0;
  if (take.trim_end != null) return Math.max(0, round2(take.trim_end - (take.trim_start || 0)));
  return take.duration && take.duration > 0 ? take.duration : 0;
}

/** Words inside the take's window, re-based to the window's start. */
export function windowWords(words: Array<{ text: string; start: number; end: number }>, take: Take): Array<{ text: string; start: number; end: number }> {
  const from = take.trim_start || 0;
  const to = take.trim_end != null ? take.trim_end : Infinity;
  if (!from && to === Infinity) return words;
  return words
    .filter((w) => w.start >= from - 0.05 && w.start < to)
    .map((w) => ({ text: w.text, start: Math.max(0, round3(w.start - from)), end: Math.max(0, round3(Math.min(w.end, to) - from)) }));
}

/**
 * "Record all": one recording for every scene with lines. Transcribes it
 * once, cuts it where each scene's script begins, and attaches one
 * windowed take per scene. Falls back to proportional cuts without
 * whisper. Returns the takes attached, in scene order.
 */
export async function attachTakeAcrossScenes(
  project: Project,
  base: Omit<Take, "id" | "scene_index">,
  dataDir?: string,
): Promise<{ takes: Take[]; windows: Array<{ start: number; end: number }>; measured: boolean }> {
  const scenes = (project.storyboard?.scenes || []) as any[];
  const indexes = scenes.map((sc, i) => (String(sc.voiceover_text || "").trim() ? i : -1)).filter((i) => i >= 0);
  if (!indexes.length) throw new Error("no scene on this board has spoken lines to cut by");
  const probe: Take = { id: "probe", scene_index: -1, ...base };
  let words: Array<{ text: string; start: number; end: number }> | null = null;
  try { words = await wordsForTake(project, probe, dataDir); } catch { words = null; }
  const total = base.duration && base.duration > 0 ? base.duration : (words?.length ? words[words.length - 1].end : 0);
  const windows = splitByScripts(indexes.map((i) => String(scenes[i].voiceover_text || "")), words || [], total);
  const takes: Take[] = [];
  indexes.forEach((sceneIndex, k) => {
    const w = windows[k];
    takes.push(attachTake(project, { ...base, scene_index: sceneIndex, trim_start: w.start, trim_end: w.end, duration: round2(w.end - w.start) }));
  });
  return { takes, windows, measured: !!(words && words.length) };
}

export interface RetimeResult {
  spine: Spine;
  duration: number;
  storyboard: ResolveReport | null;
  built: ResolveReport | null;
}

/** Re-time one scene (storyboard entry and built scene, whichever exist)
 *  against a spine. Pure: no I/O. */
export function retimeSceneWith(project: Project, sceneIndex: number, spine: Spine): RetimeResult {
  const sb = project.storyboard?.scenes?.[sceneIndex] as any;
  const built = project.scenes?.[sceneIndex] as any;
  const duration = spine.duration > 0 ? spine.duration : (sb?.duration_seconds || built?.duration_seconds || 0);
  let sbReport: ResolveReport | null = null, builtReport: ResolveReport | null = null;
  if (sb) {
    if (spine.source === "measured" && spine.duration > 0) sb.duration_seconds = round2(spine.duration);
    sbReport = applySpine(sb, spine);
  }
  if (built) {
    if (spine.source === "measured" && spine.duration > 0) built.duration_seconds = round2(spine.duration);
    builtReport = applySpine(built, spine);
  }
  return { spine, duration, storyboard: sbReport, built: builtReport };
}

/** The attach-time step: transcribe the scene's take and re-time the scene. */
export async function retimeScene(project: Project, sceneIndex: number, dataDir?: string): Promise<RetimeResult> {
  const sb = project.storyboard?.scenes?.[sceneIndex] as any;
  const built = project.scenes?.[sceneIndex] as any;
  const script = String(sb?.voiceover_text || built?.audio_hints?.voiceover_text || "");
  const duration = Number(sb?.duration_seconds || built?.duration_seconds || 0);
  const spine = await spineForScene(project, sceneIndex, script, duration, dataDir);
  return retimeSceneWith(project, sceneIndex, spine);
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
