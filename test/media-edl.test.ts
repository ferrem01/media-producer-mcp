import { describe, it, expect } from "vitest";
import {
  mapSourceTime,
  edlOutputDuration,
  activeSegmentAt,
  normalizeSegments,
  parseEdlAttr,
  screenOwnsClock,
  contractSceneToEdl,
  solveMediaEdits,
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

// ── Screen-owned film clock ──────────────────────────────────────────────────
// Live report: a screen-only recording (no speaker, no music) stayed 3:25
// after cutting it down to ~1:45 -- the stale scene duration left a long
// dead hatch. With nothing audio-anchored, the footage IS the clock.

describe("screenOwnsClock", () => {
  it("true for a bare screen film (and with music only)", () => {
    expect(screenOwnsClock({})).toBe(true);
    expect(screenOwnsClock({ audio: { tracks: [{ type: "music" }] } })).toBe(true);
  });
  it("false once anything audio-anchored exists", () => {
    expect(screenOwnsClock({ speaker: { clips: [{}] } })).toBe(false);
    expect(screenOwnsClock({ audio: { tracks: [{ type: "voiceover" }] } })).toBe(false);
  });
});

describe("contractSceneToEdl", () => {
  const seg = (s: number, e: number, rate = 1) => ({ src_start: s, src_end: e, rate });

  it("REGRESSION: cutting a screen-only recording shortens the film", () => {
    const scene: any = {
      duration_seconds: 205, // the stale full-recording length
      media_edits: { screencast: { segments: [seg(0, 60), seg(120, 165)] } }, // 105s kept
    };
    expect(contractSceneToEdl({}, scene, "screencast", 205)).toBe(105);
    expect(scene.duration_seconds).toBe(105);
  });

  it("rates count: sped-up footage occupies less film time", () => {
    const scene: any = {
      duration_seconds: 100,
      media_edits: { screencast: { segments: [seg(0, 60, 2), seg(60, 100, 1)] } }, // 30 + 40
    };
    expect(contractSceneToEdl({}, scene, "screencast")).toBe(70);
  });

  it("clearing every edit restores the source duration", () => {
    const scene: any = { duration_seconds: 105 };
    expect(contractSceneToEdl({}, scene, "screencast", 205)).toBe(205);
  });

  it("NEVER moves a speaker film's clock", () => {
    const scene: any = {
      duration_seconds: 100,
      media_edits: { screencast: { segments: [seg(0, 30)] } },
    };
    const project = { audio: { tracks: [{ type: "voiceover" }] } };
    expect(contractSceneToEdl(project, scene, "screencast", 200)).toBe(null);
    expect(scene.duration_seconds).toBe(100);
  });

  it("no-op when already at the natural length or nothing usable", () => {
    const scene: any = { duration_seconds: 105, media_edits: { screencast: { segments: [seg(0, 105)] } } };
    expect(contractSceneToEdl({}, scene, "screencast")).toBe(null);
    expect(contractSceneToEdl({}, { duration_seconds: 50 }, "screencast")).toBe(null); // cleared + unknown srcDur
  });

  it("solver output on a plain cut equals kept footage at 1x (no pad, no hold)", () => {
    const solved = solveMediaEdits({ cuts: [{ src_start: 60, src_end: 120 }] }, 205);
    expect(Math.abs(edlOutputDuration(solved.segments) - 145)).toBeLessThan(0.1);
    expect(solved.segments.every((s: any) => !s.hold)).toBe(true);
  });
});
