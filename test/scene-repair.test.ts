import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repairScene, scaleFontSize, type SceneDefect } from "../src/core/scene-repair.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// The auto-fix loop. Every case below is a defect that actually shipped this
// session on a component-assembled scene with `passed:false, attempts:0` --
// the gates measured it and nothing could act on it. These are the same
// repairs that were applied BY HAND to make a social post postable.

const scene = (components: any[], extra: any = {}) =>
  ({ id: "s1", label: "t", duration_seconds: 3, components, ...extra }) as any;

describe("repairScene", () => {
  it("shrinks and re-rooms clipped hook text (proj_cccf2f67 scene 1)", () => {
    const s = scene([{
      id: "kinetic-text", type: "kinetic-text",
      data: { text: "She just shipped a whole campaign.", font_size: "11vw" },
      position: { x: "6%", y: "16%", width: "88%", height: "15%" },
    }]);
    const defects: SceneDefect[] = [{
      type: "clipped_text",
      detail: 'Text "She just shipped a whole campaign." is cut off by div.kinetic-text -- ~54px extends past it vertically.',
      text: "She just shipped a whole campaign.",
    }];
    const r = repairScene(s, defects);
    expect(r.changed).toBe(true);
    expect(s.components[0].data.font_size).toBe("8.8vw");     // 11 * 0.8
    expect(s.components[0].position.height).toBe("23%");      // round(15 * 1.5)
  });

  it("pulls an off-canvas logo back inside the frame (the closer wordmark)", () => {
    const s = scene([{
      id: "image", type: "image", data: { src: "/logo.png" },
      position: { x: "62%", y: "80%", width: "60%", height: "28%" },
    }]);
    const r = repairScene(s, [{ type: "off_canvas_content", detail: "runs past the right edge" }]);
    expect(r.changed).toBe(true);
    expect(s.components[0].position.x).toBe("40%");           // 100 - 60
    expect(s.components[0].position.y).toBe("72%");           // 100 - 28
  });

  it("leaves a deliberate full-bleed layer alone", () => {
    const s = scene([{
      id: "bg", type: "video", data: {},
      position: { x: "0%", y: "0%", width: "100%", height: "100%" },
    }]);
    const r = repairScene(s, [{ type: "off_canvas_content", detail: "edge" }]);
    expect(r.changed).toBe(false);
    expect(s.components[0].position.width).toBe("100%");
  });

  it("pre-rolls a dead entrance", () => {
    const s = scene([{ id: "c", type: "kinetic-text", data: { text: "hi" }, position: { x: "6%", y: "16%", width: "88%", height: "15%" } }]);
    const r = repairScene(s, [{ type: "dead_entrance", detail: "1% content coverage 0.8s in" }]);
    expect(s.entrance).toBe("settled");
    expect(r.notes.join()).toMatch(/settled/);
  });

  it("enlarges the primary surface when the frame reads empty", () => {
    const s = scene([{
      id: "quotient-campaign", type: "quotient-campaign", data: {},
      position: { x: "62%", y: "12%", width: "35%", height: "72%" },
    }]);
    const r = repairScene(s, [{ type: "dead_frame", detail: "Content covers only 9% of the frame" }]);
    expect(r.changed).toBe(true);
    expect(s.components[0].position.width).toBe("46%");       // 35 * 1.3
    expect(s.components[0].position.height).toBe("80%");      // capped
  });

  it("does NOT invent fixes for judgment defects", () => {
    const s = scene([{ id: "c", type: "kinetic-text", data: { text: "hi", font_size: "10vw" }, position: { x: "6%", y: "16%", width: "88%", height: "15%" } }]);
    const before = JSON.stringify(s);
    const r = repairScene(s, [
      { type: "intent_mismatch", detail: "notes call for chaos; the frame is orderly" },
      { type: "empty_skeleton", detail: '"CALL CLIENT" is stub text' },
    ]);
    expect(r.changed).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("is bounded -- repeated passes converge instead of spiralling", () => {
    const s = scene([{
      id: "surf", type: "quotient-campaign", data: {},
      position: { x: "10%", y: "10%", width: "40%", height: "40%" },
    }]);
    for (let i = 0; i < 8; i++) repairScene(s, [{ type: "dead_frame", detail: "empty" }]);
    const w = Number(String(s.components[0].position.width).replace("%", ""));
    const h = Number(String(s.components[0].position.height).replace("%", ""));
    expect(w).toBeLessThanOrEqual(94);
    expect(h).toBeLessThanOrEqual(80);
  });
});

describe("scaleFontSize", () => {
  it("keeps units", () => {
    expect(scaleFontSize("11vw", 0.8)).toBe("8.8vw");
    expect(scaleFontSize("48px", 0.5)).toBe("24px");
    expect(scaleFontSize(40, 0.5)).toBe(20);
    expect(scaleFontSize("clamp(1rem, 5vw, 3rem)", 0.8)).toBeNull();
    expect(scaleFontSize(undefined, 0.8)).toBeNull();
  });
});

describe("auto-fix loop wiring", () => {
  it("the authored branch measures, repairs, re-measures and stamps honestly", async () => {
    const p = await read("../src/llm/pipeline.ts");
    expect(p).toMatch(/AUTO-FIX LOOP/);
    expect(p).toMatch(/const repair = repairScene\(opts\.scene, structured\)/);
    // The stamp must be able to say PASSED, and attempts must count repairs.
    expect(p).toMatch(/passed: gateFindings\.length === 0 && runtimeOk/);
    expect(p).toMatch(/attempts: \(prevQ\?\.attempts \?\? 0\) \+ repairPasses/);
  });
});
