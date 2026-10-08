import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";

// Six Tabs (Oct 8): "the volume is bouncing from scene to scene" -- the bed
// came back up in the 0.45 s breath every voiced scene ends on.
describe("the bed stays down through the narration", () => {
  it("the render merges voice windows across a breath; Studio ducks the same span and eases", async () => {
    const { DUCK_BRIDGE_S } = await import("../src/audio/mixer.js");
    expect(DUCK_BRIDGE_S).toBeGreaterThanOrEqual(1);
    const mixer = await fs.readFile("src/audio/mixer.ts", "utf8");
    expect(mixer).toMatch(/w\.start <= last\.end \+ DUCK_BRIDGE_S/);
    const src = await fs.readFile("src/preview-app/preview-app.ts", "utf8");
    const fnSrc = src.slice(src.indexOf("  var DUCK_BRIDGE_S"), src.indexOf("  function stopDucking"));
    const inNarration = new Function("state", `${fnSrc}; return inNarration;`);
    const line = (start: number, duration: number) => ({ _trackType: "voiceover", _startTime: start, duration, _trimStart: 0, _clipDur: 0 });
    const state = { audioElements: [line(0, 2.7), line(3.16, 3.8), line(10, 2)] };
    const f = inNarration(state);
    expect(f(2.9)).toBe(true);   // the breath at the cut
    expect(f(8)).toBe(false);    // a real break (3 s)
    expect(f(11)).toBe(true);
    expect(src).toMatch(/var voActive = inNarration\(state\.masterTime \|\| 0\);/);
  });
});
