import { describe, it, expect } from "vitest";
import { faceBand, detectInFrame } from "../src/core/face-band.js";
import { tallSpeakerBands } from "../src/llm/scene-generator.js";
import { pico } from "../src/vendor/pico/pico.js";
import fs from "node:fs";

// Two faces measured live (proj_7c8380c5 kitchen take, proj_c210e5e1 bed take).
const KITCHEN = { cx: 0.545, cy: 0.489, size: 0.375, confidence: 170 };
const BED = { cx: 0.569, cy: 0.61, size: 0.406, confidence: 52 };

describe("the face band", () => {
  it("pads the cascade's square into a head-and-chin no-go region", () => {
    const b = faceBand(KITCHEN);
    expect(b.top).toBeLessThan(KITCHEN.cy - KITCHEN.size * 0.5);
    expect(b.bottom).toBeGreaterThan(KITCHEN.cy + KITCHEN.size * 0.5);
    expect(b.left).toBeGreaterThan(0); expect(b.right).toBeLessThan(1);
  });

  it("finds no face in a blank frame", () => {
    const bytes = fs.readFileSync(new URL("../src/vendor/pico/facefinder", import.meta.url));
    const classify = pico.unpack_cascade(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    expect(detectInFrame(new Uint8Array(270 * 480).fill(128), 270, 480, classify)).toBeNull();
  });
});

describe("tall speaker bands around the person", () => {
  it("without a measured face: the chest-up defaults", () => {
    const b = tallSpeakerBands(undefined);
    expect(b.lower).toEqual({ top: 0.68, bottom: 0.82 });
    expect(b.top).toEqual({ top: 0.13, bottom: 0.30 });
    expect(b.sides).toHaveLength(2);
  });

  it("chest-up kitchen face: lower band under the chin, top band above the hair, room both sides", () => {
    const b = tallSpeakerBands(KITCHEN, 16 / 9);
    const chin = KITCHEN.cy + KITCHEN.size * 0.45;          // ~0.66
    expect(b.lower).not.toBeNull();
    expect(b.lower!.top).toBeGreaterThanOrEqual(chin);
    expect(b.lower!.bottom).toBe(0.82);
    expect(b.top).not.toBeNull();
    expect(b.top!.bottom).toBeLessThanOrEqual(KITCHEN.cy - KITCHEN.size * 0.5); // above the hairline
    // The right of this head leaves 21%: too narrow for a stamp, so both
    // accent slots stack on the left, where there is 30%.
    expect(b.sides.length).toBe(2);
    for (const sp of b.sides) { expect(sp.width).toBeGreaterThanOrEqual(0.26); expect(sp.x).toBe(0.05); }
    expect(b.sides[0].y).toBeLessThan(KITCHEN.cy);
    expect(b.sides[1].y).toBeCloseTo(b.sides[0].y + 0.13, 3);
  });

  it("low camera, face at 61%: no lower band (the chin is at 79%), the top band takes everything, one side only", () => {
    const b = tallSpeakerBands(BED, 16 / 9);
    expect(b.lower).toBeNull();
    expect(b.top).toEqual({ top: 0.13, bottom: 0.32 });
    expect(b.sides.length).toBe(2);
    expect(b.sides.every((sp) => sp.x === 0.05)).toBe(true); // the left has room; the right does not: both rows stack there
    expect(b.sides[1].y).toBeCloseTo(b.sides[0].y + 0.13, 3);
  });
});
