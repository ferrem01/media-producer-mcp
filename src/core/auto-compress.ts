/**
 * Auto-propose "compress the waiting" as a scene media-EDL.
 *
 * The manual Studio flow (POST /api/compress-waiting) makes the user click a
 * button per screencast. This runs the SAME detection + solver the moment a
 * screencast lands in a scene, and attaches the result as a PROPOSED media-edit
 * so Studio opens with the dead-air already time-lapsed on the timeline --
 * "the machine proposes the cut, the human owns it". Every segment stays fully
 * editable (slice / speed / hold / cut) and `proposed:true` lets the UI badge
 * it and offer a one-click revert-to-raw.
 *
 * Best-effort: any detection/decoding failure is swallowed so adding a scene
 * never fails because of the compressor.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectIdleRanges } from "./compress-waiting.js";
import { loadAssetIntel } from "./asset-intel.js";
import { solveMediaEdits, mapSourceTime } from "./media-edl.js";
import { resolveVideoPath } from "./video-path.js";
import type { Scene, SceneComponent, MediaPin } from "./types.js";

const execFileAsync = promisify(execFile);

/** Duration of a media file in seconds (video OR audio). 0 on failure. */
export async function probeMediaDuration(src: string, dataDir?: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0",
      resolveVideoPath(src, dataDir),
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;

/** The screencast video sources in a scene, paired with the media-edits target
 *  key the render/Studio use. The primary screencast maps to "screencast" (the
 *  render resolves it to the largest non-speaker video); additional videos are
 *  keyed by a src-substring selector so several clips can each carry edits. */
export function findSceneScreencasts(scene: Scene): { target: string; src: string }[] {
  const out: { target: string; src: string }[] = [];
  const comps = (scene.components || []) as SceneComponent[];
  for (const c of comps) {
    const data = (c?.data || {}) as Record<string, unknown>;
    const raw = data.video_url ?? data.source ?? data.src;
    if (typeof raw !== "string" || !VIDEO_RE.test(raw)) continue;
    // Never treat the speaker-track PiP token as a compressible source.
    if (raw === "speaker") continue;
    const target = out.length === 0 ? "screencast" : `video[src*="${raw.split("/").pop()}"]`;
    if (!out.some((o) => o.src === raw)) out.push({ target, src: raw });
  }
  return out;
}

export interface ProposeResult {
  applied: Array<{ target: string; source_duration: number; output_duration: number; idle_ranges: number; idle_rate: number }>;
  /** The duration the scene was set to (compressed length, or the fit target). */
  scene_duration?: number;
}

/**
 * Attach proposed compress-the-waiting media-edits to every screencast in the
 * scene that doesn't already carry an edit for that target, and shrink the
 * scene to the compressed length so there is NO frozen tail. Mutates `scene`.
 * Never throws.
 *
 * When `targetDuration` is given (e.g. the narration length) and the active
 * content fits inside it, the idle rate is SOLVED so the compressed video
 * lands on that duration -- gentler than a fixed 8x and perfectly matched to
 * the voiceover -- instead of over-compressing and leaving a hold at the end.
 */
export async function proposeSceneCompression(
  scene: Scene,
  opts?: { idleRate?: number; minIdle?: number; dataDir?: string; targetDuration?: number },
): Promise<ProposeResult> {
  const minIdle = opts?.minIdle ?? 2;
  const applied: ProposeResult["applied"] = [];
  const result: ProposeResult = { applied };
  const targets = findSceneScreencasts(scene);
  if (!targets.length) return result;

  const edits: Record<string, any> = ((scene as any).media_edits ||= {});
  let primaryOutput: number | null = null;
  for (const { target, src } of targets) {
    // Don't clobber edits the user (or a prior pass) already made.
    if (edits[target] && Array.isArray(edits[target].segments) && edits[target].segments.length) continue;
    try {
      const videoPath = resolveVideoPath(src, opts?.dataDir);
      // Prefer the idle scan cached at ingest (instant); fall back to a live
      // decode when there's no sidecar (asset predates the cache).
      const cached = await loadAssetIntel(videoPath).catch(() => null);
      const det = cached?.idle?.ranges?.length
        ? { ranges: cached.idle.ranges as Array<{ start: number; end: number }>, duration: cached.idle.duration }
        : await detectIdleRanges(videoPath, minIdle, -40);
      if (!det.ranges.length) continue; // nothing dead to compress
      const idleTotal = det.ranges.reduce((t, r) => t + (r.end - r.start), 0);
      const activeTotal = Math.max(0, det.duration - idleTotal);
      // Pick the idle rate: fit the output to targetDuration when feasible,
      // else the default timelapse rate.
      let rate = opts?.idleRate ?? 8;
      if (opts?.targetDuration && opts.targetDuration > activeTotal + 0.5 && idleTotal > 0.5) {
        rate = idleTotal / (opts.targetDuration - activeTotal);
        rate = Math.min(16, Math.max(1.2, Math.round(rate * 100) / 100));
      }
      const rate_regions = det.ranges.map((r) => ({ src_start: r.start, src_end: r.end, rate }));
      const solved = solveMediaEdits({ cuts: [], pins: [], rate_regions }, det.duration);
      edits[target] = {
        segments: solved.segments,
        pins: [],
        cuts: [],
        rate_regions,
        pin_status: solved.pin_status,
        proposed: true, // auto -- Studio badges it and offers revert-to-raw
      };
      const outDur = solved.segments.reduce((s, g) => s + (g.src_end - g.src_start) / g.rate, 0);
      if (primaryOutput === null) primaryOutput = outDur;
      applied.push({
        target,
        source_duration: Math.round(det.duration * 10) / 10,
        output_duration: Math.round(outDur * 10) / 10,
        idle_ranges: det.ranges.length,
        idle_rate: Math.round(rate * 100) / 100,
      });
    } catch {
      // best-effort: skip this target, keep the scene addable
    }
  }
  // Kill the frozen tail: the scene ends when the (primary) compressed video
  // ends -- or exactly on the fit target when we solved for one.
  if (primaryOutput !== null) {
    const dur = opts?.targetDuration && opts.targetDuration > 0.5 ? opts.targetDuration : primaryOutput;
    scene.duration_seconds = Math.round(dur * 10) / 10;
    result.scene_duration = scene.duration_seconds;
  }
  return result;
}

// ── Chapter pins ────────────────────────────────────────────────────────────
// The audio gives chapter boundaries; the footage's own hard visual
// transitions (page changes, from the same motion profile as idle detection)
// give snap points. A pin at each confident match makes the sync SEMANTIC --
// "when the narrator starts chapter 3, the screencast shows chapter 3's
// screen" -- instead of merely durational, and drift stops accumulating
// across chapters. Pins are first-class media-edit intents: visible and
// draggable in Studio's media lane, so the machine proposes and the human
// owns the last 10%.

export interface ChapterPinInput {
  /** Scene-local output second where the chapter starts. */
  out: number;
  /** Label shown on the pin in Studio (the chapter title). */
  label?: string;
}

/**
 * Plan pins for chapter boundaries -- PURE (exported for tests).
 *
 * ITERATIVE refinement, not a single pass: the proportional guess for a
 * boundary drifts with every un-modeled pause and pace change before it, so
 * a fixed window around the raw guess misses seams that are actually
 * correct (measured Δ19s on two of three boundaries of the newsletter
 * walkthrough). Instead: start from the end-pin (source end lands on scene
 * end), then repeatedly (1) re-solve the map with the pins so far, (2)
 * recompute every unpinned boundary's guess on the CORRECTED map, (3) pin
 * the single most confident seam match. Each accepted pin re-anchors the
 * map, pulling the remaining guesses toward truth.
 *
 * Still conservative: a boundary with no seam inside the window gets no
 * pin, monotonicity is enforced, and a pin whose solve comes back strained
 * is discarded permanently.
 */
export function planChapterPins(
  chapters: ChapterPinInput[],
  rateRegions: Array<{ src_start: number; src_end: number; rate: number }>,
  transitions: number[],
  srcDur: number,
  sceneDur: number,
  opts?: { snapWindow?: number; minSpacing?: number },
): MediaPin[] {
  const snapWindow = opts?.snapWindow ?? 6;
  const minSpacing = opts?.minSpacing ?? 4;

  // Boundaries eligible at all (edges are governed by the implicit opening
  // anchor / end pin).
  const candidates = chapters
    .filter((ch) => ch.out >= 3 && ch.out <= sceneDur - 5)
    .map((ch) => ({ ...ch, out: Math.round(ch.out * 100) / 100 }));
  if (!candidates.length) return [];

  const endPin: MediaPin = { out: Math.round(sceneDur * 100) / 100, src: srcDur, word: "end" };
  const pins: MediaPin[] = [endPin];
  const discarded = new Set<number>();
  const solve = () => solveMediaEdits({ cuts: [], rate_regions: rateRegions, pins }, srcDur);
  let solved = solve();

  const monotonicOk = (out: number, src: number) => {
    for (const p of pins) {
      if (out < p.out !== src < p.src) return false; // order must agree on both axes
      if (Math.abs(out - p.out) < minSpacing || Math.abs(src - p.src) < minSpacing) return false;
    }
    return true;
  };

  for (let iter = 0; iter < candidates.length; iter++) {
    // Best remaining match on the current (re-anchored) map.
    let best: { ch: ChapterPinInput; src: number; delta: number } | null = null;
    for (const ch of candidates) {
      if (discarded.has(ch.out) || pins.some((p) => p.out === ch.out)) continue;
      const guess = mapSourceTime(solved.segments, ch.out);
      for (const t of transitions) {
        const delta = Math.abs(t - guess);
        if (delta > snapWindow) continue;
        if (t <= 0.5 || t >= srcDur - minSpacing) continue;
        if (!monotonicOk(ch.out, t)) continue;
        if (!best || delta < best.delta) best = { ch, src: t, delta };
      }
    }
    if (!best) break;

    const pin: MediaPin = {
      out: best.ch.out,
      src: best.src,
      ...(best.ch.label ? { word: best.ch.label } : {}),
    };
    pins.push(pin);
    pins.sort((a, b) => a.out - b.out);
    const trial = solve();
    if (trial.pin_status.some((p) => p.status !== "ok")) {
      // This pin makes the map infeasible -- drop it for good and keep going.
      pins.splice(pins.indexOf(pin), 1);
      discarded.add(best.ch.out);
      continue;
    }
    solved = trial;
  }

  // Only the end pin survived: nothing was confidently matched -- report none.
  if (pins.length === 1) return [];
  return pins;
}

export interface ChapterPinResult {
  pinned: number;
  dropped: number;
  pin_status?: Array<{ out: number; status: string; detail?: string }>;
}

/**
 * Snap the scene's primary screencast to its chapter boundaries. Requires a
 * prior proposeSceneCompression (uses its rate_regions as the elastic
 * preferences between pins). Strained pins are dropped and the solve rerun --
 * conservative by design. Mutates the scene's media_edits. Never throws.
 */
export async function proposeChapterPins(
  scene: Scene,
  chapters: ChapterPinInput[],
  opts?: { dataDir?: string },
): Promise<ChapterPinResult> {
  const none: ChapterPinResult = { pinned: 0, dropped: 0 };
  try {
    const [primary] = findSceneScreencasts(scene);
    const edit = primary && (scene as any).media_edits?.[primary.target];
    if (!edit || !Array.isArray(edit.segments) || !edit.segments.length) return none;
    if (Array.isArray(edit.pins) && edit.pins.length) return none; // human already pinned

    const videoPath = resolveVideoPath(primary.src, opts?.dataDir);
    const { ensureMotionIntel } = await import("./asset-intel.js");
    const { transitions, duration: srcDur } = await ensureMotionIntel(videoPath);
    if (!transitions.length || !srcDur) {
      console.log(`  Chapter pins: no transitions detected in ${primary.src.split("/").pop()} -- skipping`);
      return none;
    }

    const sceneDur = scene.duration_seconds || 0;
    // Per-boundary diagnostics: the RAW guess vs nearest seam. The planner
    // refines these iteratively (each accepted pin re-anchors the map), so a
    // big raw delta can still end up pinned -- this line shows the starting
    // point.
    for (const ch of chapters) {
      if (ch.out < 3 || ch.out > sceneDur - 5) continue;
      const guess = mapSourceTime(edit.segments as any, ch.out);
      const nearest = transitions.reduce(
        (b: number | null, t: number) => (b === null || Math.abs(t - guess) < Math.abs(b - guess) ? t : b),
        null,
      );
      console.log(
        `  Chapter pins: "${(ch.label || "").slice(0, 30)}" out=${ch.out.toFixed(1)}s raw guess=src ${guess.toFixed(1)}s, nearest seam ${nearest === null ? "none" : `${nearest.toFixed(1)}s (Δ${Math.abs(nearest - guess).toFixed(1)}s)`}`,
      );
    }

    const rate_regions = edit.rate_regions || [];
    const pins = planChapterPins(chapters, rate_regions, transitions, srcDur, sceneDur);
    if (!pins.length) {
      console.log(`  Chapter pins: no confident matches (${transitions.length} seams available) -- leaving unpinned`);
      return none;
    }
    const solved = solveMediaEdits({ cuts: edit.cuts || [], rate_regions, pins }, srcDur);
    if (solved.pin_status.some((p) => p.status !== "ok")) return none; // planner guarantees ok; belt-and-suspenders

    const chapterPinCount = pins.filter((p) => p.word !== "end").length;
    console.log(
      `  Chapter pins: pinned ${chapterPinCount}/${chapters.filter((c) => c.out >= 3 && c.out <= sceneDur - 5).length} boundaries: ${pins.filter((p) => p.word !== "end").map((p) => `${p.out.toFixed(0)}s->src ${p.src.toFixed(0)}s`).join(", ")}`,
    );
    edit.pins = pins;
    edit.segments = solved.segments;
    edit.pin_status = solved.pin_status;
    edit.proposed = true;
    return { pinned: pins.length, dropped: 0, pin_status: solved.pin_status };
  } catch {
    return none;
  }
}
