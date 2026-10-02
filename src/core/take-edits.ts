/**
 * TAKE EDITS: trim and cut a per-scene camera take (speaker_track).
 *
 * The screencast narrator has had cuts for a while (core/speaker-edl.ts);
 * a camera take had only its window (trim_start/trim_end). This gives a take
 * the same cut list -- `take.cuts`, ORIGINAL-recording seconds, the speaker
 * lane's {src_start, src_end} shape -- and keeps every consumer unchanged:
 *
 *   - The truth is the take: its window (trim_start/trim_end) and its cuts,
 *     both on the original recording's clock.
 *   - The cut is BAKED, like the narrator's derived audio: each of the take's
 *     files (the raw take, the blur and alpha copies, every recast) gets a
 *     copy with the cuts taken out (`take.cut_files`). The copies share one
 *     clock, so a cut made once holds for whoever performs.
 *   - syncSpeakerClips points the scene's clip at the cut copy and maps the
 *     window onto the cut clock. Render, Studio playback, the alpha layer and
 *     the lane read a clip exactly as before: a file and a window.
 *   - The spine (measured-spine.ts) reads the raw take's words through the
 *     cuts, so the scene re-times to what is left and word anchors, captions
 *     and sound cues re-resolve.
 *
 * A trim is the simple case: only the window moves, no copy is made.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { Project, Take } from "./types.js";
import { activeTake } from "./take-needs.js";
import { retimeScene } from "./measured-spine.js";
import { mergeCut } from "./speaker-edl.js";
import { cutClock, sourceClock, takeWindow, keptSeconds, cutsKey, type TakeCut } from "./take-clock.js";
export { cutClock, sourceClock, takeWindow, keptSeconds, wordsThroughCuts, cutsKey, cutFileFor, type TakeCut } from "./take-clock.js";
import { resolveVideoPath } from "./video-path.js";
import { takeCopies, syncSpeakerClips } from "./speaker-layer.js";
import { probeMediaDuration } from "./auto-compress.js";
import { loadProject, saveProject } from "../persistence/project.js";

/** The shortest piece a take may be trimmed or cut down to. */
export const MIN_TAKE_SECONDS = 0.5;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Every file of the take that plays on its clock. */
export function takeFiles(take: Take): string[] {
  const c = takeCopies(take as any);
  const files = [c.raw, c.blur, c.alpha, ...Object.values(take.actors || {}).map((a) => a?.file)];
  return [...new Set(files.filter((f): f is string => !!f))];
}

// ── Edits (pure: change the take, nothing on disk) ──

/** Write the window down before an edit changes take.duration (which is
 *  the whole file's length on a take that was never trimmed), and mark the
 *  take as edited: from now on its clip's window follows the take. */
function pinWindow(take: Take): void {
  const w = takeWindow(take);
  take.trim_start = r3(w.start);
  take.trim_end = r3(w.end);
  take.edited = true;
}

/** Move the window's edges. `head` > 0 takes that many seconds off the
 *  start (< 0 gives them back), `tail` the same at the end -- in seconds of
 *  what PLAYS (the cut clock), so a drag on the lane is exact. `fileSeconds`
 *  bounds a give-back. */
export function trimTake(take: Take, head: number, tail: number, fileSeconds: number): { start: number; end: number } {
  pinWindow(take);
  const cuts = take.cuts || [];
  const w = takeWindow(take);
  const fileEnd = fileSeconds > 0 ? fileSeconds : Math.max(w.end, take.trim_end || 0);
  const a = cutClock(cuts, w.start) + (head || 0);
  const b = cutClock(cuts, w.end) - (tail || 0);
  let start = Math.max(0, sourceClock(cuts, Math.max(0, a)));
  let end = Math.min(fileEnd, sourceClock(cuts, Math.max(0, b)));
  if (cutClock(cuts, end) - cutClock(cuts, start) < MIN_TAKE_SECONDS) throw new Error(`a take can't be shorter than ${MIN_TAKE_SECONDS}s`);
  start = r3(start); end = r3(end);
  take.trim_start = start;
  take.trim_end = end;
  take.duration = keptSeconds(take);
  // A cut the window no longer reaches is dropped; one it now cuts across is kept.
  if (take.cuts) take.cuts = take.cuts.filter((c) => c.src_end > start && c.src_start < end);
  if (take.cuts && !take.cuts.length) delete take.cuts;
  return { start, end };
}

