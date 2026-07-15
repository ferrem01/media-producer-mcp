import { describe, it, expect } from "vitest";
import { solveMediaEdits, inferIntents, mapSourceTime, edlOutputDuration, normalizeSegments } from "../src/core/media-edl.js";

const SRC = 600; // 10-minute recording

describe("freeze / hold: a pin that arrives early parks the exact frame", () => {
  // Regression for the real bug: "hold" was faked as a 0.1x forward micro-
  // sliver -- it crept through footage in slow-mo and then rewound to the pin.
  it("emits a TRUE freeze segment (rate 0, hold>0), not a 0.1x creep", () => {
    const { segments } = solveMediaEdits({ pins: [{ out: 20, src: 3.1 }] }, SRC);
    const hold = segments.find((s) => s.hold);
    expect(hold).toBeDefined();
    expect(hold!.hold).toBeCloseTo(16.9, 1); // 20s window - 3.1s of real footage
    expect(hold!.rate).toBe(0);
    expect(hold!.src_start).toBeCloseTo(3.1, 2);
    expect(hold!.src_end).toBeCloseTo(3.1, 2);
    // No old-style 0.1x slow-play segment anywhere.
    expect(segments.some((s) => !s.hold && Math.abs(s.rate - 0.1) < 0.001)).toBe(false);
    // Playback resumes from the pinned frame -- no overshoot, no rewind.
    const hi = segments.indexOf(hold!);
    if (segments[hi + 1]) expect(segments[hi + 1].src_start).toBeCloseTo(3.1, 1);
  });

  it("holds the frame: mapSourceTime is constant across the whole window", () => {
    const { segments } = solveMediaEdits({ pins: [{ out: 20, src: 3.1 }] }, SRC);
    expect(mapSourceTime(segments, 3.1)).toBeCloseTo(3.1, 1);
    expect(mapSourceTime(segments, 10)).toBeCloseTo(3.1, 1);   // mid-hold frozen (old bug: ~3.79)
    expect(mapSourceTime(segments, 19.9)).toBeCloseTo(3.1, 1); // still frozen (old bug: ~4.79)
  });

  it("never rewinds across the hold boundary (monotonic), pin still lands", () => {
    const { segments, pin_status } = solveMediaEdits(
      { pins: [{ out: 20, src: 3.1 }, { out: 30, src: 13.7 }] }, SRC);
    expect(pin_status.every((p) => p.status === "ok")).toBe(true);
    const before = mapSourceTime(segments, 19.9);
    const after = mapSourceTime(segments, 20.1);
    expect(before).toBeCloseTo(3.1, 1);            // frozen at the pin, not crept to 4.79
    expect(after).toBeGreaterThanOrEqual(before - 0.05); // no backward jump
    expect(mapSourceTime(segments, 30)).toBeCloseTo(13.7, 1); // the next pin lands
  });

  it("output duration counts the hold seconds", () => {
    const { segments } = solveMediaEdits({ pins: [{ out: 20, src: 3.1 }] }, SRC);
    // play (0->3.1 @1x = 3.1s) + freeze (16.9s) = 20s up to the pin.
    expect(edlOutputDuration(segments.slice(0, 2))).toBeCloseTo(20, 0);
  });

  it("normalizeSegments preserves a hold segment (not dropped as degenerate)", () => {
    const segs = normalizeSegments([{ src_start: 3.1, src_end: 3.1, rate: 0, hold: 5 }]);
    expect(segs).toHaveLength(1);
    expect(segs[0].hold).toBe(5);
    expect(segs[0].rate).toBe(0);
  });
});

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

  it("less footage than film time: plays natural speed then HOLDS (no slow-mo soup)", () => {
    // 5s of footage into a 20s window: 1x for 5s, then hold the pinned frame.
    const { segments, pin_status } = solveMediaEdits(
      { pins: [{ out: 20, src: 10 }], cuts: [{ src_start: 0, src_end: 5 }] }, SRC);
    expect(pin_status[0].status).toBe("ok");
    expect(pin_status[0].detail).toMatch(/holds/);
    expect(segments[0]).toEqual({ src_start: 5, src_end: 10, rate: 1 });
    // A TRUE freeze: hold frame 10 for the remaining 15s (was a 0.1x creep).
    expect(segments[1].rate).toBe(0);
    expect(segments[1].hold).toBeCloseTo(15, 0);
    expect(segments[1].src_start).toBeCloseTo(10, 2);
    expect(mapSourceTime(segments, 12)).toBeCloseTo(10, 1); // frozen mid-hold
    expect(edlOutputDuration(segments.slice(0, 2))).toBeCloseTo(20, 0);
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

describe("sufficient footage always fills the window (no phantom holds)", () => {
  it("a fast preference relaxes to fit instead of arriving early + holding", () => {
    // 346s of footage, 95s window, 8x preference -> should play ~3.6x, no hold.
    const { segments, pin_status } = solveMediaEdits({
      pins: [{ out: 5, src: 29.4 }, { out: 100, src: 375.7 }],
      rate_regions: [{ src_start: 29.4, src_end: 375.7, rate: 8 }],
    }, SRC);
    expect(pin_status.find((x) => x.out === 100)?.status).toBe("ok");
    expect(mapSourceTime(segments, 100)).toBeCloseTo(375.7, 0);
    const mid = segments.find((g) => g.src_start >= 29 && g.src_end <= 376 && g.src_end - g.src_start > 100)!;
    expect(mid.rate).toBeGreaterThan(3);
    expect(mid.rate).toBeLessThan(4.2);
    expect(segments.some((g) => g.rate <= 0.12 && g.src_start > 29 && g.src_start < 376)).toBe(false); // no hold
  });
});

describe("split + cut between pins (reported failure)", () => {
  it("a split between two pins survives into the derived map as two blocks", () => {
    const intents = {
      pins: [{ out: 10, src: 100 }, { out: 20, src: 200 }],
      rate_regions: [
        { src_start: 100, src_end: 150, rate: 1 },
        { src_start: 150, src_end: 200, rate: 1 },
      ],
    };
    const { segments } = solveMediaEdits(intents, SRC);
    const between = segments.filter((g) => g.src_start >= 100 && g.src_end <= 200);
    expect(between.length).toBe(2); // the split boundary is visible, not merged away
    expect(between[0].src_end).toBeCloseTo(150, 1);
  });

  it("cutting one half of the split removes ONLY that half; both pins still land", () => {
    const intents = {
      pins: [{ out: 10, src: 100 }, { out: 20, src: 200 }],
      rate_regions: [
        { src_start: 100, src_end: 150, rate: 1 },
        { src_start: 150, src_end: 200, rate: 1 },
      ],
      cuts: [{ src_start: 150, src_end: 200 }],
    };
    const { segments, pin_status } = solveMediaEdits(intents, SRC);
    expect(pin_status.find((x) => x.out === 20)?.status).toBe("ok"); // arrives early + holds
    expect(mapSourceTime(segments, 10)).toBeCloseTo(100, 1);
    // the surviving half plays; the cut half never appears
    expect(segments.some((g) => g.src_start >= 150 && g.src_end <= 200 && g.src_end - g.src_start > 6)).toBe(false);
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
