/**
 * THE NARRATION IS THE CLOCK (voice-only films): each scene lasts as long as
 * its voice line plus a breath, and the line's words are the scene's spine.
 *
 * The build only ever LENGTHENED a scene to fit its line, never shortened it,
 * so a scene planned at 7 s read in 4 s held 3 s of dead air (Six Tabs, Oct 8,
 * re-voiced in Marc's clone at 1.2x). One rule now, used by the build and by
 * `audio action:"fit_voiceover"` on a built film: fit both ways, measure the
 * words (whisper, aligned to the script so anchors and captions read what was
 * written), place each line at its scene's start, and re-time everything
 * anchored to a word.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Project } from "./types.js";
import { assertedSpine, measuredSpine, alignToScript, applySpine, type Spine } from "./word-anchors.js";
import { rescaleBeats } from "./beats.js";

const run = promisify(execFile);

/** The breath after the last word before the cut. */
export const NARRATION_TAIL_S = 0.45;
/** No scene shorter than this, however short its line. */
export const NARRATION_MIN_S = 1.5;

export interface NarrationLine { duration: number; spine?: Spine }

/** A voice track that narrates one scene: `vo_scene_<i>`. */
export function narrationTrackScene(id: unknown): number | null {
  const m = /^vo_scene_(\d+)$/.exec(String(id || ""));
  return m ? Number(m[1]) : null;
}

/** How long a scene runs for a line: the line plus the breath, never under
 *  the floor; on a beat grid, rounded up to the bar (with the transition). */
export function sceneLengthForLine(lineSeconds: number, opts: { barSec?: number; transitionSec?: number } = {}): number {
  const needed = Math.max(NARRATION_MIN_S, lineSeconds + NARRATION_TAIL_S);
  if (opts.barSec && opts.barSec > 0) {
    const trans = opts.transitionSec || 0;
    const bars = Math.max(1, Math.ceil((needed + trans) / opts.barSec - 1e-6));
    return Math.round((bars * opts.barSec - trans) * 100) / 100;
  }
  return Math.round(needed * 100) / 100;
}

/** Measure one line: its length, and its words on the script (whisper where
 *  it is installed, else spread over the length by the script). */
export async function measureNarration(file: string, script: string, cacheDir: string): Promise<NarrationLine> {
  const probe = await run("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const duration = parseFloat(String(probe.stdout).trim()) || 0;
  let spine: Spine | undefined;
  try {
    const { whisperAvailable, getTranscript } = await import("./transcribe.js");
    if (await whisperAvailable()) {
      const tr = await getTranscript(file, path.join(cacheDir, `vo-${path.basename(file).replace(/[^a-zA-Z0-9._-]/g, "_")}`));
      if (tr.segments.length) spine = script ? alignToScript(measuredSpine(tr.segments, duration), script) : measuredSpine(tr.segments, duration);
    }
  } catch (e: any) {
    console.warn(`  [narration] ${path.basename(file)}: transcript failed (${e?.message || e}) -- words spread by the script`);
  }
  if (!spine && script) spine = assertedSpine(script, duration);
  return { duration, ...(spine ? { spine } : {}) };
}

/**
 * Fit the film to its narration. `lines[i]` is scene i's line (missing: the
 * scene keeps its length and has no voice). Sets each scene's length and
 * spine, re-times what is anchored to its words, places each `vo_scene_<i>`
 * track at its scene's start, and trims a music bed that now outruns the
 * film. Returns what changed, per scene.
 */
export function fitScenesToNarration(
  project: Project,
  lines: Array<NarrationLine | undefined>,
  opts: { barSec?: number; transitionSecOf?: (i: number) => number } = {},
): Array<{ scene: number; from: number; to: number }> {
  const changes: Array<{ scene: number; from: number; to: number }> = [];
  project.scenes.forEach((sc: any, i: number) => {
    const line = lines[i];
    if (!line || !(line.duration > 0)) return;
    const from = Number(sc.duration_seconds) || 0;
    const to = sceneLengthForLine(line.duration, { barSec: opts.barSec, transitionSec: opts.transitionSecOf?.(i) });
    sc.duration_seconds = to;
    if (Array.isArray(sc.beats) && sc.beats.length >= 2) rescaleBeats(sc.beats, to);
    if (line.spine) { sc.spine = { ...line.spine, duration: to }; applySpine(sc, sc.spine); }
    if (Math.abs(to - from) > 0.01) changes.push({ scene: i, from, to });
  });
  // Each line at its scene's start (content time, as the build places them).
  const starts: number[] = [];
  let t = 0;
  for (const sc of project.scenes as any[]) { starts.push(Math.round(t * 100) / 100); t += Number(sc.duration_seconds) || 0; }
  const total = Math.round(t * 100) / 100;
  for (const tr of (project.audio?.tracks || []) as any[]) {
    const si = narrationTrackScene(tr.id);
    if (si != null && si < starts.length) tr.start_time = starts[si];
    if (tr.type === "music" && Number(tr.duration) > total) tr.duration = total;
  }
  return changes;
}
