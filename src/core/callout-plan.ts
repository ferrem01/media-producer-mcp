/**
 * Auto-callouts: point at the thing the narrator is talking about.
 *
 * The narration says WHEN ("now click Broadcasts..."), the footage's own
 * localized activity says WHERE (the focus events from the motion profile:
 * concentrated change in one small region -- a field being typed into, a
 * button being clicked). A callout is proposed only when both agree: an
 * action-cue sentence whose moment, mapped through the (pinned) media map,
 * lands on a concentrated focus event. screencast-frame already renders
 * callouts (region glow + lift toward camera), so proposals are pure data --
 * and editable in Studio like any component prop.
 *
 * Same philosophy as pins: propose few, propose confident.
 */

import { mapSourceTime, type MediaSegment } from "./media-edl.js";
import type { FocusEvent } from "./compress-waiting.js";

export interface CalloutCaption {
  text: string;
  /** Scene-local seconds. */
  start: number;
  end: number;
}

export interface PlannedCallout {
  at: number;
  dur: number;
  /** Percent coordinates of the displayed content box (screencast-frame's
   *  callout coordinate space). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sentences that name a concrete on-screen action. */
const CUE_RE = /\b(click(?:s|ing)?|select(?:s|ing)?|open(?:s|ing)?|choos(?:e|es|ing)|press(?:es|ing)?|typ(?:e|es|ing)|enter(?:s|ing)?|tap(?:s|ping)?|toggl(?:e|es|ing)|drag(?:s|ging)?|edit(?:s|ing)?|submit(?:s|ting)?|sav(?:e|es|ing)|schedul(?:e|es|ing)|creat(?:e|es|ing)|add(?:s|ing)?)\b/i;

export function planCallouts(
  captions: CalloutCaption[],
  chapterMoments: Array<{ at: number }>,
  segments: MediaSegment[],
  focus: FocusEvent[],
  sceneDur: number,
  opts?: { maxCallouts?: number; minSpacing?: number; matchWindow?: number },
): PlannedCallout[] {
  const maxCallouts = opts?.maxCallouts ?? 6;
  const minSpacing = opts?.minSpacing ?? 18;
  const matchWindow = opts?.matchWindow ?? 2.5;
  const out: PlannedCallout[] = [];

  for (const cap of captions) {
    if (out.length >= maxCallouts) break;
    if (!CUE_RE.test(cap.text)) continue;
    const at = Math.max(0.2, cap.start);
    if (at < 4 || at > sceneDur - 8) continue;
    // Not while a chapter card owns the frame.
    if (chapterMoments.some((c) => Math.abs(c.at - at) < 5)) continue;
    const prev = out[out.length - 1];
    if (prev && at - prev.at < minSpacing) continue;

    // The moment the sentence lands, where is the source clock -- and is
    // there concentrated activity there?
    const srcT = mapSourceTime(segments, at + 0.5);
    let best: FocusEvent | null = null;
    let bestDist = Infinity;
    for (const f of focus) {
      const dist = srcT < f.start - matchWindow ? Infinity
        : srcT > f.end + matchWindow ? Infinity
        : srcT < f.start ? f.start - srcT
        : srcT > f.end ? srcT - f.end
        : 0;
      if (dist < bestDist) { bestDist = dist; best = f; }
    }
    if (!best) continue;

    // Frame fractions -> padded percent box, clamped sane.
    const pad = 0.035;
    const x = Math.max(0, (best.x - pad)) * 100;
    const y = Math.max(0, (best.y - pad)) * 100;
    let w = Math.min(0.62, best.w + pad * 2) * 100;
    let h = Math.min(0.56, best.h + pad * 2) * 100;
    w = Math.max(14, Math.min(w, 100 - x));
    h = Math.max(12, Math.min(h, 100 - y));

    out.push({
      at: Math.round(at * 100) / 100,
      dur: Math.round(Math.min(6, Math.max(3.5, cap.end - cap.start)) * 10) / 10,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
    });
  }
  return out;
}
