import { describe, it, expect } from "vitest";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

// THE SCRIPT VIEW: the film as one continuous talk track. The viewer hears one
// voice; the board makes you write it in a dozen separate boxes, so a limp
// handoff or a repeated line is invisible until you watch the cut.

function estimator() {
  const html = getPreviewHtml();
  const src = html.match(/var SPEECH_WPS[\s\S]*?\n {2}}/)?.[0];
  expect(src, "the speech estimator must exist in Studio").toBeTruthy();
  return new Function(`${src}\nreturn speechSeconds;`)() as (t: string) => number;
}

describe("the script view", () => {
  it("estimates speech at a narration pace, and holds a beat for (pause)", () => {
    const speechSeconds = estimator();
    // 2.6 words a second (~155 wpm).
    expect(speechSeconds("one two three four five six seven eight nine ten one two")).toBeCloseTo(12 / 2.6, 2);
    // The board's own beat convention: a line that says only (pause).
    expect(speechSeconds("Hello there.\n(pause)\nAnd we are back.")).toBeCloseTo(6 / 2.6 + 0.6, 2);
    expect(speechSeconds("")).toBe(0);
    expect(speechSeconds("   \n  \n ")).toBe(0);
    // Blank lines are not words; a pause is not a word either.
    expect(speechSeconds("(pause)")).toBeCloseTo(0.6, 2);
  });

  it("survives the template literal: its regexes are not eaten", () => {
    // This file is one big template literal, so a regex needs doubled
    // backslashes to reach the page. When they were eaten, the word splitter
    // became /s+/ -- splitting on the letter s -- and (pause) stopped
    // matching. Both looked fine and silently produced nonsense.
    const html = getPreviewHtml();
    expect(html).toContain("/^\\(pause\\)$/i");
    expect(html).toContain("t.split(/\\s+/)");
    expect(html).not.toContain("/^(pause)$/i");
    expect(html).not.toContain("t.split(/s+/)");
  });

  it("offers itself to films that talk, and says so when they do not", () => {
    const html = getPreviewHtml();
    const src = html.match(/function filmHasVoice[\s\S]*?\n {2}}/)?.[0];
    expect(src).toBeTruthy();
    const filmHasVoice = new Function(`${src}\nreturn filmHasVoice;`)() as (p: unknown, s: unknown[]) => boolean;
    // A voice-led grammar, even before a word is written.
    expect(filmHasVoice({ treatment: { filmGrammar: "speaker" } }, [{}])).toBe(true);
    expect(filmHasVoice({ treatment: { filmGrammar: "screencast" } }, [{}])).toBe(true);
    // On a tempo-cut the on-screen type IS the voiceover: no talk track to show...
    expect(filmHasVoice({ treatment: { filmGrammar: "tempo-cut" } }, [{}])).toBe(false);
    // ...unless the board already has lines in it.
    expect(filmHasVoice({ treatment: { filmGrammar: "tempo-cut" } }, [{ voiceover_text: "A line." }])).toBe(true);
  });

  it("writes through the same route the board card uses, never a second copy", () => {
    const html = getPreviewHtml();
    // One store: each scene's voiceover_text, saved scene by scene.
    expect(html).toMatch(/api\('PATCH', '\/storyboard\/' \+ encodeURIComponent\(state\.tenantId\)[\s\S]{0,200}voiceover_text: dirty\[i\]/);
  });
});
