import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderStoryboardCards, settledMoment } from "../src/core/storyboard-cards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// THE TRUE STORYBOARD: at the storyboard stop-point every scene gets a card
// with a REAL assembled frame -- the same deterministic assembly the build
// will use, no LLM -- photographed at the scene's settled moment, plus the
// full record (purpose, VO, beats, component scripts) and a contact sheet.
// The iterate-round-and-round loop of the golden workflow happens against
// pictures, the way both best films (and Jake Moran) actually worked.

describe("settledMoment", () => {
  it("waits for the slowest performer, then shoots", () => {
    // terminal scene whose last tool-call fires at 12s of 14 -- the case
    // that shipped a near-black card under fixed-time sampling.
    const t = settledMoment({ duration_seconds: 14, components: [
      { data: { script: [{ at: 0.5 }, { at: 9.4 }, { at: 12 }] } },
    ] });
    expect(t).toBeCloseTo(14 * 0.85, 1); // 12.8 clamped to 11.9
  });

  it("never shoots in the scene's first half or exit tail", () => {
    const early = settledMoment({ duration_seconds: 10, components: [{ data: { at: 0.4 } }] });
    expect(early).toBeGreaterThanOrEqual(5);
    expect(early).toBeLessThanOrEqual(8.5);
  });

  it("defaults sensibly with no timing data at all", () => {
    expect(settledMoment({ duration_seconds: 6 })).toBeCloseTo(3.6, 1);
  });
});

describe("renderStoryboardCards", () => {
  it("produces a still per authored scene, a placeholder slot for codegen, and the sheet", async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "sbcards-"));
    const project: any = {
      project_id: "proj_test", tenant_id: "t", name: "Cards Test",
      canvas: { width: 1280, height: 720, fps: 30 },
      brand_kit: { colors: { background: "#ffffff", primary: "#393bf5", text: "#17171c" }, fonts: [] },
      storyboard: {
        narrative: "Cards Test",
        estimated_duration: 11,
        scenes: [
          {
            label: "Typed claim", purpose: "The claim types on", duration_seconds: 5,
            voiceover_text: "One brief.",
            beats: [{ label: "the type", duration_seconds: 5, action: "the line types" }],
            components: [{ type: "typewriter", data: { text: "One brief, a whole campaign.", style: "print", at: 0.4, speed: 30 } }],
          },
          {
            // codegen scene: named but unauthored -- no frame until build.
            label: "Bespoke beat", purpose: "codegen will invent this", duration_seconds: 6,
            components: ["some-custom-thing"],
          },
        ],
      },
    };
    try {
      const res = await renderStoryboardCards(project, {
        componentLibDir: path.resolve(__dirname, "../src/components"),
        gsapDir: path.resolve(__dirname, "../vendor/gsap"),
        outDir,
      });
      expect(res.stills).toHaveLength(2);
      expect(res.stills[0], "authored scene should have a still").toBeTruthy();
      expect(res.stills[1], "codegen scene must NOT fake a frame").toBeNull();
      const still = await fs.stat(res.stills[0]!);
      expect(still.size, "still is suspiciously small -- likely blank").toBeGreaterThan(8_000);
      const sheet = await fs.stat(res.sheet);
      expect(sheet.size).toBeGreaterThan(30_000);
      expect(path.basename(res.sheet)).toBe("storyboard-cards.png");
      expect(path.basename(res.stills[0]!)).toBe("storyboard_card_scene_1.png");
    } finally {
      await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  }, 300_000);
});
