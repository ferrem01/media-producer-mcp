import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_GRAMMARS } from "../src/llm/creative-director.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// The hype-cut grammar: tempo-cut's edit driving editorial's alternation --
// one-bar kinetic type interstitials between longer product beats that form
// ONE continuous scripted session. Distilled from the "Word for Word"
// Cowork x Quotient film (proj_bf247f37), whose direction repeatedly broke
// tempo-cut's no-statement-slides law on purpose. Pins the contract across
// every layer that has to agree on it.

describe("hype-cut grammar registration", () => {
  it("is a first-class grammar in the creative director", async () => {
    expect(FILM_GRAMMARS).toContain("hype-cut");
    const src = await read("../src/llm/creative-director.ts");
    expect(src).toContain('"hype-cut": the story-first hype dialect');
    expect(src).toMatch(/PREMISE-FIRST/);
    expect(src).toMatch(/TWO ACTS/);
    expect(src).toMatch(/HYPE-CUT film inverts it further: 10-16 scenes/);
  });

  it("has a storyboard contract with the dialect's hard rules", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    expect(src).toContain("HYPE-CUT FILMS");
    expect(src).toMatch(/INHERITS EVERY TEMPO-CUT LAW/);
    expect(src).toMatch(/THE ALTERNATION AT PACE/);
    expect(src).toMatch(/overrides tempo-cut's no-statement-slides law/);
    expect(src).toMatch(/PREMISE FIRST/);
    expect(src).toMatch(/ONE CONTINUOUS STORY-WORLD/);
    expect(src).toMatch(/TWO-ACT ESCALATION/);
    expect(src).toMatch(/THE CLICK CUT/);
    expect(src).toMatch(/interstitials are st-statement ONLY/);
  });

  it("adds the continuity-of-state law to tempo-cut itself", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    expect(src).toMatch(/CONTINUITY OF STATE: consecutive scenes staging the SAME product surface/);
    expect(src).toMatch(/the grammar's founding complaint/);
  });

  it("gets the component-first policy and the music-first spine", async () => {
    const src = await read("../src/llm/pipeline.ts");
    expect(src).toMatch(/\(filmGrammar === "tempo-cut" \|\| filmGrammar === "hype-cut"\) && opts\.creativity === undefined/);
    expect(src).toMatch(/filmGrammar === "tempo-cut" \|\| filmGrammar === "hype-cut" \|\| filmGrammar === "editorial"/);
  });

  it("never ships label-read voiceovers: text-as-voiceover strip covers it (and tempo-cut/editorial)", async () => {
    const src = await read("../src/llm/pipeline.ts");
    expect(src).toMatch(/\(filmGrammar === "tempo-cut" \|\| filmGrammar === "hype-cut" \|\| filmGrammar === "editorial" \|\| filmGrammar === "social-reel" \|\| filmGrammar === "data-story" \|\| filmGrammar === "canvas-tour"\) && !opts\.voiceover/);
  });

  it("is exposed on the generate tool and the operator instructions", async () => {
    const src = await read("../src/server.ts");
    expect(src).toMatch(/"launch-film", "tempo-cut", "hype-cut", "speaker-screencast"/);
    expect(src).toContain("hype-cut -- story-first hype");
    expect(src).toContain("Choosing: ask what carries the argument");
  });
});
