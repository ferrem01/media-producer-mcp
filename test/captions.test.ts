import { describe, it, expect } from "vitest";
import { emphasisFromLines, fallbackEmphasis, captionPhrases, captionLane } from "../src/core/captions.js";
import { assertedSpine, applySpine, measuredSpine } from "../src/core/word-anchors.js";

// The words are on screen the whole time (SPEC-creator-cut.md): captions
// come from the take's words, two to four at a time, one tinted for
// emphasis, and re-time with the take like every other anchored field.
describe("captions from the take's words", () => {
  it("lifts the writer's *stars* off the line and keeps the clean sentence", () => {
    const r = emphasisFromLines("One *brief*. Every *surface*.\nThat's *Quotient*.");
    expect(r.text).toBe("One brief. Every surface.\nThat's Quotient.");
    expect(r.emphasis).toEqual(["brief", "surface", "quotient"]);
    // Unbalanced stars are left alone.
    expect(emphasisFromLines("a * b")).toEqual({ text: "a * b", emphasis: [] });
    expect(emphasisFromLines("")).toEqual({ text: "", emphasis: [] });
  });

  it("groups words into phrases: end punctuation, a breath, four words or 1.8s breaks; each holds to the next", () => {
    const spine = assertedSpine("Most B2B teams chase qualified signups the hard way. We built a faster path.", 6);
    const ph = captionPhrases(spine, ["faster"]);
    expect(ph.length).toBeGreaterThanOrEqual(4);
    for (const p of ph) expect(p.text.split(/\s+/).length).toBeLessThanOrEqual(4);
    for (let i = 1; i < ph.length; i++) expect(ph[i].start).toBe(ph[i - 1].end);   // no dark gap
    expect(ph.some((p) => /\*faster\*/.test(p.text))).toBe(true);
    // The sentence end breaks the phrase.
    const endsSentence = ph.find((p) => /way\.$/.test(p.text));
    expect(endsSentence).toBeTruthy();
    // A breath in the take breaks it too.
    const gapped = measuredSpine([{ text: "One", start: 0.1, end: 0.3 }, { text: "brief", start: 0.3, end: 0.6 }, { text: "every", start: 1.6, end: 1.9 }, { text: "surface", start: 1.9, end: 2.4 }], 3);
    expect(captionPhrases(gapped).map((p) => p.text)).toEqual(["One brief", "every surface"]);
  });

  it("stars sit outside the word's punctuation so a token stays one word in the lane", () => {
    const spine = assertedSpine("One brief. Every surface.", 3);
    const ph = captionPhrases(spine, ["brief"]);
    expect(ph.map((p) => p.text).join(" | ")).toMatch(/\*brief\.\*/);
  });

  it("with no mark the rule tints ONE word per sentence: a number, then a name, then the brand, then the longest word", () => {
    const spine = assertedSpine("Quotient sent 48 posts to LinkedIn this week. It writes the LinkedIn post. Then it schedules everything on the calendar. We built a faster path.", 12);
    expect(fallbackEmphasis(spine.words, [])).toEqual(["48", "linkedin", "everything", "faster"]);
    // The brand's name wins over the longest word, a capitalized name over the brand.
    const two = assertedSpine("Every surface runs on quotient. Quotient does it.", 4);
    expect(fallbackEmphasis(two.words, ["Quotient"])).toEqual(["quotient"]);
    // A sentence with nothing to tint stays plain; the sentence opener is never a "name".
    expect(fallbackEmphasis(assertedSpine("We do it all.", 2).words, [])).toEqual([]);
  });

  it("a lone trailing word is folded back or the pair rebalanced, never a one-word flash", () => {
    const spine = assertedSpine("Then it schedules everything on the calendar, done, without you even touching it.", 6);
    const texts = captionPhrases(spine).map((p) => p.text);
    expect(texts).not.toContain("it.");
    expect(texts[texts.length - 1]).toBe("touching it.");
    // ...but a word that ends a phrase on punctuation stands on its own ("done,").
    expect(texts).toContain("done,");
  });

  it("the lane is the existing reel-caption-lane, plated, with a word anchor on every phrase edge", () => {
    const spine = assertedSpine("One brief. Every surface. One brief, every surface.", 5);
    const lane = captionLane(spine, ["surface"])!;
    expect(lane.type).toBe("reel-caption-lane");
    expect(lane.id).toBe("captions");
    expect(lane.data.scrim).toBe("plate");
    const phrases = lane.data.phrases as any[];
    expect(phrases.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < phrases.length; i++) {
      expect(lane.anchors![`phrases[${i}].start`]).toBeTruthy();
      expect(lane.anchors![`phrases[${i}].end`]).toBeTruthy();
    }
    // The repeated "brief" anchors by occurrence, so the second phrase pair lands on the second saying.
    const second = Object.values(lane.anchors!).filter((a) => a.word === "One").map((a) => a.occurrence);
    expect(second).toContain(2);
    // The last phrase holds a beat past its last word.
    const last = lane.anchors![`phrases[${phrases.length - 1}].end`];
    expect(last.edge).toBe("end");
    expect(last.offset).toBeCloseTo(0.35);
  });

  it("a take that lands later re-times the phrases through the anchors, like every other timed field", () => {
    const script = "One brief. Every surface.";
    const asserted = assertedSpine(script, 4);
    const lane = captionLane(asserted, ["brief"])!;
    const scene = { components: [lane] };
    // The measured take says it slower: everything shifts.
    const measured = measuredSpine([
      { text: "One", start: 0.5, end: 0.7 }, { text: "brief.", start: 0.7, end: 1.4 },
      { text: "Every", start: 2.0, end: 2.3 }, { text: "surface.", start: 2.3, end: 3.0 },
    ], 3.6);
    const r = applySpine(scene, measured);
    expect(r.unresolved).toEqual([]);
    const ph = (scene.components[0].data as any).phrases;
    expect(ph[0].start).toBe(0.5);
    expect(ph[0].end).toBe(2.0);      // holds until the next phrase begins
    expect(ph[1].start).toBe(2.0);
    expect(ph[1].end).toBeCloseTo(3.35);
    expect(captionLane({ source: "asserted", words: [], duration: 3 })).toBeNull();
  });
});
