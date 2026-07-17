import { spawn } from "node:child_process";
import type { MediaSegment } from "./types.js";

/**
 * "Compress the waiting": find stretches of a screen recording where nothing
 * meaningful happens (AI spinners, loading, reading) and build a source-map
 * that timelapses them. Deterministic, no LLM -- the 15-minutes-to-3 first
 * pass in one click.
 *
 * Detection is a motion profile, not ffmpeg freezedetect: freezedetect's
 * single dB threshold is a cliff on real screencasts (at -40dB a blinking
 * cursor defeats it; at -30dB an entire active demo reads as "frozen").
 * Instead we decode tiny grayscale frames, score per-frame motion as mean
 * absolute pixel difference, and classify seconds against an adaptive
 * threshold derived from the clip's own motion distribution -- real activity
 * (typing, scrolling, streaming text) scores 10-50x higher than a spinner.
 */

export interface IdleRange {
  start: number;
  end: number;
}

const W = 64;
const H = 36;
const FPS = 4;
const FRAME_BYTES = W * H;

/** Where a frame's change happened: bounding box (grid-cell fractions of the
 *  frame, 0-1) + how many cells changed. */
export interface FrameChange {
  /** Mean absolute pixel difference (the motion score). */
  score: number;
  /** Fraction of pixels that changed meaningfully (|diff| > 24). */
  changedFrac: number;
  /** Bounding box of changed pixels as frame fractions; null when nothing changed. */
  box: { x: number; y: number; w: number; h: number } | null;
}

/** Decode downscaled gray frames; per frame-gap return the motion score AND
 *  where the change happened (for focus/callout localization). */
async function motionScores(
  videoPath: string,
  range?: { start: number; end: number },
): Promise<{ scores: number[]; changes: FrameChange[]; duration: number }> {
  const args = [
    ...(range ? ["-ss", String(range.start), "-to", String(range.end)] : []),
    "-i", videoPath,
    "-vf", `scale=${W}:${H},format=gray`,
    "-r", String(FPS),
    "-f", "rawvideo",
    "-loglevel", "error",
    "-",
  ];
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let buf: Buffer = Buffer.alloc(0);
    let prev: Buffer | null = null;
    let frames = 0;
    const scores: number[] = [];
    const changes: FrameChange[] = [];
    ff.stdout.on("data", (c: Buffer) => {
      buf = Buffer.concat([buf, c]);
      while (buf.length >= FRAME_BYTES) {
        const frame = buf.subarray(0, FRAME_BYTES);
        buf = buf.subarray(FRAME_BYTES);
        if (prev) {
          let sum = 0;
          let minX = W, minY = H, maxX = -1, maxY = -1, changed = 0;
          for (let p = 0; p < FRAME_BYTES; p++) {
            const d = Math.abs(frame[p] - prev[p]);
            sum += d;
            if (d > 24) {
              changed++;
              const x = p % W, y = (p / W) | 0;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
          scores.push(sum / FRAME_BYTES);
          changes.push({
            score: sum / FRAME_BYTES,
            changedFrac: changed / FRAME_BYTES,
            box: maxX >= 0
              ? { x: minX / W, y: minY / H, w: (maxX - minX + 1) / W, h: (maxY - minY + 1) / H }
              : null,
          });
        }
        prev = Buffer.from(frame);
        frames++;
      }
    });
    const errs: Buffer[] = [];
    ff.stderr.on("data", (c) => errs.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve({ scores, changes, duration: frames / FPS });
      else reject(new Error(`ffmpeg motion decode failed (${code}): ${Buffer.concat(errs).toString().slice(-300)}`));
    });
  });
}

/** Isolated high-motion spikes in a frame-diff score series = hard visual
 *  transitions (page navigations, screen switches). Sustained high motion
 *  (scrolling, streaming text, animation) is NOT a transition: only short
 *  bursts count, and nearby bursts collapse into one.
 *
 *  Detection is LOCAL-contrast, not a global percentile: an SPA page change
 *  keeps nav bars and chrome in place, so its score is modest in absolute
 *  terms -- what marks it is being several times its own neighborhood's
 *  baseline. A global threshold tuned on a scroll-heavy clip misses every
 *  real navigation (measured on the newsletter walkthrough). Exported for
 *  tests. */
