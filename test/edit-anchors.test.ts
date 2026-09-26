import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { applySpine } from "../src/core/word-anchors.js";

// Applying a recipe to a BUILT film with update/add (never a rebuild): a
// component placed now carries a number (it plays today) and an anchor (the
// take re-times it). When the scene already has its words, the edit lands
// the anchor at once.
describe("word anchors on edited components", () => {
  it("an explicit anchor overrides the numeric time, nested paths included", () => {
    const scene: any = {
      spine: { source: "measured", words: [{ text: "just", start: 0, end: 0.2 }, { text: "what", start: 1.07, end: 1.8 }, { text: "worked", start: 2.35, end: 3.0 }] },
      components: [{ id: "c", type: "type-punch-card", data: { lines: [{ text: "What", at: 1.0 }, { text: "Worked?", at: 2.2 }] },
        anchors: { "lines[0].at": { word: "what" }, "lines[1].at": { word: "worked" } } }],
    };
    applySpine(scene, scene.spine);
    expect(scene.components[0].data.lines[0].at).toBeCloseTo(1.07, 2);
    expect(scene.components[0].data.lines[1].at).toBeCloseTo(2.35, 2);
  });
  it("the add and update tools carry anchors and land them when the scene has words", async () => {
    const src = await fs.readFile("src/server.ts", "utf8");
    expect(src).toMatch(/const componentSchema = z\.object\(\{[\s\S]{0,300}anchors: anchorsSchema,/);
    // A component's own zoom (the tall-frame phone scale) survives an add:
    // restoring a film's stickers must not drop them back to desktop size.
    expect(src).toMatch(/const componentSchema = z\.object\(\{[\s\S]{0,400}zoom: z\.number\(\)\.optional\(\)/);
    expect(src).toMatch(/await landAnchorsOnWords\(project, params\.scene_id\);/);
    expect(src).toMatch(/if \(params\.anchors !== undefined\) \{\s*\(comp as any\)\.anchors = \{ \.\.\.\(\(comp as any\)\.anchors \|\| \{\}\), \.\.\.params\.anchors \};/);
    expect(src).toMatch(/if \(sc\?\.spine\?\.words\?\.length\) \{\s*const \{ applySpine \} = await import\("\.\/core\/word-anchors\.js"\);\s*applySpine\(sc, sc\.spine\);/);
  });
});
