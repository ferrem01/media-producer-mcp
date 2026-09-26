import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_GRAMMARS } from "../src/llm/creative-director.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// The relay grammar (SPEC-relay.md): every beat carried by an object -- a
// handoff (the thing ending one beat starts the next) or a through-line (one
// object stays while the beats change around it). Named by Marc after the
// Cosmos rebuild: seventeen hard-cut scenes read as "their own little
// separate scenes"; one 18 s oner with the search bar as its through-line
// read as the film. Pins the contract across every layer that must agree.

describe("relay grammar", () => {
  it("is a first-class grammar in the creative director, with its shape", async () => {
    expect(FILM_GRAMMARS).toContain("relay");
    const src = await read("../src/llm/creative-director.ts");
    expect(src).toContain('"relay": the through-line dialect');
    expect(src).toMatch(/THE HANDOFF/);
    expect(src).toMatch(/THE THROUGH-LINE/);
    expect(src).toMatch(/A RELAY film\nholds 5-14 scenes/);
    expect(src).toMatch(/canvas-tour \| relay \| screencast/);
  });

  it("has a gated storyboard contract whose handoffs are DATA, not prose", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    expect(src).toContain('__g("relay")');
    expect(src).toContain("RELAY FILMS");
    expect(src).toMatch(/"relay": \{ min: 5, max: 14 \}/);
    expect(src).toMatch(/A ONER IS ONE SCENE, NOT A SEQUENCE/);
    expect(src).toMatch(/THE THROUGH-LINE: each oner names ONE object/);
    // The measured gotcha: a travelling through-line clipped by its own box.
    expect(src).toMatch(/its box spans the whole path it travels/);
    // Each kit handoff is written as matching coordinates.
    expect(src).toMatch(/THE HANDOFF: every beat inside a oner STARTS FROM an object of the beat before/);
    for (const k of ['"from":"dot"', "from_x", "retract_at", '"grid" formation', "actions_at"]) expect(src).toContain(k);
    expect(src).toMatch(/TYPE IS THE VOICE, COMING INTO FOCUS/);
    expect(src).toMatch(/no crossfades or wipes anywhere/);
  });

  it("is component-first, music-first, text-as-voice, and cuts hard with standing punctuation", async () => {
    const src = await read("../src/llm/pipeline.ts");
    expect(src).toMatch(/filmGrammar === "relay" && opts\.creativity === undefined/);
    expect(src).toMatch(/filmGrammar === "canvas-tour" \|\| filmGrammar === "relay";/);
    expect(src).toMatch(/\(filmGrammar === "relay" && !opts\.voiceover && !recipeVoice\)/);
    expect(src).toMatch(/if \(filmGrammar === "relay"\) \{\n\s+for \(const sc of project\.scenes/);
    expect(src).toMatch(/<= 1\.5 && sc\.entrance === undefined\) sc\.entrance = "settled"/);
  });

  it("is exposed on the generate tool and the operator instructions", async () => {
    const src = await read("../src/server.ts");
    expect(src).toMatch(/"canvas-tour", "relay", "screencast"/);
    expect(src).toContain("* relay -- every beat CARRIED BY AN OBJECT: one becomes the next, or one stays as the through-line");
    expect(src).toContain("relay: every beat carried by an OBJECT");
  });
});
