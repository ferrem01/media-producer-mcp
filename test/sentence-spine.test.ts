import { describe, it, expect } from "vitest";
import { buildSentences, buildChapters } from "../src/core/sentence-spine.js";
import type { TranscriptSegment } from "../src/core/transcribe.js";

/** Lay words out sequentially: [text, dur?, gapAfter?] */
function words(specs: Array<[string, number?, number?]>): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  let t = 0;
  for (const [text, dur = 0.3, gap = 0.05] of specs) {
    out.push({ text, start: t, end: t + dur });
    t += dur + gap;
  }
  return out;
}

describe("buildSentences", () => {
  it("splits on terminal punctuation and joins words cleanly", () => {
    const s = buildSentences(
      words([["Welcome"], ["to"], ["Quotient."], ["Let's"], ["build"], ["a"], ["campaign."]]),
    );
    expect(s.map((x) => x.text)).toEqual(["Welcome to Quotient.", "Let's build a campaign."]);
    expect(s[0].start).toBe(0);
    expect(s[1].start).toBeGreaterThan(s[0].end);
  });

  it("splits on a real pause even without punctuation", () => {
    const s = buildSentences(
      words([["so"], ["we", 0.3, 1.5], ["click"], ["here."]]),
    );
    expect(s.length).toBe(2);
    expect(s[0].text).toBe("so we");
  });

  it("hard-wraps run-on transcription", () => {
    const s = buildSentences(words(Array.from({ length: 50 }, (_, i) => [`w${i}`] as [string])));
    expect(s.length).toBeGreaterThan(1);
    expect(Math.max(...s.map((x) => x.text.split(" ").length))).toBeLessThanOrEqual(24);
  });

  it("attaches punctuation without stray spaces", () => {
    const s = buildSentences(words([["Hello"], [","], ["world"], ["."]]));
    expect(s[0].text).toBe("Hello, world.");
  });
});

describe("buildChapters", () => {
  const sent = (start: number, end: number, text = "s") => ({ text, start, end });

  it("breaks at a long pause once past the minimum length", () => {
    const chapters = buildChapters(
      [sent(0, 14), sent(14.2, 30), sent(33, 45), sent(45.2, 60)],
      { minSeconds: 25, maxSeconds: 75, breakGap: 1.6 },
    );
    expect(chapters.length).toBe(2);
    expect(chapters[0].lastSentence).toBe(1); // pause 30->33 after 30s run
    expect(chapters[1].start).toBe(33);
  });

  it("forces a boundary before a chapter runs away", () => {
    const s = Array.from({ length: 12 }, (_, i) => sent(i * 20, i * 20 + 19));
    const chapters = buildChapters(s, { minSeconds: 25, maxSeconds: 75, breakGap: 5 });
    expect(chapters.length).toBeGreaterThan(2);
    for (const c of chapters) expect(c.end - c.start).toBeLessThanOrEqual(80);
  });

  it("covers every sentence exactly once", () => {
    const s = Array.from({ length: 9 }, (_, i) => sent(i * 10, i * 10 + 9));
    const chapters = buildChapters(s);
    expect(chapters[0].firstSentence).toBe(0);
    expect(chapters[chapters.length - 1].lastSentence).toBe(8);
    for (let i = 1; i < chapters.length; i++) {
      expect(chapters[i].firstSentence).toBe(chapters[i - 1].lastSentence + 1);
    }
  });

  it("returns empty for empty input", () => {
    expect(buildChapters([])).toEqual([]);
  });
});
