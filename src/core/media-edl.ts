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

/** A freeze/hold segment: holds frame `src_start` for `hold` OUTPUT seconds,
 *  source clock parked (a TRUE freeze, not slow playback). */
export function isHoldSegment(s: MediaSegment): boolean {
  return typeof s.hold === "number" && s.hold > 0;
}

/** Output-clock duration a single segment occupies. */
function segOutDur(s: MediaSegment): number {
  return isHoldSegment(s) ? s.hold! : (s.src_end - s.src_start) / s.rate;
}

/** Sanitize: keep hold segments (frame freezes), drop other degenerate
 *  segments, clamp rate to something playable. */
export function normalizeSegments(segments: MediaSegment[]): MediaSegment[] {
  return (segments || [])
    .filter((s) => s && (isHoldSegment(s) || s.src_end > s.src_start))
    .map((s) =>
      isHoldSegment(s)
        ? { src_start: Math.max(0, s.src_start), src_end: Math.max(0, s.src_start), rate: 0, hold: s.hold }
        : {
            src_start: Math.max(0, s.src_start),
            src_end: s.src_end,
            rate: Math.min(16, Math.max(0.1, s.rate || 1)),
          },
    );
}

/** Total output-clock duration the map produces. */
export function edlOutputDuration(segments: MediaSegment[]): number {
  return normalizeSegments(segments).reduce((sum, s) => sum + segOutDur(s), 0);
}

/** Map an output time to the source time that should be showing.
 *  Past the end of the map, sticks to the last frame (freeze). */
export function mapSourceTime(segments: MediaSegment[], outputTime: number): number {
  const segs = normalizeSegments(segments);
  if (segs.length === 0) return outputTime;
  let acc = 0;
  for (const s of segs) {
    const outDur = segOutDur(s);
    if (outputTime < acc + outDur) {
      // Hold: park on src_start for the whole window (frame frozen).
      return isHoldSegment(s) ? s.src_start : s.src_start + (outputTime - acc) * s.rate;
    }
    acc += outDur;
  }
  // Exhausted: freeze on the final frame (a hair before src_end so a frame
  // exists to seek to).
  const lastSeg = segs[segs.length - 1];
  return isHoldSegment(lastSeg) ? lastSeg.src_start : Math.max(lastSeg.src_start, lastSeg.src_end - 0.05);
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
    const outDur = segOutDur(s);
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
    var isHold = typeof s.hold === 'number' && s.hold > 0;
    if (isHold) {
      if (t < acc + s.hold) return s.src_start;   // frozen frame
      acc += s.hold;
      continue;
    }
    var rate = Math.min(16, Math.max(0.1, s.rate || 1));
    if (s.src_end <= s.src_start) continue;
    var outDur = (s.src_end - s.src_start) / rate;
    if (t < acc + outDur) return s.src_start + (t - acc) * rate;
    acc += outDur;
  }
  var last = segs[segs.length - 1];
  if (typeof last.hold === 'number' && last.hold > 0) return last.src_start;
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

// ── Intent solver ─────────────────────────────────────────────────────────
// Pins are CONSTRAINTS, cuts and rate preferences are elastic around them.
// Every edit op recompiles segments from intents, so a cut made BEFORE a
// pin re-solves the rates in between and the pinned moment still lands on
// the pinned word (measured failure this replaces: any segment-level edit
// silently un-pinned everything after it).

import type { MediaCut, MediaRateRegion, MediaPin } from "./types.js";

export interface MediaIntents {
  cuts?: MediaCut[];
  rate_regions?: MediaRateRegion[];
  pins?: MediaPin[];
}

export interface SolveResult {
  segments: MediaSegment[];
  pin_status: Array<{ out: number; status: "ok" | "strained" | "broken"; detail?: string }>;
}

function mergeRanges<T extends { src_start: number; src_end: number }>(ranges: T[], srcDur: number, keepBoundaries?: boolean): T[] {
  const rs = (ranges || [])
    .map((r) => ({ ...r, src_start: Math.max(0, r.src_start), src_end: Math.min(srcDur, r.src_end) }))
    .filter((r) => r.src_end > r.src_start + 0.01)
    .sort((a, b) => a.src_start - b.src_start);
  const out: T[] = [];
  for (const r of rs) {
    const last = out[out.length - 1];
    // keepBoundaries (rate regions): an ADJACENT same-rate boundary is the
    // user's split point -- preserve it; only true overlaps merge.
    const touch = keepBoundaries ? r.src_start < last?.src_end! - 0.01 : (last ? r.src_start <= last.src_end + 0.01 : false);
    if (last && touch && (last as any).rate === (r as any).rate) last.src_end = Math.max(last.src_end, r.src_end);
    else out.push({ ...r });
  }
  return out;
}

const inCut = (cuts: MediaCut[], t: number) => cuts.some((c) => t > c.src_start + 0.01 && t < c.src_end - 0.01);

