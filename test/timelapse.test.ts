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

describe("surplus windows never crawl below 1x (Marc's 0.1x filler bug)", () => {
  // His exact shape: pins on "right," and "wow" define a 12.8s window (talk
  // was left between the pinned words); an 8s beat + 0.5s of residual
  // footage left 4.3s of surplus -- the solver stretched the 0.5s sliver to
  // 0.104x slow motion. Surplus must become a HOLD on the pinned frame.
  it("beat smaller than the pin window -> 1x residual + hold, no sub-1x", () => {
    const r = solveMediaEdits(
      {
        rate_regions: [{ src_start: 0, src_end: 297.89, rate: 1 }],
        pins: [{ out: 30.9, src: 38.5 }, { out: 43.7, src: 264.2 }],
        timelapses: [{ src_start: 38.5, src_end: 263.7, out_seconds: 8 }],
      },
      297.89,
    );
    const sub1 = r.segments.filter((s) => !s.tl && !(s.hold! > 0) && s.rate < 0.99);
    expect(sub1).toEqual([]);
    const hold = r.segments.find((s) => s.hold! > 0 && Math.abs(s.src_start - 264.2) < 0.3);
    expect(hold).toBeTruthy();
    expect(hold!.hold).toBeCloseTo(4.3, 0);
    const st = r.pin_status.find((x) => Math.abs(x.out - 43.7) < 0.1);
    expect(st!.status).toBe("ok");
    expect(st!.detail).toMatch(/arrives early/);
  });

  it("explicit slow-mo regions keep their sub-1x preference", () => {
    const r = solveMediaEdits(
      {
        rate_regions: [{ src_start: 0, src_end: 10, rate: 0.5 }],
        pins: [{ out: 20, src: 10 }],
      },
      60,
    );
    const slow = r.segments.find((s) => s.rate < 0.9);
    expect(slow).toBeTruthy();
    expect(slow!.rate).toBeCloseTo(0.5, 1);
  });
});
