import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";

// Five Tools and Spread Everywhere (speaker films, Oct 8) shipped with no
// captions and a camera that never moved; both were fixed by hand. Captions
// and the punch-in are now the rule on every film a person carries.
describe("a person film is captioned and punched in by rule, not only creator-cut", () => {
  it("the punch-in fires on speaker and creator-cut, never on a film no person carries", async () => {
    const { personCameraMoves } = await import("../src/llm/scene-generator.js");
    const o = { duration: 5, takeover: false, motion: "punchy" };
    expect(personCameraMoves([], { ...o, grammar: "speaker" })![0]).toMatchObject({ type: "zoom", at: 0.2 });
    expect(personCameraMoves([], { ...o, grammar: "creator-cut" })![0]).toMatchObject({ type: "zoom" });
    expect(personCameraMoves([], { ...o, grammar: "hype-cut" })).toBeNull();
    expect(personCameraMoves([], { ...o, grammar: "speaker", takeover: true })).toBeNull();
  });

  it("the caption lane is cast outside the creator-cut-only defaults, and the speaker writer is told", async () => {
    const p = await fs.readFile("src/llm/pipeline.ts", "utf8");
    const gate = p.indexOf('if (filmGrammar === "creator-cut" && d.transparent_background !== false && !d.hand_set) {');
    const caps = p.indexOf("if (d.transparent_background !== false && !d.hand_set) {\n        // THE WORDS ARE ON SCREEN THE WHOLE TIME, on every film a person");
    const lane = p.indexOf("const lane = captionLane(spine");
    expect(gate).toBeGreaterThan(0);
    expect(caps).toBeGreaterThan(gate);
    expect(lane).toBeGreaterThan(caps);
    const b = await fs.readFile("src/llm/storyboard-builder.ts", "utf8");
    const speaker = b.slice(b.indexOf("### SPEAKER FILMS"), b.indexOf("### CREATOR-CUT FILMS"));
    expect(speaker).toMatch(/THE WORDS ARE ON SCREEN THE WHOLE TIME: the build captions every scene/);
  });
});
