import { describe, it, expect } from "vitest";
import { summarizeMotion, type MotionSamplePoint } from "../src/core/motion-inspect.js";

// The derive layer of get(target='motion'): sampled wrapper states -> a
// plain-English account an agent can act on. The sampling itself needs a
// browser (verified live); the summaries are pure and pinned here.
const pt = (t: number, opacity: number, x: number, scale = 1, visible = opacity > 0): MotionSamplePoint =>
  ({ t, opacity, visible, rect: { x, y: 100, w: 400, h: 300 }, scale });

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