/** Preferred rate at a source time (1 unless a rate region covers it). */
function prefRate(regions: MediaRateRegion[], t: number): number {
  for (const r of regions) if (t >= r.src_start && t < r.src_end) return Math.min(16, Math.max(0.1, r.rate || 1));
  return 1;
}

/** Available (uncut) source intervals within [from, to), split at every cut
 *  and rate-region boundary so each piece has one preferred rate. */
function piecesBetween(from: number, to: number, cuts: MediaCut[], regions: MediaRateRegion[]): Array<{ s: number; e: number; pref: number; hard: boolean }> {
  if (to <= from + 0.001) return [];
  const bounds = new Set<number>([from, to]);
  const regionBounds = new Set<number>();
  for (const c of cuts) { if (c.src_start > from && c.src_start < to) bounds.add(c.src_start); if (c.src_end > from && c.src_end < to) bounds.add(c.src_end); }
  for (const r of regions) {
    for (const b of [r.src_start, r.src_end]) {
      if (b > from && b < to) { bounds.add(b); regionBounds.add(Math.round(b * 1000)); }
    }
  }
  const bs = Array.from(bounds).sort((a, b) => a - b);
  const pieces: Array<{ s: number; e: number; pref: number; hard: boolean }> = [];
  for (let i = 0; i < bs.length - 1; i++) {
    const s = bs[i], e = bs[i + 1];
    if (e - s < 0.005) continue;
    const mid = (s + e) / 2;
    if (inCut(cuts, mid)) continue;
    // hard: this piece begins at a USER boundary (a rate-region edge -- i.e.
    // a split point). The derived map must keep it as its own segment even
    // when the neighbor solves to the same rate, or the user's split
    // vanishes from the lane and block-level Cut targets the merged span
    // (measured: cutting between two pins removed the whole stretch).
    pieces.push({ s, e, pref: prefRate(regions, mid), hard: regionBounds.has(Math.round(s * 1000)) });
  }
  return pieces;
}

/**
 * Compile intents into the playback segment map.
 * @param srcDur  source recording duration (seconds)
 * @param outDur  optional output window (scene duration): the tail after the
 *                last pin plays at preferred rates and is simply cut off by
 *                the scene ending, so it only bounds nothing today -- kept
 *                for future validation.
 */
