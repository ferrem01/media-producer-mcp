import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_GRAMMARS } from "../src/llm/creative-director.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// The social-reel grammar: vertical 9:16 feed films -- hook-first, caption
// scale type, safe zones, loop seam. Pins the contract across every layer
// that has to agree on it.

describe("social-reel grammar registration", () => {
  it("is a first-class grammar in the creative director", async () => {
    expect(FILM_GRAMMARS).toContain("social-reel");
    const src = await read("../src/llm/creative-director.ts");
    expect(src).toContain('"social-reel": the vertical feed dialect');
    expect(src).toMatch(/HOOK beat in the first 2 seconds/);
    expect(src).toMatch(/LOOP SEAM/);
  });

  it("has a storyboard contract with the format's hard rules", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    expect(src).toContain("SOCIAL-REEL FILMS");
    expect(src).toMatch(/top ~12% and bottom ~18%/);       // safe zones
    expect(src).toMatch(/15-28s of SCENE TIME/);           // feed length incl. transitions
    expect(src).toMatch(/SIDE-BY-SIDE IS BANNED/);         // closed layout vocabulary
    expect(src).toMatch(/LANDSCAPE SURFACES GET CROPPED, NOT SHRUNK/);
    expect(src).toMatch(/CAPTIONS ARE THE VOICEOVER/);     // no narrator
    expect(src).toMatch(/OBJECTS, NOT STRINGS/);           // component-first
  });

  it("gets the component-first policy and the music-first spine", async () => {
    const src = await read("../src/llm/pipeline.ts");
    expect(src).toMatch(/filmGrammar === "social-reel" && opts\.creativity === undefined/);
    expect(src).toMatch(/filmGrammar === "tempo-cut" \|\| filmGrammar === "editorial" \|\| filmGrammar === "social-reel"/);
  });

  it("is exposed on the generate tool and defaults the canvas vertical", async () => {
    const src = await read("../src/server.ts");
    expect(src).toMatch(/"launch-film", "tempo-cut", "speaker-screencast", "editorial", "social-reel"/);
    expect(src).toMatch(/film_grammar === "social-reel"[\s\S]{0,120}width: 1080, height: 1920/);
    expect(src).toContain("social-reel -- vertical 9:16 feed film"); // operator playbook
  });
});
