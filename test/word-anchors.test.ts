import { describe, it, expect } from "vitest";
import {
  assertedSpine, measuredSpine, resolveAnchor, extractAnchors, resolveComponent, applySpine, clearAnchorsFor, normalizeToken, splitByScripts,
} from "../src/core/word-anchors.js";
import { retimeSceneWith, windowWords, takeDuration } from "../src/core/measured-spine.js";

const SCRIPT = "You're juggling a dozen tools and still guessing. Quotient fixes that. One answer, not another dashboard. Go to getquotient.ai.";

describe("spines", () => {
  it("asserts the script over the scene's duration by word weight, in order, inside the scene", () => {
    const s = assertedSpine(SCRIPT, 15);
    expect(s.source).toBe("asserted");
    expect(s.words.map((w) => w.text).slice(0, 3)).toEqual(["You're", "juggling", "a"]);
    expect(s.words[0].start).toBeGreaterThan(0);
    expect(s.words[s.words.length - 1].end).toBeLessThan(15);
    for (let i = 1; i < s.words.length; i++) expect(s.words[i].start).toBeGreaterThanOrEqual(s.words[i - 1].end - 1e-6);
    // "getquotient.ai" takes longer to say than "a"
    const w = (t: string) => s.words.find((x) => x.text === t)!;
    expect(w("getquotient.ai.").end - w("getquotient.ai.").start).toBeGreaterThan(w("a").end - w("a").start);
  });

  it("measures from whisper segments, splitting a multi-word segment by weight", () => {
    const s = measuredSpine([{ text: "One", start: 11.8, end: 12.0 }, { text: "answer, not", start: 12.1, end: 12.7 }], 17.06);
    expect(s.source).toBe("measured");
    expect(s.words.map((w) => w.text)).toEqual(["One", "answer,", "not"]);
    expect(s.words[1].start).toBe(12.1);
    expect(s.words[2].end).toBe(12.7);
    expect(s.duration).toBe(17.06);
  });

  it("matches words regardless of case and punctuation", () => {
    expect(normalizeToken("Dashboard.")).toBe("dashboard");
    expect(normalizeToken("getquotient.ai")).toBe("getquotientai");
  });
});

describe("resolving an anchor", () => {
  const spine = measuredSpine([
    { text: "One", start: 11.8, end: 12.0 }, { text: "answer,", start: 12.1, end: 12.4 }, { text: "not", start: 12.4, end: 12.6 },
    { text: "another", start: 12.7, end: 13.1 }, { text: "dashboard.", start: 13.2, end: 13.9 }, { text: "Go", start: 14.0, end: 14.2 },
    { text: "to", start: 14.2, end: 14.3 }, { text: "getquotient.ai.", start: 14.3, end: 16.0 }, { text: "One", start: 16.2, end: 16.5 },
  ], 17);

  it("finds the word's start by default, its end on request, with an offset", () => {
    expect(resolveAnchor(spine, { word: "dashboard" })).toBe(13.2);
    expect(resolveAnchor(spine, { word: "Dashboard.", edge: "end" })).toBe(13.9);
    expect(resolveAnchor(spine, { word: "dashboard", offset: -0.3 })).toBe(12.9);
    expect(resolveAnchor(spine, { word: "getquotient.ai" })).toBe(14.3);
  });

  it("takes the nth occurrence and multi-word phrases", () => {
    expect(resolveAnchor(spine, { word: "One" })).toBe(11.8);
    expect(resolveAnchor(spine, { word: "One", occurrence: 2 })).toBe(16.2);
    expect(resolveAnchor(spine, { word: "not another dashboard" })).toBe(12.4);
    expect(resolveAnchor(spine, { word: "not another dashboard", edge: "end" })).toBe(13.9);
  });

  it("returns null for a word the speaker never said", () => {
    expect(resolveAnchor(spine, { word: "synergy" })).toBeNull();
    expect(resolveAnchor(spine, { word: "One", occurrence: 3 })).toBeNull();
  });
});

describe("anchors on a component", () => {
  it("lifts anchor objects and @shorthand out of data at any depth, leaving 0 until resolved", () => {
    const c: any = {
      id: "captions", type: "reel-caption-lane",
      data: {
        at: { word: "dashboard" }, exit_at: "@dashboard$+0.5",
        phrases: [{ text: "One answer.", start: "@One", end: { word: "answer", edge: "end" } }, { text: "x", start: 3, end: 4 }],
        script: [{ action: "type", at: "@Go#1-0.2" }],
        color: "#393bf5",
      },
    };
    expect(extractAnchors(c)).toBe(5);
    expect(c.anchors).toEqual({
      "at": { word: "dashboard" },
      "exit_at": { word: "dashboard", edge: "end", offset: 0.5 },
      "phrases[0].start": { word: "One" },
      "phrases[0].end": { word: "answer", edge: "end" },
      "script[0].at": { word: "Go", occurrence: 1, offset: -0.2 },
    });
    expect(c.data.at).toBe(0);
    expect(c.data.phrases[1]).toEqual({ text: "x", start: 3, end: 4 }); // numbers untouched
    expect(c.data.color).toBe("#393bf5");
  });

  it("resolves every anchored field into data and reports the ones the script lacks", () => {
    const c: any = { id: "strike", type: "prop-strike", data: { text: "DASHBOARD", at: "@dashboard-0.4", strike_at: { word: "dashboard" }, exit_at: "@synergy" } };
    extractAnchors(c);
    const spine = assertedSpine(SCRIPT, 15);
    const r = resolveComponent(c, spine);
    expect(r.resolved).toBe(2);
    expect(r.unresolved).toEqual([{ component: "strike", path: "exit_at", word: "synergy" }]);
    const dash = spine.words.find((w) => w.text === "dashboard.")!;
    expect(c.data.strike_at).toBe(dash.start);
    expect(c.data.at).toBeCloseTo(dash.start - 0.4, 3);
    expect(c.anchors["strike_at"]).toEqual({ word: "dashboard" }); // kept for the next spine
  });

  it("re-resolves against a measured spine without re-authoring", () => {
    const scene: any = { duration_seconds: 15, components: [{ id: "c", type: "composer", data: { at: "@How's", send_at: "@doing$", exit_at: 9 } }] };
    applySpine(scene, assertedSpine("How's this campaign actually doing? Email social web.", 15));
    const asserted = scene.components[0].data.at;
    expect(asserted).toBeGreaterThan(0);
    applySpine(scene, measuredSpine([{ text: "How's", start: 5.6, end: 5.9 }, { text: "this campaign actually", start: 5.9, end: 6.9 }, { text: "doing?", start: 6.9, end: 7.2 }], 17));
    expect(scene.components[0].data.at).toBe(5.6);
    expect(scene.components[0].data.send_at).toBe(7.2);
    expect(scene.components[0].data.exit_at).toBe(9); // never anchored, never touched
    expect(scene.spine.source).toBe("measured");
  });

  it("a hand-set number drops the anchor it overrides, and only that one", () => {
    const c: any = { anchors: { "at": { word: "a" }, "phrases[0].start": { word: "b" }, "phrases[1].end": { word: "c" }, "exit_at": { word: "d" } } };
    expect(clearAnchorsFor(c, ["at", "phrases"])).toBe(3);
    expect(c.anchors).toEqual({ "exit_at": { word: "d" } });
    expect(clearAnchorsFor(c, ["exit_at"])).toBe(1);
    expect(c.anchors).toBeUndefined();
  });
});

