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
    // One store: each scene's voiceover_text (and label), saved scene by scene
    // through the board's own PATCH.
    expect(html).toMatch(/api\('PATCH', '\/storyboard\/' \+ encodeURIComponent\(state\.tenantId\)/);
    expect(html).toMatch(/body\.voiceover_text = b\.text;/);
    expect(html).toMatch(/body\.label = b\.label;/);
  });

  it("is ONE text field: scene breaks are lines in the script", () => {
    const html = getPreviewHtml();
    // Everything from the marker constant to the renderer: both helpers, not
    // just the first one a lazy match happens to end on.
    const from = html.indexOf("var SCRIPT_MARK");
    const to = html.indexOf("function renderScriptView", from);
    expect(from, "the script serialiser must exist").toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const src = html.slice(from, to);
    expect(src, "the script serialiser must exist").toContain("scriptFromScenes");
    const io = new Function(`${src}\nreturn { scriptFromScenes, scriptToBlocks };`)() as {
      scriptFromScenes: (s: unknown[]) => string;
      scriptToBlocks: (t: string) => Array<{ label: string | null; text: string }>;
    };
    const scenes = [
      { label: "Cold open", voiceover_text: "You just had one of the best calls of your life." },
      { label: "The turn", voiceover_text: "And then it dies in a folder nobody opens." },
    ];
    const text = io.scriptFromScenes(scenes);
    expect(text.startsWith("## Cold open\n")).toBe(true);
    // Round trip: what comes out is what went in.
    expect(io.scriptToBlocks(text)).toEqual([
      { label: "Cold open", text: scenes[0].voiceover_text },
      { label: "The turn", text: scenes[1].voiceover_text },
    ]);
    // A whole speech pasted in with no markers is still one block, not a loss.
    expect(io.scriptToBlocks("Just some words.\nMore words.")).toEqual([
      { label: null, text: "Just some words.\nMore words." },
    ]);
    // Renaming a scene is just editing its marker line.
    expect(io.scriptToBlocks("## Renamed\nA line.")[0].label).toBe("Renamed");
    // Adding a marker adds a block -- which the view reports as a structural
    // change it cannot apply, rather than silently mangling the mapping.
    expect(io.scriptToBlocks(text + "\n## A new scene\nAnd a line.")).toHaveLength(3);
  });
  it("puts the view switch on the scene rail, not above one scene's card", () => {
    // It sat in the content header, above a single scene -- a control that
    // changed the page's SCOPE while appearing to belong to the scene under
    // it. Board shows one scene, Script shows the whole film: that is a
    // navigation mode, so it belongs on the navigator.
    const html = getPreviewHtml();
    expect(html).toMatch(/function renderDraftModes[\s\S]{0,200}getElementById\('scene-list-head'\)/);
    expect(html, "the content header must not carry it").not.toMatch(/dv-title">' \+ escHtml\(project\.name \|\| project\.project_id\) \+ draftModesHtml/);
  });

  it("keeps ONE scene list on the page: the rail carries the fit in script mode", () => {
    const html = getPreviewHtml();
    // The first pass had a ledger beside the field AND the rail on the left --
    // two scene lists, same film.
    expect(html).not.toContain("sv-ledger");
    expect(html).toMatch(/draftMode === 'script'[\s\S]{0,260}fitSecs\(says\)/);
  });
});
