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

  // ── The live run (proj_0a31e568) -- the first film to report repairs, and
  // the one that showed what the table still got wrong. ──

  it("repaints illegible text against the measured backdrop", () => {
    const s = scene([{
      id: "kinetic-text", type: "kinetic-text",
      data: { text: "Try Quotient", color: "#8f8f9f" },
      position: { x: "6%", y: "40%", width: "88%", height: "20%" },
    }]);
    // Scene 7 shipped "Try Quotient" at 1.53:1 over the brand's white page.
    const r = repairScene(s, [{
      type: "illegible", text: "Try Quotient",
      detail: 'text "Try Quotient" -- measured contrast 1.53:1 (needs >= 4.5:1)',
      backdropLuminance: 0.94,
    }]);
    expect(r.changed).toBe(true);
    expect(s.components[0].data.color).toBe("#101014");   // light page -> dark ink
  });

  it("repaints a starred accent word too, and matches text the gate split", () => {
    // proj_0b762363: "Every *word*, written." reports as TWO runs -- the base
    // "Every , written." at 1.01:1 and the accent "word" at 2.53:1. Neither is
    // a substring of the authored line, and the accent takes the brand
    // primary rather than data.color.
    const s = scene([{
      id: "kinetic-text", type: "kinetic-text",
      data: { text: "Every *word*, written." },
      position: { x: "6%", y: "35%", width: "88%", height: "20%" },
    }]);
    const r = repairScene(s, [{
      type: "illegible", text: "Every , written.",
      detail: "1.01:1", backdropLuminance: 0.99,
    }]);
    expect(r.changed).toBe(true);
    expect(s.components[0].data.color).toBe("#101014");
    expect(s.components[0].data.accent_color).toBe("#101014");
  });

  it("does not word-match on a single short word", () => {
    const s = scene([{
      id: "kinetic-text", type: "kinetic-text",
      data: { text: "Ship it on Tuesday." },
      position: { x: "6%", y: "35%", width: "88%", height: "20%" },
    }]);
    const r = repairScene(s, [{ type: "illegible", text: "on", detail: "2:1", backdropLuminance: 0.9 }]);
    expect(r.changed).toBe(false);
  });

  it("goes light over a dark backdrop", () => {
    const s = scene([{
      id: "kinetic-text", type: "kinetic-text",
      data: { text: "plan", color: "#17171c" },
      position: { x: "6%", y: "40%", width: "88%", height: "20%" },
    }]);
    repairScene(s, [{ type: "illegible", text: "plan", detail: "2.42:1", backdropLuminance: 0.04 }]);
    expect(s.components[0].data.color).toBe("#ffffff");
  });

  it("leaves text baked into a component's own chrome to the component library", () => {
    // "Likes"/"Comments" at 2.59:1 are quotient-social's internal labels; no
    // scene-data color exists to change, so a patch here would be a lie.
    const s = scene([{
      id: "quotient-social", type: "quotient-social",
      data: { post: { body: "Likes" } },
      position: { x: "10%", y: "10%", width: "70%", height: "60%" },
    }]);
    const r = repairScene(s, [{ type: "illegible", text: "Likes", detail: "2.59:1", backdropLuminance: 0.9 }]);
    expect(r.changed).toBe(false);
  });

  it("does not pretend to fix a ghosting panel", () => {
    // There WAS a patch here: it set data.border/data.shadow. It fired on
    // five of seven scenes of proj_de47d492, the defect survived every time,
    // and not one component in the library reads data.border. A patch that
    // writes data nothing consumes is worse than the badge it replaced.
    const s = scene([
      { id: "bg", type: "mesh-gradient", data: {}, position: { x: "0%", y: "0%", width: "100%", height: "100%" } },
      { id: "card", type: "quotient-social", data: {}, position: { x: "10%", y: "10%", width: "70%", height: "60%" } },
    ]);
    const r = repairScene(s, [{ type: "invisible_surface", detail: "panel vanishes into the backdrop" }]);
    expect(r.changed).toBe(false);
    expect((s.components[1].data as any).border).toBeUndefined();
  });

  it("shrinks a clipped run ONCE per pass, however many times the gate saw it", () => {
    // proj_de47d492: one overflowing line reported as four clipped_text
    // defects (the gate samples the truncation at several widths) shrank the
    // same component 32px -> 16.38px in a single pass.
    const s = scene([{
      id: "kinetic-text", type: "kinetic-text",
      data: { text: "Launch our Free Trial campaign — plan, copy, calendar", font_size: "32px" },
      position: { x: "6%", y: "16%", width: "88%", height: "15%" },
    }]);
    const r = repairScene(s, [
      { type: "clipped_text", text: "Launch our Free Trial camp", detail: "68% cut off" },
      { type: "clipped_text", text: "Launch our Free Trial campaign — plan, copy, cale", detail: "37% cut off" },
      { type: "clipped_text", text: "Launch our Free Trial campaign — plan, copy, calendar", detail: "27% cut off" },
    ]);
    expect(r.changed).toBe(true);
    expect(s.components[0].data.font_size).toBe("25.6px");  // 32 * 0.8, once
    expect(s.components[0].position.height).toBe("23%");    // round(15 * 1.5), once
  });

  it("does not shrink type to fix what is really a position problem", () => {
    // Same run: the text sat 51% past the LEFT canvas edge. No font size
    // brings it back on frame.
    const s = scene([{
      id: "kinetic-text", type: "kinetic-text",
      data: { text: "Launch our Free Trial campaign", font_size: "32px" },
      position: { x: "6%", y: "16%", width: "88%", height: "15%" },
    }]);
    const r = repairScene(s, [
      { type: "clipped_text", text: "Launch our Free Trial campaign", detail: "37% cut off" },
      { type: "off_canvas_content", text: "Launch our Free Trial campaign", detail: "sits 51% outside the canvas past the left edge" },
    ]);
    expect(s.components[0].data.font_size).toBe("32px");    // untouched
    expect(r.notes.join()).not.toMatch(/font_size/);
  });

  it("does not fill a dead frame by inflating a sticker", () => {
    // The loop grew sticker-prop 36% -> 54% -> 60% while the subject stayed small.
    const s = scene([
      { id: "sticker-prop", type: "sticker-prop", data: {}, position: { x: "70%", y: "10%", width: "20%", height: "36%" } },
      { id: "board", type: "quotient-campaign", data: {}, position: { x: "8%", y: "20%", width: "50%", height: "40%" } },
    ]);
    repairScene(s, [{ type: "dead_frame", detail: "Content covers only 11% of the frame" }]);
    expect(s.components[0].position.height).toBe("36%");   // untouched
    expect(s.components[1].position.width).toBe("65%");    // 50 * 1.3 -- the subject grew
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
