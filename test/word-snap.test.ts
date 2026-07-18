/**
 * snapWordsOutOfSilences: whisper smears word timestamps across long
 * pauses; the waveform's silence spans are ground truth. Regression built
 * from proj_34d1497c's literal numbers: the baked narration is silent
 * 71.95-81.30s, but whisper timestamped "and a social post example. Great.
 * Here we go. All right," inside the gap -- the words lane promised speech
 * over dead air, and word-anchored cuts would have aimed at silence.
 */
import { describe, it, expect } from "vitest";
import { snapWordsOutOfSilences } from "../src/core/transcribe.js";

const SIL = [{ from: 71.947, to: 81.298 }];

function marcsWords() {
  return [
    { start: 69.85, end: 71.46, text: "example," },
    { start: 71.46, end: 72.19, text: "and" },
    { start: 72.19, end: 72.81, text: "a" },
    { start: 72.81, end: 73.5, text: "social" },
    { start: 73.5, end: 74.86, text: "post" },
    { start: 74.86, end: 76.28, text: "example." },
    { start: 76.28, end: 77.83, text: "Great." },
    { start: 77.83, end: 78.6, text: "Here" },
    { start: 78.6, end: 79.0, text: "we" },
    { start: 79.0, end: 79.97, text: "go." },
    { start: 79.97, end: 80.55, text: "All" },
    { start: 80.55, end: 81.74, text: "right," },
    { start: 81.74, end: 82.16, text: "we're" },
    { start: 82.16, end: 82.83, text: "creating" },
  ];
}

describe("snapWordsOutOfSilences", () => {
  it("no words remain inside a long silence", () => {
    const out = snapWordsOutOfSilences(marcsWords(), SIL);
    for (const w of out) {
      const mid = (w.start + w.end) / 2;
      expect(mid <= SIL[0].from + 0.25 || mid >= SIL[0].to - 0.25).toBe(true);
    }
  });

  it("sentence-aware split: pre-pause sentence packs LEFT, next sentence opens RIGHT", () => {
    const out = snapWordsOutOfSilences(marcsWords(), SIL);
    const by = (t: string) => out.find((w) => w.text === t)!;
    // "...go." closes the sentence before the pause -> ends at the silence edge.
    expect(by("go.").end).toBeLessThanOrEqual(SIL[0].from + 0.01);
    // "All right," starts the sentence spoken after the pause -> after the gap.
    expect(by("All").start).toBeGreaterThanOrEqual(SIL[0].to - 0.01);
    expect(by("right,").start).toBeGreaterThanOrEqual(SIL[0].to - 0.01);
    // Order of the sequence is preserved (sentence builder relies on it).
    const idx = (t: string) => out.findIndex((w) => w.text === t);
    expect(idx("go.")).toBeLessThan(idx("All"));
    expect(idx("right,")).toBeLessThan(idx("we're"));
    // The word already correctly placed after the silence is untouched.
    expect(by("we're").start).toBeCloseTo(81.74, 3);
  });

  it("short silences are ignored", () => {
    const words = [
      { start: 1, end: 2, text: "hi" },
      { start: 2.2, end: 3.2, text: "there" },
    ];
    const out = snapWordsOutOfSilences(words, [{ from: 2.0, to: 2.9 }]);
    expect(out).toEqual(words);
  });

  it("no terminal punctuation inside the gap: everything packs left", () => {
    const words = [
      { start: 10, end: 11, text: "so" },
      { start: 12.5, end: 14, text: "then" },
      { start: 14, end: 16, text: "we" },
      { start: 18.2, end: 19, text: "click" },
    ];
    const out = snapWordsOutOfSilences(words, [{ from: 12, to: 18 }]);
    expect(out[1].end).toBeLessThanOrEqual(12.01);
    expect(out[2].end).toBeLessThanOrEqual(12.01);
    expect(out[3].start).toBeCloseTo(18.2, 3);
  });
});
