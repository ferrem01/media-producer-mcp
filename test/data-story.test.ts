import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_GRAMMARS } from "../src/llm/creative-director.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// The data-story grammar: numbers as protagonist -- claim/proof beats, one
// live-building figure per scene, escalation to the money number, real
// figures only. Pins the contract across every layer that has to agree.

describe("data-story grammar registration", () => {
  it("is a first-class grammar in the creative director", async () => {
    expect(FILM_GRAMMARS).toContain("data-story");
    const src = await read("../src/llm/creative-director.ts");
    expect(src).toContain('"data-story": the numbers-as-protagonist dialect');
    expect(src).toMatch(/never invent statistics/);
    expect(src).toMatch(/money number lands last and largest/);
  });

  it("has a storyboard contract with the format's hard rules", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    expect(src).toContain("DATA-STORY FILMS");
    expect(src).toMatch(/ONE NUMBER PER BEAT/);
    expect(src).toMatch(/NUMBERS BUILD, NEVER APPEAR/);
    expect(src).toMatch(/ESCALATION ORDER/);
    expect(src).toMatch(/REAL FIGURES ONLY/);
    expect(src).toMatch(/HONEST AXES/);
    expect(src).toMatch(/metric-dashboard is earned ONLY as the finale/);
    const section = src.split("### DATA-STORY FILMS")[1]?.split("### SPEAKER-SCREENCAST")[0] || "";
    expect(section).toContain("OBJECTS, NOT STRINGS"); // component-first inside the data-story contract itself
  });

  it("gets the component-first policy and the music-first spine", async () => {
    const src = await read("../src/llm/pipeline.ts");
    expect(src).toMatch(/filmGrammar === "data-story" && opts\.creativity === undefined/);
    expect(src).toMatch(/filmGrammar === "social-reel" \|\| filmGrammar === "data-story"/);
  });

  it("enforces length + no-voiceover in code, not just in the contract", async () => {
    const src = await read("../src/llm/pipeline.ts");
    expect(src).toMatch(/"data-story": \{ sceneCap: 7, totalCap: 42/);
    expect(src).toMatch(/\(filmGrammar === "tempo-cut" \|\| filmGrammar === "hype-cut" \|\| filmGrammar === "editorial" \|\| filmGrammar === "social-reel" \|\| filmGrammar === "data-story"\) && !opts\.voiceover/);
  });

  it("contract bans invented decompositions and rainbow charts, demands hero scale", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    expect(src).toMatch(/DECOMPOSING a real total into invented parts is inventing/);
    expect(src).toMatch(/CHARTS WEAR THE BRAND/);
    expect(src).toMatch(/>=20% of the frame height/);
  });

  it("is exposed on the generate tool and the operator playbook", async () => {
    const src = await read("../src/server.ts");
    expect(src).toMatch(/"launch-film", "tempo-cut", "hype-cut", "speaker-screencast", "editorial", "social-reel", "data-story"/);
    expect(src).toContain("data-story -- numbers-as-protagonist"); // operator playbook
    expect(src).toMatch(/the numbers \(data-story\)/); // rule of thumb
  });
});
