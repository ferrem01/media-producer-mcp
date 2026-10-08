import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";

// Six Tabs on the phone preview (Oct 8): pressing play started every voice
// line at once -- the unlock-all-in-the-gesture play() raced the pause.
describe("Studio play: a clip not yet due unlocks muted", () => {
  it("play() mutes an out-of-window clip and pauses it when the play lands; due is the clip's own window", async () => {
    const src = await fs.readFile("src/preview-app/preview-app.ts", "utf8");
    expect(src).toMatch(/var due = audioDueAt\(audio, state\.masterTime \|\| 0\);\n\s*if \(!due\) audio\.muted = true;/);
    expect(src).toMatch(/if \(!due && !audioDueAt\(audio, state\.masterTime \|\| 0\)\) audio\.pause\(\);\n\s*audio\.muted = false;/);
    // the window rule, evaluated as Studio runs it
    const fnSrc = src.slice(src.indexOf("function audioDueAt"), src.indexOf("function pauseAudio"));
    const audioDueAt = new Function(`${fnSrc}; return audioDueAt;`)();
    const line = (start: number, duration: number) => ({ loop: false, _startTime: start, duration, _trimStart: 0, _clipDur: 0 });
    expect(audioDueAt(line(3.16, 3.5), 0)).toBe(false);
    expect(audioDueAt(line(0, 2.7), 0)).toBe(true);
    expect(audioDueAt(line(0, 2.7), 2.8)).toBe(false);
    expect(audioDueAt({ loop: true }, 99)).toBe(true);
  });
});
