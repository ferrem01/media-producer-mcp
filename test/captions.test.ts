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

  // THE SCATTER LANE (the Air cut, SPEC-recipes.md presenter-location-hop):
  // a recipe whose captions layer says "scatter" gets phrases of three
  // words at most, no plate, that land at their own spot and stay.
  it("a scatter recipe gets short unplated phrases in scatter mode; every other style the plated lane", () => {
    const spine = assertedSpine("The big picture is that time once spent managing assets and collecting feedback goes back in your team's pocket.", 6);
    const lane = captionLane(spine, [], { style: "scatter" })!;
    expect(lane.type).toBe("reel-caption-lane");
    expect(lane.data.mode).toBe("scatter");
    expect(lane.data.scrim).toBe("shadow");
    expect(lane.data.align).toBe("left");
    expect(lane.data.max_font).toBe(72);
    for (const p of lane.data.phrases as any[]) expect(p.text.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect((lane.data.phrases as any[]).length).toBeGreaterThanOrEqual(6);
    // Anchored like any lane: a later take re-times every phrase edge.
    expect(Object.keys(lane.anchors || {}).length).toBe((lane.data.phrases as any[]).length * 2);
    const plain = captionLane(spine, [], { style: "pill" })!;
    expect(plain.data.mode).toBeUndefined();
    expect(plain.data.scrim).toBe("plate");
    expect((plain.data.phrases as any[]).some((p) => p.text.split(/\s+/).length === 4)).toBe(true);
  });
});

describe("the scatter lane's cut windows", () => {
  it("the choreography flags each proof window with --mp-cut on a scatter lane, and moves a plated lane's top instead", async () => {
    const { wrapperChoreoScript, isScatterLane } = await import("../src/core/scene-assembler.js");
    const proof = { id: "screen_1", type: "video", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data: { src: "/x.mp4" }, enter: { effect: "cut", at: 2.5 }, exit: { effect: "cut", at: 5 } } as any;
    const scatter = { id: "captions", type: "reel-caption-lane", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data: { mode: "scatter", phrases: [] } } as any;
    expect(isScatterLane(scatter)).toBe(true);
    const js = wrapperChoreoScript([proof, scatter], 8);
    expect(js).toMatch(/"scatter":true/);
    expect(js).toMatch(/master\.set\(el, \{ '--mp-cut': 1 \}, w\.at\)/);
    expect(js).toMatch(/master\.set\(el, \{ '--mp-cut': 0 \}, w\.until\)/);
    const plated = { id: "captions", type: "reel-caption-lane", position: { x: "5%", y: "20%", width: "90%", height: "12%" }, data: { phrases: [], cut_top: 70 } } as any;
    expect(isScatterLane(plated)).toBe(false);
    expect(wrapperChoreoScript([proof, plated], 8)).toMatch(/"cutTop":70/);
  });
});
