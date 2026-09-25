import { describe, it, expect } from "vitest";
import { scriptLines, scriptWords, scriptGaps, speakingEstimate, displayScript, PAUSE_GLYPH, LINE_BREATH_S, PAUSE_BEAT_S } from "../src/core/script-lines.js";
import { assertedSpine, splitByScripts } from "../src/core/word-anchors.js";
import { unescapeLines, normalizeSceneShape, liftSceneEmphasis } from "../src/llm/storyboard-builder.js";
import { beatsVoiceover } from "../src/core/beats.js";

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

  it("reads an inline (pause) at the end of a sentence as the same beat", () => {
    const lines = scriptLines("A deck nobody opens. (pause)\nNow what?");
    expect(lines.map((l) => [l.text, l.pause])).toEqual([["A deck nobody opens.", false], ["", true], ["Now what?", false]]);
    expect(scriptLines("Wait (pause) for it.").map((l) => l.text)).toEqual(["Wait", "", "for it."]);
    expect(displayScript("A deck nobody opens. (pause)")).toBe("A deck nobody opens.\n" + PAUSE_GLYPH);
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

describe("lines the writer double-escaped", () => {
  it("become real lines (measured: literal backslash-n on every scene of proj_4488f790)", () => {
    const raw = String.raw`A marketer's week disappears.\nOne for the plan.\n(pause)\n\"Get more signups.\"`;
    const fixed = unescapeLines(raw);
    expect(fixed.split("\n")).toEqual(["A marketer's week disappears.", "One for the plan.", "(pause)", "\"Get more signups.\""]);
    expect(scriptLines(fixed).map((l) => l.pause)).toEqual([false, false, true, false]);
  });
});

describe("every scene the writer returns is held to one shape (whole board and surgical revise)", () => {
  it("unescapes the lines, normalizes component entries, drops unknown types", () => {
    const scene: any = {
      label: "S", duration_seconds: 8,
      voiceover_text: String.raw`It ships it.\n(pause)\nThat's Quotient.`,
      beats: [{ label: "b", duration_seconds: 8, action: "x", voiceover_text: String.raw`It ships it.\n(pause)` }],
      components: [{ type: "kinetic-text", data: { text: "IT SHIPS" } }, { type: "made-up-widget", data: { a: 1 } }, "composer", { type: "sticker-prop" }],
    };
    const notes = normalizeSceneShape(scene, new Set(["kinetic-text", "composer", "sticker-prop"]));
    expect(scene.voiceover_text.split("\n")).toEqual(["It ships it.", "(pause)", "That's Quotient."]);
    expect(scene.beats[0].voiceover_text).toBe("It ships it.\n(pause)");
    expect(scene.components).toEqual([{ type: "kinetic-text", data: { text: "IT SHIPS" } }, "composer", "sticker-prop"]);
    expect(notes.join(" ")).toMatch(/made-up-widget/);
  });
  it("lifts the stars off beat lines too, and off lines derived from starred beats", () => {
    // proj_7adf0eb5 scene 3: narrated per beat, the scene's lines were
    // derived from the starred beats after the first lift had run.
    const scene: any = { label: "S", duration_seconds: 9,
      beats: [{ label: "a", duration_seconds: 4, action: "x", voiceover_text: "It lives right inside *Quotient*," }, { label: "b", duration_seconds: 5, action: "y", voiceover_text: "tracks everything *automatically*." }] };
    normalizeSceneShape(scene);
    expect(scene.beats.map((b: any) => b.voiceover_text)).toEqual(["It lives right inside Quotient,", "tracks everything automatically."]);
    expect(scene.emphasis).toEqual(["quotient", "automatically"]);
    const late: any = { beats: [{ voiceover_text: "we built *Quotient Analytics*." }] };
    late.voiceover_text = beatsVoiceover(late.beats);
    expect(liftSceneEmphasis(late)).toEqual(["quotient", "analytics"]);
    expect(late.voiceover_text).toBe("we built Quotient Analytics.");
    expect(late.voiceover_text).not.toMatch(/\*/);
    const src = require("node:fs").readFileSync(new URL("../src/llm/storyboard-builder.ts", import.meta.url), "utf8");
    expect(src).toMatch(/beatsVoiceover\(beats\);\s*liftSceneEmphasis\(scene\);/);
  });
  it("a one-scene revise keeps the grammar's casting contract", async () => {
    const { grammarContract } = await import("../src/llm/storyboard-surgical.js");
    expect(grammarContract({ treatment: { filmGrammar: "creator-cut" } } as any)).toMatch(/CUTAWAY.*enter.*exit/s);
    expect(grammarContract({ treatment: { filmGrammar: "tempo-cut" } } as any)).toBe("");
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../src/llm/storyboard-surgical.ts", import.meta.url), "utf8");
    expect(src).toMatch(/grammarContract\(project\),/);
  });
  it("the surgical revise sees the library and holds the shape", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../src/llm/storyboard-surgical.ts", import.meta.url), "utf8");
    expect(src).toMatch(/formatCatalogForPrompt\(catalog\)/);
    expect(src).toMatch(/normalizeSceneShape\(scene, catalog/);
    const server = await fs.readFile(new URL("../src/server.ts", import.meta.url), "utf8");
    expect(server).toMatch(/reviseDraftSceneSurgical\(project, op, llmConfig, catalog\)/);
  });
});