export function transitionsFromScores(scores: number[], fps = FPS): number[] {
  if (scores.length < fps * 2) return [];
  const HALF = 8 * fps; // +/-8s neighborhood

  const spike: boolean[] = new Array(scores.length).fill(false);
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (s < 4) continue; // below any real repaint, skip the sort
    const from = Math.max(0, i - HALF);
    const to = Math.min(scores.length, i + HALF);
    const hood: number[] = [];
    for (let j = from; j < to; j++) {
      if (Math.abs(j - i) > fps) hood.push(scores[j]); // exclude the burst itself
    }
    if (hood.length < fps) continue;
    hood.sort((a, b) => a - b);
    const base = hood[Math.floor(hood.length / 2)];
    // 4x its own surroundings, with a floor so noise on a quiet clip
    // (base ~0) still needs a real repaint to count.
    spike[i] = s >= Math.max(6, base * 4);
  }

  const transitions: number[] = [];
  let runStart = -1;
  const flush = (endIdx: number) => {
    if (runStart < 0) return;
    const lenSec = (endIdx - runStart) / fps;
    // Bursts longer than ~1.2s are scroll/animation, not a cut.
    if (lenSec <= 1.2) {
      const at = runStart / fps;
      const last = transitions[transitions.length - 1];
      // Collapse transitions closer than 3s (multi-step navigations).
      if (last === undefined || at - last >= 3) transitions.push(Math.round(at * 10) / 10);
    }
    runStart = -1;
  };
  for (let i = 0; i < scores.length; i++) {
    if (spike[i]) { if (runStart < 0) runStart = i; }
    else flush(i);
  }
  flush(scores.length);
  return transitions;
}

/** A stretch of CONCENTRATED activity: something happened in one small part
 *  of the frame (typing in a field, clicking a button, a panel updating) --
 *  the natural target for a callout/punch-in. Box is frame fractions 0-1. */
export interface FocusEvent {
  start: number;
  end: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Localized activity -> focus events. A second is a "focus second" when it
 *  has real motion whose union bbox stays small (a full-frame repaint or a
 *  scroll is NOT focus). Consecutive overlapping focus seconds merge, and
 *  the emitted box is the MEDIAN of the run's per-second boxes -- the union
 *  compounds every stray flicker over a long run until the box covers half
 *  the screen (measured: every proposed callout slammed the height cap).
 *  Exported for tests. */
export function focusEventsFromChanges(changes: FrameChange[], fps = FPS): FocusEvent[] {
  const secCount = Math.ceil(changes.length / fps);
  const events: FocusEvent[] = [];
  let cur: { start: number; end: number; boxes: Array<{ x: number; y: number; w: number; h: number }> } | null = null;

  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w + 0.08 && b.x < a.x + a.w + 0.08 &&
    a.y < b.y + b.h + 0.08 && b.y < a.y + a.h + 0.08;

  const median = (vals: number[]) => {
    const s = vals.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const flush = () => {
    if (cur && cur.end - cur.start >= 2) {
      // Median center + median size: the run's TYPICAL activity region, not
      // the accumulation of everything that ever flickered during it.
      const cx = median(cur.boxes.map((b) => b.x + b.w / 2));
      const cy = median(cur.boxes.map((b) => b.y + b.h / 2));
      const w = median(cur.boxes.map((b) => b.w));
      const h = median(cur.boxes.map((b) => b.h));
      if (w * h <= 0.16) {
        events.push({
          start: cur.start, end: cur.end,
          x: Math.round(Math.max(0, cx - w / 2) * 1000) / 1000,
          y: Math.round(Math.max(0, cy - h / 2) * 1000) / 1000,
          w: Math.round(w * 1000) / 1000,
          h: Math.round(h * 1000) / 1000,
        });
      }
    }
    cur = null;
  };

  for (let s = 0; s < secCount; s++) {
    const chunk = changes.slice(s * fps, (s + 1) * fps);
    const active = chunk.filter((c) => c.box && c.score >= 0.35);
    let sec: { x: number; y: number; w: number; h: number } | null = null;
    if (active.length) {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const c of active) {
        minX = Math.min(minX, c.box!.x);
        minY = Math.min(minY, c.box!.y);
        maxX = Math.max(maxX, c.box!.x + c.box!.w);
        maxY = Math.max(maxY, c.box!.y + c.box!.h);
      }
      const w = maxX - minX, h = maxY - minY;
      // Concentrated: this second's whole activity fits in <= ~20% of the
      // frame area. A scroll or page change blows well past this.
      if (w * h <= 0.2 && w > 0.01 && h > 0.01) {
        sec = { x: minX, y: minY, w, h };
      }
    }
    if (sec && cur && overlaps(cur.boxes[cur.boxes.length - 1], sec) && s <= cur.end + 1) {
      cur.boxes.push(sec);
      cur.end = s + 1;
    } else {
      flush();
      cur = sec ? { start: s, end: s + 1, boxes: [sec] } : null;
    }
  }
  flush();
  return events;
}

export interface MotionAnalysis {
  ranges: IdleRange[];
  /** Source seconds of hard visual transitions (page changes). */
  transitions: number[];
  /** Concentrated-activity stretches (callout targets), source seconds. */
  focus: FocusEvent[];
  duration: number;
}

/** One decode, both signals: idle stretches (compress-the-waiting) and hard
 *  visual transitions (chapter-pin snap points). */
export async function analyzeMotion(
  videoPath: string,
  minIdleSeconds = 2,
  range?: { start: number; end: number },
): Promise<MotionAnalysis> {
  const { scores, changes, duration } = await motionScores(videoPath, range);
  const offset = range ? range.start : 0;
  const total = range ? range.end : duration;
  if (!scores.length) return { ranges: [], transitions: [], focus: [], duration: total };

  // Adaptive idle threshold: a fraction of the clip's own busy level, with a
  // floor so a fully-static recording still reads idle and a ceiling so a
  // low-energy clip doesn't classify real activity away.
  const sorted = scores.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))];
  const threshold = Math.min(2.5, Math.max(0.7, p95 * 0.15));

  // A second is idle only if NOTHING moved in it (max of its samples): one
  // real flick -- a click, a keystroke -- marks the whole second active.
  const secCount = Math.ceil(scores.length / FPS);
  const ranges: IdleRange[] = [];
  let runStart: number | null = null;
  for (let s = 0; s <= secCount; s++) {
    let idle = false;
    if (s < secCount) {
      const chunk = scores.slice(s * FPS, (s + 1) * FPS);
      idle = chunk.length > 0 && Math.max(...chunk) < threshold;
    }
    if (idle && runStart === null) runStart = s;
    else if (!idle && runStart !== null) {
      if (s - runStart >= minIdleSeconds) {
        ranges.push({ start: runStart + offset, end: Math.min(s + offset, total) });
      }
      runStart = null;
    }
  }
  const transitions = transitionsFromScores(scores).map((t) => Math.round((t + offset) * 10) / 10);
  const focus = focusEventsFromChanges(changes).map((f) => ({
    ...f,
    start: Math.round((f.start + offset) * 10) / 10,
    end: Math.round((f.end + offset) * 10) / 10,
  }));
  // Diagnostics: when pins/callouts don't land, this line says whether
  // detection or matching was the problem.
  const smax = Math.max(...scores);
  const med = sorted[Math.floor(0.5 * (sorted.length - 1))];
  console.log(
    `  Motion: ${scores.length} samples over ${Math.round(total)}s -- median ${med.toFixed(2)}, p95 ${p95.toFixed(2)}, max ${smax.toFixed(1)} | ${ranges.length} idle range(s), ${transitions.length} transition(s), ${focus.length} focus event(s)`,
  );
  return { ranges, transitions, focus, duration: total };
}

