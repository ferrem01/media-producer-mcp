/**
 * Recorder events sidecar (`<video>.events.json`) -- ground truth captured by
 * the Quotient Recorder extension at record time (SPEC-recorder.md).
 *
 * The speaker-screencast grammar otherwise reverse-engineers semantics from
 * pixels (motion-profile idle detection, seam detection, vision grounding).
 * When a recording carries this sidecar, the browser has already told us the
 * truth: where the user clicked (and on WHAT), when pages changed, and when
 * nothing was happening. This module converts the sidecar into the same
 * motion-intel shape the heuristics produce, so the whole pipeline (idle
 * compression, chapter pins, future callouts) upgrades without changing.
 *
 * All sidecar timestamps are milliseconds on the recording clock.
 */

import fs from "node:fs/promises";

export interface RecorderClick {
  t: number;
  x: number;
  y: number;
  /** Bounding box of the clicked element, recording pixels. */
  box?: { x: number; y: number; w: number; h: number };
  /** Accessible name / visible label of the target. */
  label?: string;
  role?: string;
  /** CSS viewport size at click time -- boxes are CSS px relative to this
   *  (the recording itself may be at devicePixelRatio scale). */
  viewport?: { w: number; h: number };
}

export interface RecorderEvents {
  version: 1;
  recording: {
    width: number;
    height: number;
    fps?: number;
    url?: string;
    startedAt?: string;
    durationMs?: number;
  };
  clicks?: RecorderClick[];
  inputs?: Array<{ t: number; kind: string; box?: { x: number; y: number; w: number; h: number }; label?: string }>;
  navigations?: Array<{ t: number; url?: string; title?: string }>;
  /** Stretches with no input and no meaningful DOM mutations. */
  mutationsIdle?: Array<{ from: number; to: number }>;
  /** User hotkey chapter marks. */
  chapters?: Array<{ t: number; label?: string }>;
  retakes?: Array<{ cutFrom: number; cutTo: number }>;
}

export const eventsSidecarPath = (videoPath: string) => videoPath + ".events.json";

export async function loadRecorderEvents(videoPath: string): Promise<RecorderEvents | null> {
  try {
    const ev = JSON.parse(await fs.readFile(eventsSidecarPath(videoPath), "utf-8"));
    return ev && ev.version === 1 && ev.recording ? (ev as RecorderEvents) : null;
  } catch {
    return null;
  }
}

export async function saveRecorderEvents(videoPath: string, events: RecorderEvents): Promise<void> {
  await fs.writeFile(eventsSidecarPath(videoPath), JSON.stringify(events, null, 2), "utf-8");
}

export interface SidecarMotionIntel {
  idle: { ranges: Array<{ start: number; end: number }>; duration: number };
  transitions: number[];
  focus: Array<{ start: number; end: number; x: number; y: number; w: number; h: number }>;
}

/**
 * Sidecar -> motion intel, PURE (exported for tests). Produces exactly the
 * shape the pixel heuristics produce, from truth instead of inference:
 * - idle ranges  <- mutationsIdle spans (>= minIdle seconds, merged, clipped)
 * - transitions  <- navigation timestamps (deduped inside 3s)
 * - focus events <- clicked-element boxes (frame fractions), a short window
 *   around each click
 */
export function eventsToMotionIntel(
  events: RecorderEvents,
  durationSec: number,
  minIdleSeconds = 2,
): SidecarMotionIntel {
  const dur = durationSec > 0 ? durationSec : (events.recording.durationMs || 0) / 1000;

  // Idle: ms -> s, clip to the clip, drop slivers, merge overlaps/adjacency.
  const rawIdle = (events.mutationsIdle || [])
    .map((r) => ({ start: Math.max(0, r.from / 1000), end: Math.min(dur, r.to / 1000) }))
    .filter((r) => r.end - r.start >= minIdleSeconds)
    .sort((a, b) => a.start - b.start);
  const ranges: Array<{ start: number; end: number }> = [];
  for (const r of rawIdle) {
    const last = ranges[ranges.length - 1];
    if (last && r.start <= last.end + 0.25) last.end = Math.max(last.end, r.end);
    else ranges.push({ start: Math.round(r.start * 10) / 10, end: Math.round(r.end * 10) / 10 });
  }

  // Transitions: navigation moments, deduped (multi-step redirects collapse).
  const transitions: number[] = [];
  for (const n of (events.navigations || []).slice().sort((a, b) => a.t - b.t)) {
    const s = Math.round((n.t / 1000) * 10) / 10;
    if (s <= 0.5 || s >= dur - 2) continue;
    const last = transitions[transitions.length - 1];
    if (last === undefined || s - last >= 3) transitions.push(s);
  }

  // Focus: the clicked element's box, as frame fractions, briefly around the
  // click -- the deterministic seed for callouts/punch-ins. Boxes are CSS px
  // relative to the click's viewport (preferred: fractions transfer to the
  // capture regardless of devicePixelRatio); recording dims are the fallback.
  const focus = (events.clicks || [])
    .filter((c) => c.box && c.box.w > 4 && c.box.h > 4)
    .map((c) => {
      const W = c.viewport?.w || events.recording.width || 1;
      const H = c.viewport?.h || events.recording.height || 1;
      return {
        start: Math.max(0, Math.round((c.t / 1000 - 0.5) * 10) / 10),
        end: Math.min(dur, Math.round((c.t / 1000 + 1.5) * 10) / 10),
        x: Math.round((c.box!.x / W) * 1000) / 1000,
        y: Math.round((c.box!.y / H) * 1000) / 1000,
        w: Math.round((c.box!.w / W) * 1000) / 1000,
        h: Math.round((c.box!.h / H) * 1000) / 1000,
      };
    })
    .filter((f) => f.end > f.start && f.x >= 0 && f.y >= 0 && f.x + f.w <= 1.01 && f.y + f.h <= 1.01);

  return { idle: { ranges, duration: dur }, transitions, focus };
}
