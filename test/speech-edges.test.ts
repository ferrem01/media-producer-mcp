import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { edgesFromLevels, speechLevels, getSpeechEdges } from "../src/core/speech-edges.js";
import { snapToSpeechEdges } from "../src/core/transcribe.js";

// SPEECH EDGES (Oct 12): even with DTW word times, whisper ran the last word
// of every lead-scoring take to the end of the file (0.15-0.63 s past the
// voice) and started one first word 0.31 s after a sharp onset. The ends
// now snap to where the voice's loudness starts and stops.

const run = promisify(execFile);
const DIR = path.join(os.tmpdir(), `mp-speech-edges-${process.pid}`);
afterAll(async () => { await fs.rm(DIR, { recursive: true, force: true }); });

/** Levels at 100 fps: the room at -62 dB, with louder spans painted in. */
const levels = (seconds: number, spans: Array<[number, number, number]>) => {
  const out = Array.from({ length: Math.round(seconds * 100) }, () => -62);
  for (const [from, to, db] of spans) for (let i = Math.round(from * 100); i < Math.round(to * 100); i++) out[i] = db;
  return out;
};

describe("edgesFromLevels", () => {
  it("finds where the voice starts and stops", () => {
    expect(edgesFromLevels(levels(7, [[0.45, 3, -10], [3.4, 6.72, -12]]))).toEqual({ onset: 0.45, offset: 6.72 });
  });

  it("ignores a click shorter than 50 ms and a breath far under the voice", () => {
    const lv = levels(7, [[0.1, 0.13, -8], [0.2, 0.42, -45], [0.45, 6.72, -9], [6.8, 6.83, -9]]);
    expect(edgesFromLevels(lv)).toEqual({ onset: 0.45, offset: 6.72 });
  });

  it("finds nothing in a silent file", () => {
    expect(edgesFromLevels(levels(3, []))).toBeNull();
    expect(edgesFromLevels([])).toBeNull();
  });
});

describe("snapToSpeechEdges", () => {
  // s1 of Why Your Lead Scoring Doesn't Work, as whisper timed it.
  const words = [
    { text: "Everyone", start: 0.76, end: 1.2 },
    { text: "scores", start: 1.2, end: 1.7 },
    { text: "leads.", start: 1.7, end: 2.4 },
    { text: "Nobody's", start: 2.4, end: 5.9 },
    { text: "works.", start: 6.36, end: 6.98 },
  ];

  it("moves only the first start and the last end onto the edges", () => {
    const out = snapToSpeechEdges(words, { onset: 0.45, offset: 6.72 });
    expect(out[0].start).toBe(0.45);
    expect(out[out.length - 1].end).toBe(6.72);
    expect(out.slice(1, -1)).toEqual(words.slice(1, -1));
    expect(out[0].end).toBe(1.2);
    expect(words[0].start).toBe(0.76);   // the input is not mutated
  });

  it("leaves words that already sit on the edges", () => {
    expect(snapToSpeechEdges(words, { onset: 0.74, offset: 6.96 })).toEqual(words);
  });

  it("does not drag a word far: a noise long before speech or after it moves nothing", () => {
    const out = snapToSpeechEdges(words, { onset: 0.05, offset: 5.5 });
    expect(out[0].start).toBe(0.76);
    expect(out[out.length - 1].end).toBe(6.98);
  });

  it("never squeezes the last word to nothing", () => {
    const out = snapToSpeechEdges(words, { onset: 0.76, offset: 6.4 });
    expect(out[out.length - 1].end).toBe(6.98);
  });

  it("packs words whisper pinned to 0 into the lead-in before the first aligned word", () => {
    const pinned = [
      { text: "So", start: 0, end: 0.1 },
      { text: "where", start: 0.1, end: 0.2 },
      { text: "does", start: 1.2, end: 1.4 },
      { text: "it", start: 1.4, end: 1.6 },
    ];
    const out = snapToSpeechEdges(pinned, { onset: 0.8, offset: 1.6 });
    expect(out.map((w) => w.start)).toEqual([0.6, 0.9, 1.2, 1.4]);
    expect(out[1].end).toBe(1.2);
  });
});

describe("speechLevels / getSpeechEdges on a real file", () => {
  it("measures a tone between two silences, and caches it", async () => {
    await fs.mkdir(DIR, { recursive: true });
    const file = path.join(DIR, "voice.wav");
    // 0.5 s silence, 2 s of a 300 Hz tone, 0.8 s silence.
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=2",
      "-af", "adelay=500:all=1,apad=pad_dur=0.8", "-ar", "16000", "-ac", "1", file]);
    const lv = await speechLevels(file);
    expect(lv.length).toBeGreaterThan(320);
    const edges = (await getSpeechEdges(file, DIR))!;
    expect(Math.abs(edges.onset - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(edges.offset - 2.5)).toBeLessThan(0.03);
    const memo = JSON.parse(await fs.readFile(path.join(DIR, "speech-edges.json"), "utf8"));
    expect(memo.edges).toEqual(edges);
  });
});