export async function detectIdleRanges(
  videoPath: string,
  minIdleSeconds = 2,
  _noiseDb = -40, // kept for API compatibility; superseded by the motion profile
  range?: { start: number; end: number },
): Promise<{ ranges: IdleRange[]; duration: number }> {
  const { ranges, duration } = await analyzeMotion(videoPath, minIdleSeconds, range);
  return { ranges, duration };
}

/** Idle ranges -> a full source-map: active stretches at 1x, idle at
 *  idleRate. Tiny active slivers (<0.4s) merge into the neighboring idle. */
export function buildCompressedSegments(
  duration: number,
  ranges: IdleRange[],
  idleRate = 8,
  startAt = 0,
): MediaSegment[] {
  const segs: MediaSegment[] = [];
  let cursor = startAt;
  const push = (a: number, b: number, rate: number) => {
    if (b - a < 0.05) return;
    const prev = segs[segs.length - 1];
    if (prev && prev.rate === rate && Math.abs(prev.src_end - a) < 0.001) prev.src_end = b;
    else segs.push({ src_start: Math.round(a * 10) / 10, src_end: Math.round(b * 10) / 10, rate });
  };
  for (const r of ranges) {
    if (r.start - cursor >= 0.4) push(cursor, r.start, 1);
    else if (r.start > cursor && segs.length) segs[segs.length - 1].src_end = Math.round(r.start * 10) / 10;
    push(Math.max(cursor, r.start), r.end, idleRate);
    cursor = Math.max(cursor, r.end);
  }
  if (duration - cursor >= 0.05) push(cursor, duration, 1);
  return segs;
}
