import { describe, it, expect } from "vitest";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

describe("Studio: a timed cutaway waits on its first frame until its cue", () => {
  it("parks (pauses at 0) a scene video whose target is still negative, instead of playing it unseen", () => {
    const html = getPreviewHtml();
    const i = html.indexOf("Regular video asset: start_at is source offset");
    expect(i).toBeGreaterThan(0);
    const block = html.slice(i, i + 1600);
    // The park sits before the shared syncElement call, so nothing plays it early.
    expect(block).toMatch(/if \(target < 0\) \{[\s\S]*?el\.pause\(\)[\s\S]*?_mpSeek\(0\)[\s\S]*?continue;/);
    expect(block.indexOf("if (target < 0)")).toBeLessThan(block.indexOf("syncElement(clip, el, target, playing, true)"));
  });
});
