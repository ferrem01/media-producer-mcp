/**
 * Beat utilities — the film layer's "cut = new world, beat = new thought" model.
 *
 * A scene is ONE persistent world; beats are the moments the idea advances
 * inside it. The storyboard authors beats (in bars when a music grid exists),
 * this module normalizes them into a valid seconds-based timeline that exactly
 * fills the scene, and downstream consumers derive from it:
 *   - codegen gets a formatted BEAT SHEET (formatBeatSheet)
 *   - the critique loop samples frames at beat midpoints (beatMidpoints)
 *   - the runtime ctx exposes beat offsets to component timelines (beatTimeline)
 */

import type { SceneBeat } from "./types.js";

/** A beat with its resolved position on the scene timeline. */
export interface TimedBeat extends SceneBeat {
  start_seconds: number;
  end_seconds: number;
}

/**
 * Normalize raw storyboard beats into a clean SceneBeat[] that sums EXACTLY to
 * the scene duration.
 *
 * Accepts the shapes the storyboard LLM realistically emits:
 *   - duration_bars (preferred when a music grid exists) -> converted via barSec
 *   - duration_seconds
 *   - neither -> beats share the scene duration equally
 *
 * Then rescales proportionally so the beats fill the scene exactly (scene
 * durations get quantized to the bar grid AFTER storyboarding, so beats must
 * follow the scene, not the other way around). Returns undefined when the
 * input has fewer than 2 usable beats -- a one-beat scene is just a scene.
 */
export function normalizeBeats(
  rawBeats: unknown,
  sceneDurationSeconds: number,
  barSec?: number,
): SceneBeat[] | undefined {
  if (!Array.isArray(rawBeats) || !(sceneDurationSeconds > 0)) return undefined;

  const beats: SceneBeat[] = [];
  for (const raw of rawBeats) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    const action = typeof b.action === "string" && b.action.trim() ? b.action.trim()
      : typeof b.description === "string" && b.description.trim() ? (b.description as string).trim()
      : "";
    if (!action) continue; // a beat with no action is unverifiable and unbuildable
    const label = typeof b.label === "string" && b.label.trim() ? b.label.trim() : `beat ${beats.length + 1}`;
    let dur = 0;
    if (typeof b.duration_bars === "number" && b.duration_bars > 0 && barSec && barSec > 0) {
      dur = b.duration_bars * barSec;
    } else if (typeof b.duration_seconds === "number" && b.duration_seconds > 0) {
      dur = b.duration_seconds;
    }
    const vo = typeof b.voiceover_text === "string" && b.voiceover_text.trim() ? b.voiceover_text.trim() : undefined;
    beats.push({ label, duration_seconds: dur, action, voiceover_text: vo });
  }
  if (beats.length < 2) return undefined;

  // Fill in missing durations with the average of the stated ones (or an equal
  // share when none are stated), then rescale everything proportionally so the
  // beats sum EXACTLY to the scene duration.
  const stated = beats.filter((b) => b.duration_seconds > 0);
  const fallback = stated.length > 0
    ? stated.reduce((s, b) => s + b.duration_seconds, 0) / stated.length
    : sceneDurationSeconds / beats.length;
  for (const b of beats) if (!(b.duration_seconds > 0)) b.duration_seconds = fallback;

  rescaleBeats(beats, sceneDurationSeconds);
  return beats;
}

/**
 * Proportionally rescale beats to sum exactly to `targetSeconds`. Used at
 * normalization and again after the scene's duration is quantized to the music
 * bar grid. Keeps every beat >= 0.5s (a shorter beat can't read as a thought).
 */
export function rescaleBeats(beats: SceneBeat[], targetSeconds: number): void {
  if (!beats.length || !(targetSeconds > 0)) return;
  const sum = beats.reduce((s, b) => s + b.duration_seconds, 0);
  if (!(sum > 0)) {
    for (const b of beats) b.duration_seconds = targetSeconds / beats.length;
  } else {
    const k = targetSeconds / sum;
    for (const b of beats) b.duration_seconds = Math.max(0.5, b.duration_seconds * k);
  }
  // Fix rounding drift on the longest beat so the sum is exact.
  for (const b of beats) b.duration_seconds = Math.round(b.duration_seconds * 100) / 100;
  const drift = Math.round((targetSeconds - beats.reduce((s, b) => s + b.duration_seconds, 0)) * 100) / 100;
  if (drift !== 0) {
    const longest = beats.reduce((a, b) => (b.duration_seconds > a.duration_seconds ? b : a));
    longest.duration_seconds = Math.round((longest.duration_seconds + drift) * 100) / 100;
  }
}

/** Resolve beats into (start, end) positions on the scene timeline. */
export function beatTimeline(beats: SceneBeat[]): TimedBeat[] {
  const out: TimedBeat[] = [];
  let t = 0;
  for (const b of beats) {
    const start = Math.round(t * 100) / 100;
    const end = Math.round((t + b.duration_seconds) * 100) / 100;
    out.push({ ...b, start_seconds: start, end_seconds: end });
    t = end;
  }
  return out;
}

/** Midpoint timestamps of each beat — where the beat's content should be fully
 *  on screen. The critique contact sheet samples these. */
export function beatMidpoints(beats: SceneBeat[]): number[] {
  return beatTimeline(beats).map((b) => Math.round(((b.start_seconds + b.end_seconds) / 2) * 100) / 100);
}

/**
 * Format beats as the BEAT SHEET block of the codegen spec: an explicit shot
 * clock the scene's master timeline must follow.
 */
export function formatBeatSheet(beats: SceneBeat[]): string {
  const timed = beatTimeline(beats);
  const lines: string[] = [
    `## Beat Sheet (the scene's internal timeline -- follow it EXACTLY)`,
    `This scene is ONE CONTINUOUS TAKE with ${timed.length} beats. It is a single persistent world: elements from one beat MORPH, MOVE, and RE-LIGHT into the next -- never tear the world down and rebuild it between beats. Each beat below is a segment of the master timeline:`,
    ``,
  ];
  for (let i = 0; i < timed.length; i++) {
    const b = timed[i];
    lines.push(`BEAT ${i + 1} "${b.label}" (${b.start_seconds.toFixed(1)}s -> ${b.end_seconds.toFixed(1)}s): ${b.action}${b.voiceover_text ? ` [VO: "${b.voiceover_text}"]` : ""}`);
  }
  lines.push(
    ``,
    `Beat rules:`,
    `- Call tl.addLabel('beat_${"N"}', <start>) at each beat's start time (beat_1 at ${timed[0].start_seconds.toFixed(1)}, beat_2 at ${timed[1].start_seconds.toFixed(1)}, ...).`,
    `- Every beat MUST produce a clearly visible change in the frame (something enters, transforms, or re-arranges). A beat where nothing visibly happens is a defect.`,
    `- Elements PERSIST across beats by default. Move/scale/morph existing elements to make room for new ones instead of fading everything out.`,
    `- The beat boundaries above are cut points on the music grid -- land the beat's main visual arrival ON its start time, not vaguely after it.`,
  );
  return lines.join("\n");
}

/** Concatenate per-beat narration into a single scene voiceover script. */
export function beatsVoiceover(beats: SceneBeat[]): string | undefined {
  const parts = beats.map((b) => b.voiceover_text).filter((v): v is string => !!v);
  return parts.length > 0 ? parts.join(" ") : undefined;
}
