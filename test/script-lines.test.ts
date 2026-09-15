import { describe, it, expect } from "vitest";
import { scriptLines, scriptWords, scriptGaps, speakingEstimate, displayScript, PAUSE_GLYPH, LINE_BREATH_S, PAUSE_BEAT_S } from "../src/core/script-lines.js";
import { assertedSpine, splitByScripts } from "../src/core/word-anchors.js";

const SCRIPT = [
  "Your campaign is live.",
  "(pause)",
  "Now what actually happened?",
  "Email, social, web.",
].join("\n");

describe("script notation (SPEC-take-flow.md): one sentence per line, (pause) is a beat", () => {
  it("reads lines, marks pause lines, and gives the last spoken line no trailing breath", () => {
    const lines = scriptLines(SCRIPT);
    expect(lines.map((l) => l.pause)).toEqual([false, true, false, false]);
    expect(lines[0].gapAfter).toBe(LINE_BREATH_S);
    expect(lines[1].gapAfter).toBe(PAUSE_BEAT_S);
    expect(lines[1].text).toBe("");
    expect(lines[3].gapAfter).toBe(0);
    expect(scriptLines("  \n\n")).toEqual([]);
  });

  it("counts only spoken words and totals the authored silence", () => {
    expect(scriptWords(SCRIPT)).toEqual(["Your", "campaign", "is", "live.", "Now", "what", "actually", "happened?", "Email,", "social,", "web."]);
    expect(scriptWords("Hello (PAUSE) there")).toEqual(["Hello", "there"]);
    expect(scriptGaps(SCRIPT)).toBeCloseTo(LINE_BREATH_S + PAUSE_BEAT_S + LINE_BREATH_S, 3);
    expect(speakingEstimate(SCRIPT)).toBeCloseTo(11 / 2.4 + 1.6, 2);
    expect(speakingEstimate("")).toBe(0);
  });

  it("shows a pause as the prompter glyph", () => {
    expect(displayScript(SCRIPT).split("\n")[1]).toBe(PAUSE_GLYPH);
    expect(displayScript(SCRIPT)).not.toMatch(/\(pause\)/i);
  });
});

describe("the asserted spine honours the written silences", () => {
  it("opens a ~1s gap at a (pause) line and a breath at each line break, and never emits the marker as a word", () => {
    const s = assertedSpine(SCRIPT, 12);
    expect(s.words.map((w) => w.text)).not.toContain("(pause)");
    const live = s.words.find((w) => w.text === "live.")!;
    const now = s.words.find((w) => w.text === "Now")!;
    expect(now.start - live.end).toBeCloseTo(LINE_BREATH_S + PAUSE_BEAT_S, 2);
    const happened = s.words.find((w) => w.text === "happened?")!;
    const email = s.words.find((w) => w.text === "Email,")!;
    expect(email.start - happened.end).toBeCloseTo(LINE_BREATH_S, 2);
    // Words inside a line still touch.
    const your = s.words[0], campaign = s.words[1];
    expect(campaign.start).toBeCloseTo(your.end, 3);
    expect(s.words[s.words.length - 1].end).toBeLessThanOrEqual(12 * 0.96 + 1e-6);
  });

  it("shrinks the silences together when a short scene is over-paused, instead of starving the words", () => {
    const over = ["Go.", "(pause)", "(pause)", "(pause)", "(pause)", "Now."].join("\n");
    const s = assertedSpine(over, 3);
    expect(s.words.map((w) => w.text)).toEqual(["Go.", "Now."]);
    expect(s.words[1].end).toBeLessThanOrEqual(3 * 0.96 + 1e-6);
    expect(s.words[0].end - s.words[0].start).toBeGreaterThan(0.3);
  });

  it("a single-line script is unchanged by the notation", () => {
    const plain = assertedSpine("Your campaign is live.", 4);
    expect(plain.words.length).toBe(4);
    expect(plain.words[3].end).toBeCloseTo(4 * 0.96, 2);
  });
});

describe("record-all cuts ignore pause markers when finding where a scene's lines begin", () => {
  it("matches the first spoken words of the next scene, not '(pause)'", () => {
    const words = ["your", "campaign", "is", "live", "now", "what", "actually", "happened"].map((t, i) => ({ text: t, start: i, end: i + 0.8 }));
    const windows = splitByScripts(["Your campaign is live.", "(pause)\nNow what actually happened?"], words, 8);
    expect(windows.length).toBe(2);
    expect(windows[1].start).toBeCloseTo(4 - 0.1, 3);
  });
});
