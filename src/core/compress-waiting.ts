import { spawn } from "node:child_process";
import type { MediaSegment } from "./types.js";

/**
 * "Compress the waiting": find stretches of a screen recording where the
 * picture barely changes (AI spinners, loading, reading) with ffmpeg's
 * freezedetect, and build a source-map that timelapses them. Deterministic,
 * no LLM -- the 15-minutes-to-3 first pass in one click.
 */

export interface IdleRange {
  start: number;
  end: number;
}

export async function detectIdleRanges(
  videoPath: string,
  minIdleSeconds = 2,
  noiseDb = -40,
  range?: { start: number; end: number },
): Promise<{ ranges: IdleRange[]; duration: number }> {
  const stderr: string = await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      ...(range ? ["-ss", String(range.start), "-to", String(range.end)] : []),
      "-i", videoPath,
      "-vf", `freezedetect=n=${noiseDb}dB:d=${minIdleSeconds}`,
      "-an",
      "-f", "null",
      "-",
    ]);
    const errs: Buffer[] = [];
    ff.stderr.on("data", (c) => errs.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      const out = Buffer.concat(errs).toString();
      if (code === 0) resolve(out);
      else reject(new Error(`ffmpeg freezedetect failed (${code}): ${out.slice(-300)}`));
    });
  });

  let duration = 0;
  const dm = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  if (dm) duration = parseInt(dm[1], 10) * 3600 + parseInt(dm[2], 10) * 60 + parseFloat(dm[3]);
  // With -ss before -i, freeze timestamps restart at 0: offset back into
  // absolute source time, and the working duration is the range's end.
  const offset = range ? range.start : 0;
  if (range) duration = range.end;

  const ranges: IdleRange[] = [];
  let pendingStart: number | null = null;
  const re = /freeze_(start|end):\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr))) {
    if (m[1] === "start") pendingStart = parseFloat(m[2]) + offset;
    else if (pendingStart != null) {
      ranges.push({ start: pendingStart, end: parseFloat(m[2]) + offset });
      pendingStart = null;
    }
  }
  // A freeze running to EOF emits no freeze_end.
  if (pendingStart != null && duration > pendingStart) ranges.push({ start: pendingStart, end: duration });
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
