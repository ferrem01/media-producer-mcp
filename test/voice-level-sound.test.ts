import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { speakingPrompt } from "../src/core/seedance.js";
import { HF_PERFORMANCE_PROMPT } from "../src/core/actor-test.js";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

describe("the voice: its level in Studio, its sound from the setting", () => {
  it("a speaking shot sounds like where it is: never a dry close-mic studio voice", () => {
    const p = speakingPrompt("She sits in a parked car, talking into her phone");
    expect(p).toContain("the acoustics of that place");
    expect(p).toMatch(/hold a microphone/);
    expect(p).not.toMatch(/close-mic|no room echo/i);
    expect(HF_PERFORMANCE_PROMPT).not.toMatch(/close-mic|no room echo/i);
  });

  it("Studio's speaker icon opens a Voice card that saves speaker_track.volume", () => {
    const html = getPreviewHtml();
    expect(html).toContain("function openVoiceCard(project)");
    expect(html).toContain("'/speaker-level/'");
    expect(html).toMatch(/gut\.querySelector\('\.lg-speaker'\)/);
    const index = fs.readFileSync("src/index.ts", "utf8");
    expect(index).toContain("|speaker-level|");
    expect(index).toContain("slProj.speaker_track.volume = ");
  });
});
