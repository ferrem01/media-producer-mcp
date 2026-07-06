import { describe, it, expect } from "vitest";
import {
  mapSourceTime,
  edlOutputDuration,
  activeSegmentAt,
  normalizeSegments,
  parseEdlAttr,
} from "../src/core/media-edl.js";

const SEGS = [
  { src_start: 0, src_end: 2, rate: 1 },   // out 0..2
  { src_start: 10, src_end: 30, rate: 8 }, // out 2..4.5 (timelapse)
  { src_start: 30, src_end: 33, rate: 1 }, // out 4.5..7.5
];

describe("media EDL mapping", () => {
  it("plays 1x segments in real time", () => {
    expect(mapSourceTime(SEGS, 0)).toBe(0);
    expect(mapSourceTime(SEGS, 1.5)).toBe(1.5);
  });

  it("jumps across the cut and runs timelapse at rate", () => {
    // out 2.0 = start of segment 2 -> src 10 (the 2..10 source gap is cut)
    expect(mapSourceTime(SEGS, 2)).toBe(10);
    // out 3.0 = 1s into an 8x segment -> src 18
    expect(mapSourceTime(SEGS, 3)).toBe(18);
  });

  it("continues into later 1x segments", () => {
    // out 5.5 = 1s into segment 3 -> src 31
    expect(mapSourceTime(SEGS, 5.5)).toBeCloseTo(31, 6);
  });

  it("freezes on the last frame past the end", () => {
    expect(mapSourceTime(SEGS, 100)).toBeCloseTo(32.95, 6);
    expect(mapSourceTime(SEGS, 7.6)).toBeCloseTo(32.95, 6);
  });

  it("computes total output duration", () => {
    expect(edlOutputDuration(SEGS)).toBeCloseTo(2 + 2.5 + 3, 6);
  });

  it("reports the active segment and its output window", () => {
    const a = activeSegmentAt(SEGS, 3);
    expect(a?.index).toBe(1);
    expect(a?.segment.rate).toBe(8);
    expect(a?.outStart).toBe(2);
    expect(a?.outEnd).toBeCloseTo(4.5, 6);
    expect(activeSegmentAt(SEGS, 100)).toBeNull(); // frozen
  });

  it("normalizes degenerate and out-of-range segments", () => {
    const segs = normalizeSegments([
      { src_start: 5, src_end: 5, rate: 1 },   // dropped (empty)
      { src_start: -2, src_end: 4, rate: 0 },  // clamped start; falsy rate -> 1
      { src_start: 0, src_end: 1, rate: 99 },  // rate ceiling 16
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0].src_start).toBe(0);
    expect(segs[0].rate).toBe(1);
    expect(segs[1].rate).toBe(16);
  });

  it("no segments = identity mapping (untouched video)", () => {
    expect(mapSourceTime([], 7)).toBe(7);
  });

  it("parses data-mp-edl attributes defensively", () => {
    expect(parseEdlAttr(JSON.stringify(SEGS))).toHaveLength(3);
    expect(parseEdlAttr("not json")).toBeNull();
    expect(parseEdlAttr('{"a":1}')).toBeNull();
    expect(parseEdlAttr("[]")).toBeNull();
    expect(parseEdlAttr(null)).toBeNull();
  });
});
