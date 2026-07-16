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

import { detectIdleRanges } from "./compress-waiting.js";
import { solveMediaEdits, inferIntents } from "./media-edl.js";
import { resolveVideoPath } from "./video-path.js";
import type { Scene, SceneComponent } from "./types.js";

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
  applied: Array<{ target: string; source_duration: number; output_duration: number; idle_ranges: number }>;
}

/**
 * Attach proposed compress-the-waiting media-edits to every screencast in the
 * scene that doesn't already carry an edit for that target. Mutates
 * `scene.media_edits`. Never throws.
 */
export async function proposeSceneCompression(
  scene: Scene,
  opts?: { idleRate?: number; minIdle?: number; dataDir?: string },
): Promise<ProposeResult> {
  const idleRate = opts?.idleRate ?? 8;
  const minIdle = opts?.minIdle ?? 2;
  const applied: ProposeResult["applied"] = [];
  const targets = findSceneScreencasts(scene);
  if (!targets.length) return { applied };

  const edits: Record<string, any> = ((scene as any).media_edits ||= {});
  for (const { target, src } of targets) {
    // Don't clobber edits the user (or a prior pass) already made.
    if (edits[target] && Array.isArray(edits[target].segments) && edits[target].segments.length) continue;
    try {
      const videoPath = resolveVideoPath(src, opts?.dataDir);
      const det = await detectIdleRanges(videoPath, minIdle, -40);
      if (!det.ranges.length) continue; // nothing dead to compress
      const intents = inferIntents(edits[target] || { segments: [] }, det.duration);
      intents.rate_regions = [];
      for (const r of det.ranges) intents.rate_regions.push({ src_start: r.start, src_end: r.end, rate: idleRate });
      const solved = solveMediaEdits(intents, det.duration);
      edits[target] = {
        segments: solved.segments,
        pins: intents.pins || [],
        cuts: intents.cuts || [],
        rate_regions: intents.rate_regions,
        pin_status: solved.pin_status,
        proposed: true, // auto -- Studio badges it and offers revert-to-raw
      };
      const outDur = solved.segments.reduce((s, g) => s + (g.src_end - g.src_start) / g.rate, 0);
      applied.push({
        target,
        source_duration: Math.round(det.duration * 10) / 10,
        output_duration: Math.round(outDur * 10) / 10,
        idle_ranges: det.ranges.length,
      });
    } catch {
      // best-effort: skip this target, keep the scene addable
    }
  }
  return { applied };
}
