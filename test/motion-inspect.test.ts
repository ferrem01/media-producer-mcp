import { describe, it, expect } from "vitest";
import { summarizeMotion, checkBannedMoves, type MotionSamplePoint, type ComponentMotion } from "../src/core/motion-inspect.js";

// The derive layer of get(target='motion'): sampled wrapper states -> a
// plain-English account an agent can act on. The sampling itself needs a
// browser (verified live); the summaries are pure and pinned here.
const pt = (t: number, opacity: number, x: number, scale = 1, visible = opacity > 0): MotionSamplePoint =>
  ({ t, opacity, visible, rect: { x, y: 100, w: 400, h: 300 }, scale, rotation: 0, glow: 0 });

describe("summarizeMotion", () => {
  it("component that never shows is called out loudly", () => {
    const s = summarizeMotion([pt(0, 0, 0), pt(2, 0, 0), pt(4, 0, 0)], 4);
    expect(s).toContain("NEVER VISIBLE");
  });

  it("entrance at a later sample reads as 'enters ~t'", () => {
    const s = summarizeMotion([pt(0, 0, 100), pt(1.5, 1, 100), pt(3, 1, 100), pt(4.5, 1, 100)], 5);
    expect(s).toContain("enters ~1.5s");
    expect(s).not.toContain("exits");
  });

  it("exit before scene end reads as 'exits ~t'", () => {
    const s = summarizeMotion([pt(0, 1, 100), pt(2, 1, 100), pt(4, 0, 100)], 4);
    expect(s).toContain("exits ~4.0s");
  });

  it("drift across samples reads as movement with a path length", () => {
    const s = summarizeMotion([pt(0, 1, 0), pt(1, 1, 120), pt(2, 1, 260), pt(3, 1, 400)], 3);
    expect(s).toMatch(/moves \(\d+px total path\)/);
  });

  it("scale change reads as a zoom range", () => {
    const s = summarizeMotion([pt(0, 1, 100, 1), pt(2, 1, 100, 1.2), pt(4, 1, 100, 1.4)], 4);
    expect(s).toContain("scales 1.00x -> 1.40x");
  });

  it("a visible-but-motionless wrapper is honestly 'static throughout'", () => {
    const s = summarizeMotion([pt(0, 1, 100), pt(2, 1, 102), pt(4, 1, 100)], 4);
    expect(s).toContain("static throughout");
  });
});

// The negative half of the physics contract. cutout-physics gets positive
// machinery in the assembler (12fps stepping + ink boil, covered by
// test/cutout-physics.test.ts); what makes `calm` real is that the moves it
// forbids are measured and reported.
const comp = (id: string, pts: Array<Partial<MotionSamplePoint>>): ComponentMotion => ({
  id, type: "kinetic-text", summary: "",
  timeline: pts.map((p, i) => ({
    t: i, opacity: 1, visible: true, rect: { x: 0, y: 0, w: 400, h: 200 },
    scale: 1, rotation: 0, glow: 0, ...p,
  })),
});

describe("checkBannedMoves", () => {
  it("says nothing for a film with no physics contract, or for punchy", () => {
    const bouncy = [comp("a", [{ scale: 0.8 }, { scale: 1.12 }, { scale: 1 }])];
    expect(checkBannedMoves(undefined, bouncy)).toEqual([]);
    expect(checkBannedMoves("punchy", bouncy)).toEqual([]);
  });

  it("calm: an overshoot-and-settle entrance is reported", () => {
    const w = checkBannedMoves("calm", [comp("a", [{ scale: 0.85 }, { scale: 1.09 }, { scale: 1 }])]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/overshoots to 1\.09x and settles back to 1\.00x/);
    expect(w[0]).toMatch(/calm forbids elastic/);
  });

  it("calm: a settle that never passes its resting scale is fine", () => {
    expect(checkBannedMoves("calm", [comp("a", [{ scale: 0.9 }, { scale: 0.98 }, { scale: 1 }])])).toEqual([]);
  });

  it("calm: tilted type is reported; cutout-physics WANTS the tilt", () => {
    const tilted = [comp("a", [{ rotation: -6 }, { rotation: -6 }, { rotation: -6 }])];
    expect(checkBannedMoves("calm", tilted)[0]).toMatch(/tilts 6\.0deg -- calm keeps elements upright/);
    expect(checkBannedMoves("cutout-physics", tilted)).toEqual([]);
  });

  it("cutout-physics: a soft bloom is reported, a hard offset shadow is not", () => {
    expect(checkBannedMoves("cutout-physics", [comp("a", [{ glow: 48 }, { glow: 48 }, { glow: 48 }])])[0])
      .toMatch(/48px blur -- cutout-physics forbids glows/);
    expect(checkBannedMoves("cutout-physics", [comp("a", [{ glow: 6 }, { glow: 6 }, { glow: 6 }])])).toEqual([]);
  });

  it("ignores components with too few visible samples to judge", () => {
    expect(checkBannedMoves("calm", [comp("a", [{ scale: 1.5 }, { opacity: 0, visible: false }])])).toEqual([]);
  });
});
