/** Mode A cut math: idle ∩ silent, complements, margins. Pure functions. */
import { describe, it, expect } from "vitest";
import { intersectRanges, complementRanges, shrinkRanges } from "../src/core/idle-silence.js";

describe("intersectRanges", () => {
  it("intersects overlapping spans", () => {
    expect(intersectRanges(
      [{ from: 0, to: 10 }, { from: 20, to: 30 }],
      [{ from: 5, to: 25 }],
    )).toEqual([{ from: 5, to: 10 }, { from: 20, to: 25 }]);
  });

  it("empty when disjoint", () => {
    expect(intersectRanges([{ from: 0, to: 5 }], [{ from: 6, to: 9 }])).toEqual([]);
  });

  it("handles silence running to Infinity (open silence at EOF)", () => {
    expect(intersectRanges(
      [{ from: 50, to: 74 }],
      [{ from: 60, to: Number.POSITIVE_INFINITY }].map((r) => ({ from: r.from, to: Math.min(r.to, 74) })),
    )).toEqual([{ from: 60, to: 74 }]);
  });
});

describe("complementRanges", () => {
  it("returns the kept spans around cuts", () => {
    expect(complementRanges([{ from: 5, to: 10 }, { from: 20, to: 25 }], 30))
      .toEqual([{ from: 0, to: 5 }, { from: 10, to: 20 }, { from: 25, to: 30 }]);
  });

  it("whole file when no cuts", () => {
    expect(complementRanges([], 12)).toEqual([{ from: 0, to: 12 }]);
  });

  it("no empty head/tail when cuts touch the edges", () => {
    expect(complementRanges([{ from: 0, to: 3 }, { from: 9, to: 12 }], 12))
      .toEqual([{ from: 3, to: 9 }]);
  });
});

describe("shrinkRanges", () => {
  it("adds breathing margin and drops now-too-short cuts", () => {
    expect(shrinkRanges([{ from: 10, to: 16 }, { from: 20, to: 22.5 }], 0.35, 2.5))
      .toEqual([{ from: 10.35, to: 15.65 }]);
  });
});
