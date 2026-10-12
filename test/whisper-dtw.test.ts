/**
 * parseWhisperJson: word times from whisper.cpp's DTW token alignment, not
 * its segment offsets. Regression from proj_9f5caa73 scene 10 (Oct 12), a
 * 5.04 s Seedance take of "So where does it break for you? The signal, the
 * score, or the handoff?": the offsets put "So" at 0.01 s (speech starts at
 * ~0.82) and "handoff?" running to 6.76 s, past the end of the file, so the
 * spine squeezed the first words to nothing and piled the last ones on the
 * scene's end. Below is the real `-ml 1 -sow -ojf -dtw base.en` output.
 */
import { describe, it, expect } from "vitest";
import { parseWhisperJson, dtwPreset } from "../src/core/transcribe.js";

const SCENE10 = JSON.stringify({ transcription: [
  { text: "", offsets: { from: 0, to: 10 }, tokens: [{ text: "[_BEG_]", t_dtw: -1 }] },
  { text: " So", offsets: { from: 10, to: 160 }, tokens: [{ text: " So", t_dtw: 90 }] },
  { text: " where", offsets: { from: 160, to: 870 }, tokens: [{ text: " where", t_dtw: 106 }] },
  { text: " does", offsets: { from: 870, to: 910 }, tokens: [{ text: " does", t_dtw: 122 }] },
  { text: " it", offsets: { from: 910, to: 1070 }, tokens: [{ text: " it", t_dtw: 134 }] },
  { text: " break", offsets: { from: 1070, to: 1490 }, tokens: [{ text: " break", t_dtw: 152 }] },
  { text: " for", offsets: { from: 1490, to: 1740 }, tokens: [{ text: " for", t_dtw: 174 }] },
  { text: " you?", offsets: { from: 1740, to: 2300 }, tokens: [{ text: " you", t_dtw: 204 }, { text: "?", t_dtw: 232 }] },
  { text: " The", offsets: { from: 2300, to: 2530 }, tokens: [{ text: " The", t_dtw: 234 }] },
  { text: " signal,", offsets: { from: 2530, to: 3310 }, tokens: [{ text: " signal", t_dtw: 268 }, { text: ",", t_dtw: 322 }] },
  { text: " the", offsets: { from: 3310, to: 3680 }, tokens: [{ text: " the", t_dtw: 332 }] },
  { text: " score,", offsets: { from: 3680, to: 4790 }, tokens: [{ text: " score", t_dtw: 362 }, { text: ",", t_dtw: 418 }] },
  { text: " or", offsets: { from: 4790, to: 4970 }, tokens: [{ text: " or", t_dtw: 422 }] },
  { text: " the", offsets: { from: 4970, to: 4970 }, tokens: [{ text: " the", t_dtw: 434 }] },
  { text: " handoff?", offsets: { from: 4970, to: 6760 }, tokens: [{ text: " hand", t_dtw: 454 }, { text: "off", t_dtw: 474 }, { text: "?", t_dtw: 494 }, { text: "[_TT_338]", t_dtw: -1 }] },
] });
const TAKE_SECONDS = 5.04;

describe("parseWhisperJson with DTW tokens", () => {
  const words = parseWhisperJson(SCENE10, TAKE_SECONDS);
  const at = (t: string) => words.find((w) => w.text === t)!;

  it("keeps every spoken word, in order", () => {
    expect(words.map((w) => w.text)).toEqual(["So", "where", "does", "it", "break", "for", "you?", "The", "signal,", "the", "score,", "or", "the", "handoff?"]);
  });

  it("starts the first word at the speech, not at 0", () => {
    // Measured by ear and loudness: "So" at ~0.82 s.
    expect(at("So").start).toBeGreaterThan(0.7);
    expect(at("So").start).toBeLessThan(1.0);
  });

  it("lands words within a beat of where they are said", () => {
    // Real onsets: signal ~2.48, score ~3.55, handoff ~4.38.
    expect(Math.abs(at("signal,").start - 2.48)).toBeLessThan(0.25);
    expect(Math.abs(at("score,").start - 3.55)).toBeLessThan(0.25);
    expect(Math.abs(at("handoff?").start - 4.38)).toBeLessThan(0.25);
  });

  it("never runs past the file", () => {
    for (const w of words) {
      expect(w.end).toBeLessThanOrEqual(TAKE_SECONDS);
      expect(w.end).toBeGreaterThan(w.start);
    }
    expect(at("handoff?").end).toBeGreaterThan(4.6);
  });

  it("each word ends where the next begins", () => {
    for (let i = 0; i + 1 < words.length; i++) expect(words[i].end).toBeCloseTo(words[i + 1].start, 3);
  });
});

describe("parseWhisperJson without DTW tokens", () => {
  it("falls back to the segment offsets, clamped to the file", () => {
    const raw = JSON.stringify({ transcription: [
      { text: " Hello", offsets: { from: 10, to: 500 } },
      { text: " there.", offsets: { from: 500, to: 6760 } },
    ] });
    const words = parseWhisperJson(raw, 5.04);
    expect(words).toEqual([
      { start: 0.01, end: 0.5, text: "Hello" },
      { start: 0.5, end: 5.04, text: "there." },
    ]);
  });

  it("reads plain -oj output as before when the length is unknown", () => {
    const raw = JSON.stringify({ transcription: [{ text: " Hi", offsets: { from: 1000, to: 1400 } }] });
    expect(parseWhisperJson(raw)).toEqual([{ start: 1, end: 1.4, text: "Hi" }]);
  });
});

describe("dtwPreset", () => {
  it("names whisper.cpp's alignment preset for a model file", () => {
    expect(dtwPreset("/opt/whisper.cpp/models/ggml-base.en.bin")).toBe("base.en");
    expect(dtwPreset("ggml-large-v3.bin")).toBe("large.v3");
    expect(dtwPreset("ggml-large-v3-turbo.bin")).toBe("large.v3.turbo");
    expect(dtwPreset("ggml-base.en-q5_1.bin")).toBeNull();
    expect(dtwPreset("model.bin")).toBeNull();
  });
});
