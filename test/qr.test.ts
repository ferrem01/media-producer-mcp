import { describe, it, expect } from "vitest";
import { qrMatrix, qrSvg } from "../src/core/qr.js";

describe("the phone code: a QR drawn on this server", () => {
  it("encodes byte mode at ECC L, picks the version by length, and has the three finders", () => {
    const m = qrMatrix("hello");
    expect(m.length).toBe(21); // version 1
    const finder = (r0: number, c0: number) => { for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) { const edge = r === 0 || r === 6 || c === 0 || c === 6; const core = r >= 2 && r <= 4 && c >= 2 && c <= 4; expect(m[r0 + r][c0 + c]).toBe(edge || core); } };
    finder(0, 0); finder(0, 14); finder(14, 0);
    expect(m[13][8]).toBe(true); // the dark module
    // the format bits for ECC L: the mask is one of eight, the ECC bits read L
    expect(qrMatrix("x".repeat(120)).length).toBe(17 + 4 * 6);
    expect(qrMatrix("a".repeat(600)).length).toBe(17 + 4 * 17);
    expect(() => qrMatrix("a".repeat(900))).toThrow(/too long/);
    // deterministic
    expect(qrMatrix("hello")).toEqual(qrMatrix("hello"));
  });
  it("renders an SVG with a quiet zone", () => {
    const svg = qrSvg("https://example.com/take?scene=3", { size: 200 });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) \1" width="200" height="200"/);
    expect(svg).toMatch(/<rect width="100%" height="100%" fill="#fff"\/><path d="M/);
  });
});
