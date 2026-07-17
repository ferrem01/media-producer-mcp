import { describe, it, expect } from "vitest";
import { eventsToMotionIntel, type RecorderEvents } from "../src/core/recorder-events.js";

const base = (over: Partial<RecorderEvents> = {}): RecorderEvents => ({
  version: 1,
  recording: { width: 2294, height: 1440, durationMs: 120_000 },
  ...over,
});

describe("eventsToMotionIntel", () => {
  it("converts idle spans ms->s, drops slivers, merges adjacency", () => {
    const intel = eventsToMotionIntel(
      base({
        mutationsIdle: [
          { from: 5000, to: 20000 },
          { from: 20100, to: 31000 }, // adjacent -> merges
          { from: 40000, to: 41000 }, // 1s sliver -> dropped
          { from: 100000, to: 130000 }, // clipped to duration
        ],
      }),
      120,
    );
    expect(intel.idle.duration).toBe(120);
    expect(intel.idle.ranges).toEqual([
      { start: 5, end: 31 },
      { start: 100, end: 120 },
    ]);
  });

  it("dedupes navigations within 3s and clips edges", () => {
    const intel = eventsToMotionIntel(
      base({
        navigations: [
          { t: 200 },     // too close to start
          { t: 15000 },
          { t: 16500 },   // redirect step -> collapsed
          { t: 60000 },
          { t: 119500 },  // too close to end
        ],
      }),
      120,
    );
    expect(intel.transitions).toEqual([15, 60]);
  });

  it("maps clicked-element boxes to viewport fractions", () => {
    const intel = eventsToMotionIntel(
      base({
        clicks: [
          { t: 30000, x: 600, y: 450, box: { x: 574, y: 440, w: 120, h: 36 }, viewport: { w: 1147, h: 720 }, label: "Connect" },
          { t: 31000, x: 10, y: 10 }, // no box -> skipped
        ],
      }),
      120,
    );
    expect(intel.focus.length).toBe(1);
    const f = intel.focus[0];
    expect(f.start).toBeCloseTo(29.5, 1);
    expect(f.end).toBeCloseTo(31.5, 1);
    expect(f.x).toBeCloseTo(0.5, 2);      // 574/1147
    expect(f.w).toBeCloseTo(0.105, 2);    // 120/1147
    expect(f.h).toBeCloseTo(0.05, 2);     // 36/720
  });

  it("falls back to recording durationMs when no duration given", () => {
    const intel = eventsToMotionIntel(base({ mutationsIdle: [{ from: 0, to: 60000 }] }), 0);
    expect(intel.idle.duration).toBe(120);
    expect(intel.idle.ranges[0]).toEqual({ start: 0, end: 60 });
  });
});
