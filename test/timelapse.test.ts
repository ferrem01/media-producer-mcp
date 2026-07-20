/**
 * Timelapse beats: exact-duration, cap-exempt spans (Marc's "AI takes so
 * f***ing long" scenario). The solver must honor out_seconds precisely,
 * mark segments tl, keep them out of pin-window flexing, and the shared
 * map must SAMPLE (quantize) fast timelapse playback instead of smearing.
 */
import { describe, it, expect } from "vitest";
import { solveMediaEdits, mapSourceTime, edlOutputDuration } from "../src/core/media-edl.js";

describe("solveMediaEdits with timelapses", () => {
  it("a timelapse span occupies exactly out_seconds, cap-exempt", () => {
    const r = solveMediaEdits(
      { timelapses: [{ src_start: 10, src_end: 130, out_seconds: 4 }] },
      200,
    );
    const tl = r.segments.find((s) => s.tl);
    expect(tl).toBeTruthy();
    expect(tl!.rate).toBeCloseTo(30, 1); // 120s / 4s -- way past the 16x cap
    expect(edlOutputDuration(r.segments)).toBeCloseTo(10 + 4 + 70, 0);
  });

  it("cuts inside the span reduce the kept footage (rate follows)", () => {
    const r = solveMediaEdits(
      {
        cuts: [{ src_start: 40, src_end: 100 }],
        timelapses: [{ src_start: 10, src_end: 130, out_seconds: 4 }],
      },
      200,
    );
    const tls = r.segments.filter((s) => s.tl);
    expect(tls.length).toBeGreaterThan(0);
    // kept inside span = 120 - 60 = 60s over 4s = 15x
    for (const s of tls) expect(s.rate).toBeCloseTo(15, 1);
  });

  it("makes an impossible pin land: fixed beat + free footage at 1x", () => {
    // 142s of footage must reach a pin 6s away -- impossible raw (16x max
    // covers 96s). With a 4s timelapse over most of it, the free remainder
    // fits at sane speed and the pin lands.
    const r = solveMediaEdits(
      {
        pins: [{ out: 6, src: 142 }],
        timelapses: [{ src_start: 0, src_end: 140, out_seconds: 4 }],
      },
      200,
    );
    expect(r.pin_status.find((p) => p.out === 6)?.status).toBe("ok");
    const free = r.segments.filter((s) => !s.tl && !s.hold);
    for (const s of free) expect(s.rate).toBeLessThanOrEqual(1.1);
  });

  it("without the timelapse the same pin strains", () => {
    const r = solveMediaEdits({ pins: [{ out: 6, src: 142 }] }, 200);
    expect(r.pin_status.find((p) => p.out === 6)?.status).toBe("strained");
  });
});

describe("mapSourceTime sampling for fast timelapses", () => {
  const segs = [{ src_start: 0, src_end: 120, rate: 30, tl: 1 as const }]; // 4s beat
  it("quantizes to ~0.45s steps (flipbook, not smear)", () => {
    const a = mapSourceTime(segs, 0.0);
    const b = mapSourceTime(segs, 0.3);   // same sample window
    const c = mapSourceTime(segs, 0.5);   // next sample
    expect(b).toBeCloseTo(a, 3);
    expect(c).toBeGreaterThan(b + 5);     // one step = 0.45*30 = 13.5s of source
  });
  it("smooth (unquantized) below 8x", () => {
    const slow = [{ src_start: 0, src_end: 24, rate: 6, tl: 1 as const }];
    expect(mapSourceTime(slow, 1)).toBeCloseTo(6, 2);
    expect(mapSourceTime(slow, 1.2)).toBeCloseTo(7.2, 2);
  });
});