/** Cut a span of what the scene plays (scene seconds) out of the take. */
export function cutTake(take: Take, from: number, to: number): TakeCut {
  if (!(to - from > 0.05)) throw new Error("the cut is empty");
  pinWindow(take);
  const cuts = take.cuts || [];
  const w = takeWindow(take);
  const base = cutClock(cuts, w.start);
  const kept = keptSeconds(take);
  const f = Math.max(0, from), t = Math.min(kept, to);
  if (!(t - f > 0.05)) throw new Error("the cut is outside the take");
  if (kept - (t - f) < MIN_TAKE_SECONDS) throw new Error(`a take can't be cut below ${MIN_TAKE_SECONDS}s`);
  const add = { src_start: sourceClock(cuts, base + f), src_end: sourceClock(cuts, base + t) };
  // The end maps to the far side of any cut it touches: a cut abutting an
  // older one merges with it instead of leaving a sliver.
  take.cuts = mergeCut(cuts, add).map((c) => ({ src_start: r3(c.src_start), src_end: r3(c.src_end) }));
  take.duration = keptSeconds(take);
  return add;
}

/** Give a cut back. */
export function restoreTakeCut(take: Take, src_start: number, src_end: number): number {
  pinWindow(take);
  const cuts = take.cuts || [];
  const hit = cuts.find((c) => Math.abs(c.src_start - src_start) < 0.02 && Math.abs(c.src_end - src_end) < 0.02);
  if (!hit) throw new Error("no such cut on this take");
  take.cuts = cuts.filter((c) => c !== hit);
  if (!take.cuts.length) delete take.cuts;
  take.duration = keptSeconds(take);
  return r3(hit.src_end - hit.src_start);
}

// ── The bake ──

const dataDirOf = (dataDir?: string) => dataDir || process.env.MP_DATA_DIR || "/data/media-producer";

/** The cut copy's name: beside the file, keyed by the cut list. */
function cutNameOf(file: string, key: string): string {
  const m = file.match(/^(.*?)(\.[^./]+)?$/);
  const stem = (m ? m[1] : file).replace(/\.cut-[0-9a-f]{10}$/, "");
  const ext = m && m[2] ? m[2] : ".mp4";
  return `${stem}.cut-${key}${ext}`;
}

/** Make the cut copy of every file of the take that lacks a current one,
 *  and forget copies of older cut lists. Idempotent. Returns how many
 *  copies were made. */
export async function ensureTakeCutFiles(take: Take, dataDir?: string): Promise<number> {
  if (!take.cuts || !take.cuts.length) {
    if (take.cut_files) {
      for (const v of Object.values(take.cut_files)) await fs.rm(resolveVideoPath(v.file, dataDirOf(dataDir)), { force: true }).catch(() => {});
      delete take.cut_files;
    }
    return 0;
  }
  const key = cutsKey(take.cuts);
  const dd = dataDirOf(dataDir);
  const next: NonNullable<Take["cut_files"]> = {};
  let made = 0;
  for (const file of takeFiles(take)) {
    const abs = resolveVideoPath(file, dd);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) continue;
    const stamp = `${Math.round(stat.mtimeMs)}:${stat.size}`;
    const have = take.cut_files?.[file];
    const out = cutNameOf(file, key);
    const outAbs = resolveVideoPath(out, dd);
    if (have && have.cuts === key && have.stamp === stamp && (await fs.stat(outAbs).then((s) => s.size > 0, () => false))) {
      next[file] = have;
      continue;
    }
    await bakeCut(abs, outAbs, take.cuts);
    next[file] = { file: out, cuts: key, stamp };
    made++;
  }
  // Copies of an older cut list (or of a file the take no longer has) go.
  for (const [orig, v] of Object.entries(take.cut_files || {})) {
    if (next[orig]?.file === v.file) continue;
    await fs.rm(resolveVideoPath(v.file, dd), { force: true }).catch(() => {});
  }
  take.cut_files = next;
  return made;
}

