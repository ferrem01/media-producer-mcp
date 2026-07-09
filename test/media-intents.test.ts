import { describe, it, expect } from "vitest";
import { solveMediaEdits, inferIntents, mapSourceTime, edlOutputDuration } from "../src/core/media-edl.js";

const SRC = 600; // 10-minute recording

describe("pin solver: pins are constraints", () => {
  it("no intents: plays 1x straight through", () => {
    const { segments, pin_status } = solveMediaEdits({}, SRC);
    expect(segments).toEqual([{ src_start: 0, src_end: 600, rate: 1 }]);
    expect(pin_status).toEqual([]);
  });

  it("a pin alone compiles to arrive on time", () => {
    // At film 10s the source must be at 40s -> 4x until then, 1x after.
    const { segments, pin_status } = solveMediaEdits({ pins: [{ out: 10, src: 40 }] }, SRC);
    expect(pin_status).toEqual([{ out: 10, status: "ok" }]);
    expect(mapSourceTime(segments, 10)).toBeCloseTo(40, 1);
    expect(segments[0].rate).toBeCloseTo(4, 2);
  });

  it("THE BUG: cutting footage BEFORE a pin keeps the pin landing", () => {
    // Pin: at film 10s show source 40s. Then cut source 0-5s.
    const { segments, pin_status } = solveMediaEdits(
      { pins: [{ out: 10, src: 40 }], cuts: [{ src_start: 0, src_end: 5 }] }, SRC);
    expect(pin_status).toEqual([{ out: 10, status: "ok" }]);
    // 35s of remaining source fits the same 10s window -> 3.5x.
    expect(mapSourceTime(segments, 10)).toBeCloseTo(40, 1);
    expect(mapSourceTime(segments, 0)).toBeCloseTo(5, 1); // starts after the cut
  });

  it("rate preferences flex proportionally between pins", () => {
    // 0-20s src preferred 8x, 20-40 at 1x; pin at out 10 -> src 40.
    const { segments } = solveMediaEdits({
      pins: [{ out: 10, src: 40 }],
      rate_regions: [{ src_start: 0, src_end: 20, rate: 4 }],
    }, SRC);
    // at pref: 20/4 + 20/1 = 25s for a 10s window -> k=2.5 (no clamp)
    expect(mapSourceTime(segments, 10)).toBeCloseTo(40, 1);
    const fast = segments.find((s) => s.src_start === 0)!;
    const slow = segments.find((s) => s.src_start === 20)!;
    expect(fast.rate / slow.rate).toBeCloseTo(4, 1); // preference RATIO preserved
  });

  it("cutting the pinned footage itself breaks the pin loudly", () => {
    const { pin_status } = solveMediaEdits(
      { pins: [{ out: 10, src: 40 }], cuts: [{ src_start: 30, src_end: 50 }] }, SRC);
    expect(pin_status[0].status).toBe("broken");
    expect(pin_status[0].detail).toMatch(/cut/);
  });

  it("clamped pieces redistribute onto unclamped ones so the pin still lands", () => {
    const { segments, pin_status } = solveMediaEdits({
      pins: [{ out: 10, src: 40 }],
      rate_regions: [{ src_start: 0, src_end: 20, rate: 8 }], // wants 18x -> capped 16x
    }, SRC);
    expect(pin_status).toEqual([{ out: 10, status: "ok" }]);
    expect(mapSourceTime(segments, 10)).toBeCloseTo(40, 1);
  });

  it("impossible arrival reports strained", () => {
    // 300s of source into a 10s window needs 30x > 16x cap.
    const { pin_status } = solveMediaEdits({ pins: [{ out: 10, src: 300 }] }, SRC);
    expect(pin_status[0].status).toBe("strained");
  });

  it("out-of-order pins: the later conflicting pin breaks, not the first", () => {
    const { pin_status } = solveMediaEdits(
      { pins: [{ out: 10, src: 100 }, { out: 20, src: 50 }] }, SRC);
    expect(pin_status.find((p) => p.out === 20)?.status).toBe("broken");
    expect(pin_status.find((p) => p.out === 10)?.status).toBe("ok");
  });

  it("cuts produce source gaps in the derived map", () => {
    const { segments } = solveMediaEdits({ cuts: [{ src_start: 100, src_end: 200 }] }, SRC);
    expect(segments).toEqual([
      { src_start: 0, src_end: 100, rate: 1 },
      { src_start: 200, src_end: 600, rate: 1 },
    ]);
    // output duration shrinks by the cut
    expect(edlOutputDuration(segments)).toBeCloseTo(500, 1);
  });
});

describe("legacy migration: inferIntents", () => {
  it("recovers cuts and rate regions from a segment-only edit", () => {
    const intents = inferIntents({
      segments: [
        { src_start: 0, src_end: 3, rate: 8 },
        { src_start: 3, src_end: 5, rate: 1 },
        { src_start: 10, src_end: 20, rate: 8 },
      ],
      pins: [{ out: 4, src: 12 }],
    }, SRC);
    expect(intents.cuts).toEqual([{ src_start: 5, src_end: 10 }]);
    expect(intents.rate_regions).toEqual([
      { src_start: 0, src_end: 3, rate: 8 },
      { src_start: 10, src_end: 20, rate: 8 },
    ]);
    expect(intents.pins).toEqual([{ out: 4, src: 12 }]);
  });

  it("round-trips: infer + solve reproduces equivalent playback", () => {
    const legacy = {
      segments: [
        { src_start: 0, src_end: 30, rate: 8 },
        { src_start: 30, src_end: 40, rate: 1 },
        { src_start: 40, src_end: 200, rate: 8 },
      ],
    };
    const { segments } = solveMediaEdits(inferIntents(legacy, SRC), SRC);
    for (const t of [1, 5, 10, 13]) {
      expect(mapSourceTime(segments, t)).toBeCloseTo(mapSourceTime(legacy.segments, t), 1);
    }
  });
});
