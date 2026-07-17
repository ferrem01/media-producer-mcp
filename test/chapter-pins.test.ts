import { describe, it, expect } from "vitest";
import { planChapterPins } from "../src/core/auto-compress.js";
import { transitionsFromScores } from "../src/core/compress-waiting.js";
import { solveMediaEdits, mapSourceTime, edlOutputDuration } from "../src/core/media-edl.js";

describe("transitionsFromScores", () => {
  // 4 fps score series builders
  const quiet = (n: number) => Array(n).fill(0.5);
  const typing = (n: number) => Array.from({ length: n }, (_, i) => 2 + (i % 3));

  it("finds an isolated spike and ignores baseline activity", () => {
    const scores = [...typing(40), 80, ...typing(40)]; // spike at frame 40 = 10s
    const t = transitionsFromScores(scores, 4);
    expect(t).toEqual([10]);
  });

  it("rejects sustained high motion (scrolling)", () => {
    // 3s of continuous high scores = a scroll, not a cut
    const scores = [...quiet(40), ...Array(12).fill(60), ...quiet(40)];
    expect(transitionsFromScores(scores, 4)).toEqual([]);
  });

  it("collapses multi-step navigations within 3s", () => {
    const scores = [...quiet(40), 90, ...quiet(4), 85, ...quiet(60)];
    const t = transitionsFromScores(scores, 4);
    expect(t.length).toBe(1);
  });

  it("returns empty for flat footage", () => {
    expect(transitionsFromScores(quiet(200), 4)).toEqual([]);
  });
});

describe("planChapterPins", () => {
  // A simple compressed map: 0-60 active 1x, 60-120 idle 4x, 120-180 active 1x
  // Output timeline: 0-60 (src 0-60), 60-75 (src 60-120), 75-135 (src 120-180)
  const segments = [
    { src_start: 0, src_end: 60, rate: 1 },
    { src_start: 60, src_end: 120, rate: 4 },
    { src_start: 120, src_end: 180, rate: 1 },
  ];
  const srcDur = 180;
  const sceneDur = 135;

  it("snaps a boundary to a nearby transition and adds the end pin", () => {
    // Chapter at out=80 -> proportional src = 125; transition at 128 is within 6s
    const pins = planChapterPins(
      [{ out: 80, label: "Reviewing Broadcasts" }],
      segments, [30, 128, 170], srcDur, sceneDur,
    );
    expect(pins.length).toBe(2);
    expect(pins[0]).toMatchObject({ out: 80, src: 128, word: "Reviewing Broadcasts" });
    expect(pins[1]).toMatchObject({ out: sceneDur, src: srcDur });
  });

  it("skips boundaries with no confident transition nearby", () => {
    const pins = planChapterPins([{ out: 80 }], segments, [30, 170], srcDur, sceneDur);
    expect(pins).toEqual([]); // nothing within 6s of src 125 -> no pins, no end pin
  });

  it("keeps pins monotonic and respects scene edges", () => {
    const pins = planChapterPins(
      [{ out: 1 }, { out: 40 }, { out: 41 }, { out: 133 }],
      segments, [2, 39, 41.5, 176], srcDur, sceneDur,
    );
    // out=1 (< 3s) and out=133 (> sceneDur-5) skipped; 40+41 too close -> one survives
    expect(pins.filter((p) => p.word !== "end").length).toBe(1);
    expect(pins[0].out).toBe(40);
  });

  it("pinned solve lands chapters on their transitions and keeps total duration", () => {
    const pins = planChapterPins([{ out: 80 }], segments, [128], srcDur, sceneDur);
    const rate_regions = [{ src_start: 60, src_end: 120, rate: 4 }];
    const solved = solveMediaEdits({ cuts: [], rate_regions, pins }, srcDur);
    expect(solved.pin_status.every((p) => p.status === "ok")).toBe(true);
    // At out=80 the source now shows the transition frame (128), not 125.
    expect(Math.abs(mapSourceTime(solved.segments, 80) - 128)).toBeLessThan(0.5);
    // End pin holds the narration fit: total output stays the scene duration.
    expect(Math.abs(edlOutputDuration(solved.segments) - sceneDur)).toBeLessThan(0.5);
  });
});