async function hasAudio(abs: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", ["-hide_banner", "-i", abs]);
    let err = "";
    ff.stderr.on("data", (d) => { err += d; });
    ff.on("close", () => resolve(/Stream #.*: Audio:/.test(err)));
    ff.on("error", () => resolve(false));
  });
}

/** Re-encode the file without the cut spans: the kept pieces joined, a
 *  10 ms fade at each seam so the voice doesn't click. An alpha webm keeps
 *  its transparency. */
async function bakeCut(abs: string, outAbs: string, cuts: TakeCut[]): Promise<void> {
  const sorted = [...cuts].sort((a, b) => a.src_start - b.src_start);
  const pieces: Array<{ from: number; to?: number }> = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.src_start > cursor + 0.01) pieces.push({ from: cursor, to: c.src_start });
    cursor = Math.max(cursor, c.src_end);
  }
  pieces.push({ from: cursor });
  const audio = await hasAudio(abs);
  const alpha = /\.webm$/i.test(abs);
  const at = (p: { from: number; to?: number }) => `start=${p.from.toFixed(3)}${p.to != null ? `:end=${p.to.toFixed(3)}` : ""}`;
  const graph: string[] = [];
  pieces.forEach((p, i) => {
    graph.push(`[0:v]trim=${at(p)},setpts=PTS-STARTPTS[v${i}]`);
    if (audio) {
      const len = p.to != null ? p.to - p.from : 0;
      const fades = [i > 0 ? "afade=t=in:d=0.01" : "", p.to != null && len > 0.03 && i < pieces.length - 1 ? `afade=t=out:st=${(len - 0.01).toFixed(3)}:d=0.01` : ""].filter(Boolean);
      graph.push(`[0:a]atrim=${at(p)},asetpts=PTS-STARTPTS${fades.length ? "," + fades.join(",") : ""}[a${i}]`);
    }
  });
  graph.push(pieces.map((_, i) => `[v${i}]${audio ? `[a${i}]` : ""}`).join("") + `concat=n=${pieces.length}:v=1:a=${audio ? 1 : 0}[v]${audio ? "[a]" : ""}`);
  const enc = alpha
    ? ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "30", "-row-mt", "1", "-deadline", "realtime", "-cpu-used", "8"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
  const args = ["-y", "-hide_banner", "-loglevel", "error", ...(alpha ? ["-c:v", "libvpx-vp9"] : []), "-i", abs,
    "-filter_complex", graph.join(";"), "-map", "[v]", ...(audio ? ["-map", "[a]", "-c:a", alpha ? "libopus" : "aac", "-b:a", "192k"] : ["-an"]),
    ...enc, outAbs + ".part" + path.extname(outAbs)];
  await new Promise<void>((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let err = "";
    ff.stderr.on("data", (d) => { err += d; });
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`cutting ${path.basename(abs)} failed: ${err.slice(-300)}`))));
    ff.on("error", reject);
  });
  await fs.rename(outAbs + ".part" + path.extname(outAbs), outAbs);
}

/** Bring every cut take's copies up to date after a file of it changed (a
 *  re-grade, a new blur or alpha copy, a recast) and point the clips at
 *  them. The encode runs on a snapshot; the result lands on a fresh load,
 *  for takes whose cut list did not change meanwhile -- so a slow bake
 *  never overwrites an edit made while it ran. Returns copies made. */