describe("re-timing a scene to its take", () => {
  it("sets both the storyboard entry and the built scene to the take's clock", () => {
    const comp = () => ({ id: "strike", type: "prop-strike", data: { at: "@dashboard", strike_at: "@dashboard$" } });
    const project: any = {
      storyboard: { scenes: [{ label: "S1", voiceover_text: "Not another dashboard.", duration_seconds: 15, components: [comp()] }] },
      scenes: [{ id: "scene_001", duration_seconds: 15, components: [comp()] }],
    };
    const spine = measuredSpine([{ text: "Not", start: 12.4, end: 12.6 }, { text: "another", start: 12.7, end: 13.1 }, { text: "dashboard.", start: 13.2, end: 13.9 }], 17.06);
    const r = retimeSceneWith(project, 0, spine);
    expect(r.duration).toBe(17.06);
    expect(project.storyboard.scenes[0].duration_seconds).toBe(17.06);
    expect(project.scenes[0].duration_seconds).toBe(17.06);
    expect(project.scenes[0].components[0].data).toEqual({ at: 13.2, strike_at: 13.9 });
    expect(project.storyboard.scenes[0].components[0].data).toEqual({ at: 13.2, strike_at: 13.9 });
    expect(r.storyboard?.resolved).toBe(2);
    expect(r.built?.resolved).toBe(2);
  });
});

describe("record all: cutting one recording into scenes", () => {
  const words = [
    ["You're", 0.9], ["juggling", 1.2], ["tools.", 1.8], ["Quotient", 2.5], ["fixes", 2.9], ["that.", 3.1],
    ["How's", 4.0], ["this", 4.2], ["campaign", 4.5], ["doing?", 5.0],
    ["Go", 6.0], ["to", 6.2], ["getquotient.ai.", 6.4],
  ].map(([t, s]) => ({ text: t as string, start: s as number, end: (s as number) + 0.2 }));

  it("cuts where each scene's opening words are heard, a beat before the word", () => {
    const w = splitByScripts(["You're juggling tools. Quotient fixes that.", "How's this campaign doing?", "Go to getquotient.ai."], words, 8);
    expect(w).toEqual([{ start: 0, end: 3.9 }, { start: 3.9, end: 5.9 }, { start: 5.9, end: 8 }]);
  });

  it("confirms with the second word so a common opener does not cut early", () => {
    // "this" appears in scene 1 and opens scene 2: the pair "this year" only matches later.
    const ws = [["Try", 0.5], ["this", 0.8], ["now.", 1.0], ["This", 2.0], ["year", 2.3], ["we", 2.6]]
      .map(([t, s]) => ({ text: t as string, start: s as number, end: (s as number) + 0.2 }));
    expect(splitByScripts(["Try this now.", "This year we grow."], ws, 4)).toEqual([{ start: 0, end: 1.9 }, { start: 1.9, end: 4 }]);
  });

  it("falls back to a proportional cut for a scene whose words were never heard", () => {
    const w = splitByScripts(["You're juggling tools.", "Synergy paradigm shift.", "Go to getquotient.ai."], words, 8);
    expect(w[0].start).toBe(0);
    expect(w[1].start).toBeGreaterThan(0);
    expect(w[2].start).toBe(5.9);                 // the third scene is still found by its words
    expect(w[2].end).toBe(8);
  });
});

describe("windowed takes", () => {
  it("re-base a scene's slice of the recording to the slice's start", () => {
    const words = [{ text: "a", start: 1, end: 1.2 }, { text: "b", start: 4.0, end: 4.3 }, { text: "c", start: 7, end: 7.5 }];
    const take: any = { id: "t", scene_index: 1, source: "/x.mp4", recorded_at: "", trim_start: 3.9, trim_end: 5.9 };
    expect(windowWords(words, take)).toEqual([{ text: "b", start: 0.1, end: 0.4 }]);
    expect(takeDuration(take)).toBe(2);
    expect(takeDuration({ ...take, trim_start: undefined, trim_end: undefined, duration: 17.06 })).toBe(17.06);
  });
});
