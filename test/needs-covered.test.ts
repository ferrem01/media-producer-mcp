import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { needCoveredByCast, openAssetNeeds } from "../src/core/asset-needs.js";

// A slated need (a screen, a live-action clip) is open on a built film only
// while its scene still carries the slate. Measured live, proj_c99e52c3:
// every scene rebuilt from library pieces, Studio still listing "Screen
// recording needed" on six of seven scenes.
const need = { type: "screen_recording", description: "A pricing page visited twice", status: "needed", priority: "critical" } as any;
const slate = { id: "s", type: "asset-placeholder", data: { need: "A pricing page visited twice", text: "x" } };
const mock = { id: "m", type: "click-stream", data: {} };

describe("a need the built scene covered", () => {
  it("is covered when the scene is built and its slate is gone; open while the slate stands or the scene is unbuilt", () => {
    expect(needCoveredByCast({ components: [mock] }, need)).toBe(true);
    expect(needCoveredByCast({ components: [slate, mock] }, need)).toBe(false);
    expect(needCoveredByCast(undefined, need)).toBe(false);
  });
  it("only slated needs: stock footage and a camera take stay open whatever the cast", () => {
    expect(needCoveredByCast({ components: [] }, { ...need, type: "stock_footage" })).toBe(false);
    expect(needCoveredByCast({ components: [] }, { ...need, type: "camera_video" })).toBe(false);
    expect(needCoveredByCast({ components: [] }, { ...need, type: "camera_video", use: "clip" })).toBe(true);
  });
  it("leaves covered needs out of the open proof", () => {
    const project = { storyboard: { scenes: [{ assets: [need] }, { assets: [need] }] }, scenes: [{ components: [mock] }, { components: [slate] }] } as any;
    expect(openAssetNeeds(project).map((n) => n.scene_index)).toEqual([1]);
  });
  it("the desktop and phone Studio read the same rule", async () => {
    const desk = await fs.readFile("src/preview-app/preview-app.ts", "utf-8");
    expect(desk).toMatch(/if \(needCoveredByCast\(project\.scenes\[si\], a\)\) return;/);
    expect(desk).toMatch(/if \(a\.status === 'needed' && needCoveredByCast\(\(project\.scenes \|\| \[\]\)\[si\], a\)\) return;/);
    const phone = await fs.readFile("src/studio-phone.ts", "utf-8");
    expect(phone).toMatch(/!needCoveredByCast\(built, x\)/);
  });
});
