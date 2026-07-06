import type { MediaEdit, MediaSegment } from "./types.js";

/**
 * Media source-map (EDL) math, shared by every consumer:
 *  - render/capture frame swaps (which SOURCE frame shows at output time t)
 *  - the Studio preview (currentTime + playbackRate while playing)
 *  - the media lane UI (segment widths along the timeline)
 *
 * Output time is the media element's own playback clock (scene-local time
 * for videos that run from scene start). The map is deliberately dumb:
 * ordered segments, each playing source [src_start, src_end) at rate, then
 * FREEZE on the final frame when the map is exhausted.
 */

/** Sanitize: drop degenerate segments, clamp rate to something playable. */
export function normalizeSegments(segments: MediaSegment[]): MediaSegment[] {
  return (segments || [])
    .filter((s) => s && s.src_end > s.src_start)
    .map((s) => ({
      src_start: Math.max(0, s.src_start),
      src_end: s.src_end,
      rate: Math.min(16, Math.max(0.1, s.rate || 1)),
    }));
}

/** Total output-clock duration the map produces. */
export function edlOutputDuration(segments: MediaSegment[]): number {
  return normalizeSegments(segments).reduce(
    (sum, s) => sum + (s.src_end - s.src_start) / s.rate,
    0,
  );
}

/** Map an output time to the source time that should be showing.
 *  Past the end of the map, sticks to the last frame (freeze). */
export function mapSourceTime(segments: MediaSegment[], outputTime: number): number {
  const segs = normalizeSegments(segments);
  if (segs.length === 0) return outputTime;
  let acc = 0;
  for (const s of segs) {
    const outDur = (s.src_end - s.src_start) / s.rate;
    if (outputTime < acc + outDur) {
      return s.src_start + (outputTime - acc) * s.rate;
    }
    acc += outDur;
  }
  // Exhausted: freeze on the final frame (a hair before src_end so a frame
  // exists to seek to).
  return Math.max(segs[segs.length - 1].src_start, segs[segs.length - 1].src_end - 0.05);
}

/** The segment active at an output time (null once frozen). Used by the
 *  preview to set playbackRate while playing. */
export function activeSegmentAt(
  segments: MediaSegment[],
  outputTime: number,
): { segment: MediaSegment; index: number; outStart: number; outEnd: number } | null {
  const segs = normalizeSegments(segments);
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const outDur = (s.src_end - s.src_start) / s.rate;
    if (outputTime < acc + outDur) {
      return { segment: s, index: i, outStart: acc, outEnd: acc + outDur };
    }
    acc += outDur;
  }
  return null;
}

/** The JS source of mapSourceTime for injection into scene/preview runtime
 *  scripts (kept in one place so browser and Node never disagree). */
export const MAP_SOURCE_TIME_JS = `
function __mpMapSourceTime(segs, t) {
  if (!segs || !segs.length) return t;
  var acc = 0;
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    var rate = Math.min(16, Math.max(0.1, s.rate || 1));
    if (s.src_end <= s.src_start) continue;
    var outDur = (s.src_end - s.src_start) / rate;
    if (t < acc + outDur) return s.src_start + (t - acc) * rate;
    acc += outDur;
  }
  var last = segs[segs.length - 1];
  return Math.max(last.src_start, last.src_end - 0.05);
}`;

/** Parse a data-mp-edl attribute value; null on anything malformed. */
export function parseEdlAttr(raw: string | null | undefined): MediaSegment[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const segs = normalizeSegments(parsed);
    return segs.length ? segs : null;
  } catch {
    return null;
  }
}

export type { MediaEdit, MediaSegment };