export async function recutProjectTakes(tenant: string, projectId: string, dataDir?: string): Promise<number> {
  const snap = await loadProject(tenant, projectId);
  if (!snap) return 0;
  const done = new Map<string, { key: string; files: NonNullable<Take["cut_files"]> }>();
  let made = 0;
  for (const t of snap.takes || []) {
    if (!t.cuts || !t.cuts.length) continue;
    made += await ensureTakeCutFiles(t, dataDir);
    done.set(t.id, { key: cutsKey(t.cuts), files: t.cut_files || {} });
  }
  if (!made) return 0;
  const project = await loadProject(tenant, projectId);
  if (!project) return made;
  for (const t of project.takes || []) {
    const d = done.get(t.id);
    if (d && t.cuts && t.cuts.length && cutsKey(t.cuts) === d.key) t.cut_files = d.files;
  }
  syncSpeakerClips(project as any);
  await saveProject(project);
  return made;
}

/** The recording's full length (a trim may give back up to it). */
export async function takeFileSeconds(take: Take, dataDir?: string): Promise<number> {
  try { return await probeMediaDuration(resolveVideoPath(takeCopies(take as any).raw, dataDirOf(dataDir))); } catch { return 0; }
}

export type TakeEditOp =
  | { op: "trim"; head?: number; tail?: number }
  | { op: "cut"; from: number; to: number }
  | { op: "restore"; src_start: number; src_end: number };

export interface TakeEditResult {
  project: Project;
  scene_index: number;
  /** What the scene plays now. */
  seconds: number;
  /** Seconds the scene got shorter (negative: longer). */
  shortened: number;
  window: { start: number; end: number };
  cuts: TakeCut[];
}

/**
 * Trim, cut or restore the take of one scene, and everything that follows:
 * the cut copies, the clip's window, the scene's clock (re-timed against
 * what is left, so word anchors, captions and sound cues re-resolve). One
 * path for Studio and the MCP tool.
 */
export async function editSceneTake(tenant: string, projectId: string, sceneIndex: number, edit: TakeEditOp, dataDir?: string): Promise<TakeEditResult> {
  const first = await loadProject(tenant, projectId);
  if (!first) throw new Error("Project not found");
  const take0 = activeTake(first, sceneIndex);
  if (!take0) throw new Error(`scene ${sceneIndex + 1} has no take to edit`);
  const before = keptSeconds(take0);
  if (edit.op === "trim") {
    const head = Number(edit.head) || 0, tail = Number(edit.tail) || 0;
    if (!head && !tail) throw new Error("head or tail is required");
    trimTake(take0, head, tail, await takeFileSeconds(take0, dataDir));
  } else if (edit.op === "cut") {
    cutTake(take0, Number(edit.from), Number(edit.to));
  } else if (edit.op === "restore") {
    restoreTakeCut(take0, Number(edit.src_start), Number(edit.src_end));
  } else {
    throw new Error("op must be trim, cut or restore");
  }
  // The encode runs off the loaded copy; the edit lands on a fresh load.
  await ensureTakeCutFiles(take0, dataDir);
  const project = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const take = (project.takes || []).find((t) => t.id === take0.id);
  if (!take) throw new Error("the take changed while it was being edited -- try again");
  for (const k of ["trim_start", "trim_end", "duration", "edited", "cuts", "cut_files"] as const) {
    if ((take0 as any)[k] === undefined) delete (take as any)[k]; else (take as any)[k] = (take0 as any)[k];
  }
  // Back on the raw take first: a restore drops the cut copy the clip names
  // (no take would own it), and sync picks the copy the scene wants.
  for (const c of project.speaker_track?.clips || []) if (c.scene_index === sceneIndex) c.source = takeCopies(take as any).raw;
  syncSpeakerClips(project as any);
  // The scene's clock is what is left of the take.
  const seconds = keptSeconds(take);
  const rt = await retimeScene(project, sceneIndex, dataDir).catch(() => null);
  if (!rt || rt.spine.source !== "measured") {
    const sb = project.storyboard?.scenes?.[sceneIndex] as any;
    const built = project.scenes?.[sceneIndex] as any;
    if (sb) sb.duration_seconds = Math.round(seconds * 100) / 100;
    if (built) built.duration_seconds = Math.round(seconds * 100) / 100;
  }
  project.updated_at = new Date().toISOString();
  await saveProject(project);
  return { project, scene_index: sceneIndex, seconds, shortened: r3(before - seconds), window: takeWindow(take), cuts: take.cuts || [] };
}
