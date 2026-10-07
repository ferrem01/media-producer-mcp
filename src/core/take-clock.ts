/**
 * The clock of a trimmed and cut take (core/take-edits.ts), pure and
 * import-free so the speaker layer can read it.
 */

export interface TakeCut { src_start: number; src_end: number }
type TakeClockLike = { trim_start?: number; trim_end?: number; duration?: number; cuts?: TakeCut[]; speed?: number; cut_files?: Record<string, { file: string; cuts: string; stamp: string }> };

/** THE TAKE'S PACE (Oct 7, Marc: "it seems like I'm not talking fast
 *  enough"): a take may play faster or slower than it was recorded, pitch
 *  kept. Like a cut it is BAKED into the edited copies, so the copies' clock
 *  is the cut clock divided by the speed. 1 = as recorded. */
export function speedOf(take: TakeClockLike | null | undefined): number {
  const s = Number(take?.speed);
  return s > 0 && Math.abs(s - 1) > 1e-3 ? s : 1;
}
/** True when the take plays edited copies: it has cuts, or a pace. */
export function bakes(take: TakeClockLike | null | undefined): boolean {
  return !!take && ((take.cuts?.length || 0) > 0 || speedOf(take) !== 1);
}
/** Original-recording seconds -> what plays (the edited copies' clock). */
export function playClock(take: TakeClockLike, src: number): number {
  return r3(cutClock(take.cuts, src) / speedOf(take));
}
/** What plays -> original-recording seconds. */
export function fromPlayClock(take: TakeClockLike, t: number): number {
  return sourceClock(take.cuts, t * speedOf(take));
}
/** A stable key for everything baked into the edited copies: the cuts and the pace. */
export function editKey(take: TakeClockLike): string {
  const sp = speedOf(take);
  return cutsKey(take.cuts || []) + (sp !== 1 ? `x${String(sp).replace(".", "p")}` : "");
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Original-recording seconds -> the cut clock (the cut copies' clock). A
 *  time inside a cut lands on the cut's seam. */
export function cutClock(cuts: TakeCut[] | undefined, src: number): number {
  let removed = 0;
  for (const c of cuts || []) {
    if (c.src_end <= src) removed += c.src_end - c.src_start;
    else if (c.src_start < src) removed += src - c.src_start;
  }
  return r3(src - removed);
}

/** The cut clock -> original-recording seconds. */
export function sourceClock(cuts: TakeCut[] | undefined, t: number): number {
  let remaining = t;
  let cursor = 0;
  for (const c of [...(cuts || [])].sort((a, b) => a.src_start - b.src_start)) {
    const keptLen = c.src_start - cursor;
    if (remaining < keptLen) return r3(cursor + remaining);
    remaining -= keptLen;
    cursor = c.src_end;
  }
  return r3(cursor + remaining);
}

/** The take's window on the original recording. `end` needs the file's
 *  length when the take was never trimmed (take.duration is the WINDOW's
 *  length once it was). */
export function takeWindow(take: TakeClockLike): { start: number; end: number } {
  const start = take.trim_start || 0;
  const end = take.trim_end != null ? take.trim_end : start + (take.duration || 0);
  return { start, end };
}

/** What the scene plays: the window minus the cuts inside it, at the take's pace. */
export function keptSeconds(take: TakeClockLike): number {
  const w = takeWindow(take);
  return Math.max(0, r3((cutClock(take.cuts, w.end) - cutClock(take.cuts, w.start)) / speedOf(take)));
}

/** Words on the original clock -> the cut clock: a word whose middle falls
 *  in a cut is gone, the rest close up. */
export function wordsThroughCuts<W extends { start: number; end: number }>(words: W[], cuts: TakeCut[] | undefined, speed = 1): W[] {
  const sp = speed > 0 ? speed : 1;
  if ((!cuts || !cuts.length) && sp === 1) return words;
  return words
    .filter((w) => !(cuts || []).some((c) => (w.start + w.end) / 2 >= c.src_start && (w.start + w.end) / 2 < c.src_end))
    .map((w) => ({ ...w, start: r3(cutClock(cuts, w.start) / sp), end: r3(cutClock(cuts, w.end) / sp) }));
}

/** A stable key for a cut list (which cut copies are current). */
export function cutsKey(cuts: TakeCut[]): string {
  // FNV-1a, 40 bits as 10 hex digits: no crypto import for a cache key.
  const str = JSON.stringify(cuts.map((c) => [r3(c.src_start), r3(c.src_end)]));
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) { h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 ^ str.charCodeAt(i), 2246822519) >>> 0; }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 10);
}

/** The edited copy (cuts and pace baked in) of one of the take's files, when it is current. */
export function cutFileFor(take: TakeClockLike, file: string | undefined): string | undefined {
  if (!file) return undefined;
  if (!bakes(take)) return file;
  const hit = take.cut_files?.[file];
  return hit && hit.cuts === editKey(take) ? hit.file : undefined;
}