export function solveMediaEdits(intents: MediaIntents, srcDur: number, _outDur?: number): SolveResult {
  const cuts = mergeRanges((intents.cuts || []) as MediaCut[], srcDur);
  const regions = mergeRanges((intents.rate_regions || []) as MediaRateRegion[], srcDur, true);
  const pinStatus: SolveResult["pin_status"] = [];

  // Validate pins: inside cut footage or out of order = broken (excluded).
  const sorted = (intents.pins || []).slice().sort((a, b) => a.out - b.out);
  const anchors: MediaPin[] = [];
  for (const p of sorted) {
    if (p.src < 0 || p.src > srcDur) { pinStatus.push({ out: p.out, status: "broken", detail: "pinned moment is outside the recording" }); continue; }
    if (inCut(cuts, p.src)) { pinStatus.push({ out: p.out, status: "broken", detail: "pinned footage was cut -- restore the cut or remove the pin" }); continue; }
    const prev = anchors[anchors.length - 1];
    if (prev && (p.out <= prev.out + 0.05 || p.src <= prev.src + 0.01)) {
      pinStatus.push({ out: p.out, status: "broken", detail: "pin is out of order with an earlier pin" });
      continue;
    }
    anchors.push(p);
  }

  // Implicit opening anchor: output 0 shows the first uncut source moment
  // (an explicit pin at out<=0.05 replaces it).
  let start = 0;
  while (inCut(cuts, start + 0.02)) {
    const c = cuts.find((cc) => start >= cc.src_start - 0.01 && start < cc.src_end)!;
    start = c.src_end;
  }
  let chain: MediaPin[] = [{ out: 0, src: start }];
  if (anchors.length && anchors[0].out <= 0.05) chain = [];
  chain = chain.concat(anchors);

  const segments: MediaSegment[] = [];
  const push = (s: number, e: number, rate: number, hard?: boolean) => {
    rate = Math.min(16, Math.max(0.1, rate));
    const last = segments[segments.length - 1];
    if (!hard && last && Math.abs(last.src_end - s) < 0.005 && Math.abs(last.rate - rate) < 0.001) last.src_end = e;
    else segments.push({ src_start: s, src_end: e, rate: Math.round(rate * 1000) / 1000 });
  };
  // Push a TRUE freeze: hold frame `src` for `holdSeconds` of OUTPUT time, the
  // source clock parked. Replaces the old "0.1x forward micro-sliver" that
  // visibly crept through footage and then rewound to the pinned frame.
  const pushHold = (src: number, holdSeconds: number) => {
    if (holdSeconds <= 0.01) return;
    segments.push({ src_start: src, src_end: src, rate: 0, hold: Math.round(holdSeconds * 1000) / 1000 });
  };

  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i], b = chain[i + 1];
    const window = b.out - a.out;
    const pieces = piecesBetween(a.src, b.src, cuts, regions);
    const atPref = pieces.reduce((t, p) => t + (p.e - p.s) / p.pref, 0);
    if (!pieces.length) {
      // Nothing to show before this pin: freeze the PINNED frame for the whole
      // window (a true hold -- source parked, rendered as HOLD in the lane).
      pushHold(b.src, window);
      pinStatus.push({ out: b.out, status: "ok", detail: `holds the pinned frame ${window.toFixed(1)}s (no footage before it)` });
      continue;
    }
    const rawLen = pieces.reduce((t, p) => t + (p.e - p.s), 0);
    if (rawLen < window - 0.2) {
      // GENUINELY less footage than film time (even 1x can't fill the
      // window): play at natural speed, then hold the pinned frame until
      // the pin's moment. When footage IS sufficient but fast preferences
      // would arrive early, the scale path below relaxes the rates to fill
      // the window exactly instead (measured: an 8x preference produced a
      // 50s hold where a ~3.6x fill was wanted).
      let first0 = true;
      for (const p of pieces) { push(p.s, p.e, Math.min(p.pref, 1), p.hard || first0); first0 = false; }
      const played = pieces.reduce((t, p) => t + (p.e - p.s) / Math.min(p.pref, 1), 0);
      const hold = window - played;
      // Freeze the pinned frame (b.src) for the leftover window -- a true hold,
      // so playback resumes from the SAME frame with no rewind.
      pushHold(b.src, hold);
      pinStatus.push({ out: b.out, status: "ok", detail: `arrives early -- holds the pinned frame ${Math.max(0, hold).toFixed(1)}s` });
      continue;
    }
    // Scale preferences so we arrive exactly on time. Pieces that hit the
    // 16x/0.1x clamp can't flex further -- iterate so the UNCLAMPED pieces
    // absorb the remainder and the pin still lands to the frame.
    let scale = atPref / window;
    for (let iter = 0; iter < 5; iter++) {
      let clampedTime = 0, freePref = 0;
      for (const p of pieces) {
        const r = p.pref * scale;
        if (r >= 16 || r <= 0.1) clampedTime += (p.e - p.s) / Math.min(16, Math.max(0.1, r));
        else freePref += (p.e - p.s) / p.pref;
      }
      const remaining = window - clampedTime;
      if (remaining <= 0.01 || freePref <= 0) break;
      const next = freePref / remaining;
      if (Math.abs(next - scale) < 1e-6) break;
      scale = next;
    }
    let arrival = 0;
    let first1 = true;
    for (const p of pieces) {
      const rate = Math.min(16, Math.max(0.1, p.pref * scale));
      arrival += (p.e - p.s) / rate;
      push(p.s, p.e, rate, p.hard || first1);
      first1 = false;
    }
    if (Math.abs(arrival - window) > 0.15) {
      pinStatus.push({ out: b.out, status: "strained", detail: `needs ${(scale > 1 ? "faster" : "slower")} playback than the ${scale > 1 ? "16x cap" : "0.1x floor"} allows -- lands ${(arrival - window).toFixed(1)}s off` });
    } else {
      pinStatus.push({ out: b.out, status: "ok" });
    }
  }

  // Tail after the last anchor: preferred rates until the source ends.
  const lastAnchor = chain[chain.length - 1];
  if (lastAnchor) {
    let first2 = true;
    for (const p of piecesBetween(lastAnchor.src, srcDur, cuts, regions)) { push(p.s, p.e, p.pref, p.hard || first2); first2 = false; }
  }

  return { segments: normalizeSegments(segments), pin_status: pinStatus };
}

/** Recover intents from a legacy segment-only edit so old projects join the
 *  intent world on their first op: source gaps = cuts, non-1x runs = rate
 *  preferences, stored pins pass through. */
export function inferIntents(edit: MediaEdit, srcDur: number): MediaIntents {
  if (edit.cuts || edit.rate_regions) {
    return { cuts: edit.cuts || [], rate_regions: edit.rate_regions || [], pins: edit.pins || [] };
  }
  const segs = normalizeSegments(edit.segments || []);
  const cuts: MediaCut[] = [];
  const rate_regions: MediaRateRegion[] = [];
  let cursor = 0;
  for (const s of segs) {
    // Freezes are a consequence of a pin, not an intent -- the pin persists and
    // re-solving reproduces the hold. Never recover a hold as a rate region.
    if (isHoldSegment(s)) continue;
    if (s.src_start > cursor + 0.05) cuts.push({ src_start: cursor, src_end: s.src_start });
    if (Math.abs(s.rate - 1) > 0.01) rate_regions.push({ src_start: s.src_start, src_end: s.src_end, rate: s.rate });
    cursor = Math.max(cursor, s.src_end);
  }
  if (segs.length && srcDur > cursor + 0.05) {
    // Tail the legacy map never reached stays reachable (not a cut): the map
    // freezing early was an artifact of output length, not an intent.
  }
  return { cuts, rate_regions, pins: edit.pins || [] };
}
