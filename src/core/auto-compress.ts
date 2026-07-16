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
import { solveMediaEdits } from "./media-edl.js";
import { resolveVideoPath } from "./video-path.js";
import type { Scene, SceneComponent } from "./types.js";

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
      const det = await detectIdleRanges(videoPath, minIdle, -40);
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
