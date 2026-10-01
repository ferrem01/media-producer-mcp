import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { pruneDeadAnchors } from "../src/core/word-anchors.js";
import { holdMadeToRecipe, getRecipe } from "../src/core/recipes.js";

// Marc, on proj_b7fa998e: the build rewrote scenes set by hand -- a cleared
// screen need re-added with a slate over the chosen mock (the recipe's
// "made: recording"), a stock clip stacked over the chosen b-roll (the
// writer's broll_query), a pill timed at 0.2s moved to the emphasis word (the
// creator-cut sticker rule). "Yes on bug and override."
describe("a scene set by hand", () => {
  it("is marked by the board edit, carried through the save, and skipped by every rewriting pass", async () => {
    const server = await fs.readFile("src/server.ts", "utf-8");
    expect(server).toMatch(/if \(sceneUpdate\.components !== undefined \|\| sceneUpdate\.assets !== undefined\) \(existing as any\)\.hand_set = true;/);
    const pipe = await fs.readFile("src/llm/pipeline.ts", "latin1");
    expect(pipe).toMatch(/const auto = \(storyboard\.scenes as any\[\]\)\.filter\(\(d\) => !d\.hand_set\);/);
    for (const pass of ["applyRecipeMotion", "pruneNeedsByRecipe", "holdShotToRecipe", "holdMadeToRecipe", "holdGroundToRecipe", "holdLogoBandToBrief"]) {
      expect(pipe, pass).toMatch(new RegExp(`for \\(const d of auto\\)[^\\n]*${pass}\\(d`));
    }
    expect(pipe).toMatch(/if \(d\.hand_set\) continue; for \(const n of holdEmptySurfaces\(d\)\)/);
    expect(pipe).toMatch(/if \(filmGrammar === "creator-cut" && d\.transparent_background !== false && !d\.hand_set\) \{/);
    expect(pipe).toMatch(/if \(!q \|\| d\.hand_set\) \{ delete d\.broll_query; continue; \}/);
    expect(pipe).toMatch(/const query: string \| null = \(draft as any\)\.hand_set \? null : \(draft\.broll_query \|\| null\);/);
    expect(pipe).toMatch(/\.\.\.\(\(s as any\)\.hand_set \? \{ hand_set: true \} : \{\}\),/);
  });

  it("the recipe pass that re-added the need still does it on a scene the writer left alone", () => {
    const r = getRecipe("founder-story-broll")!;
    const proof = r.spine.find((b) => b.role === "proof")!;
    const scene: any = { label: "Proof - the agent writes it", purpose: "the agent builds the campaign", assets: [], components: [] };
    expect(proof.made).toBe("recording");
    expect(holdMadeToRecipe(scene, r).join(" ")).toMatch(/screen_recording need added/);
  });
});

describe("merged anchors drop the ones whose place is gone", () => {
  it("a shorter script loses the anchors past its end; live ones and the wrapper's stay", () => {
    const c: any = {
      data: { script: [{ at: 1 }, { at: 2 }], at: 0.5 },
      enter: { effect: "cut", at: 0.3 },
      anchors: { "script[0].at": { word: "a" }, "script[1].at": { word: "b" }, "script[6].at": { word: "g" }, "script[7].at": { word: "h" }, at: { word: "x" }, "enter.at": { word: "e" }, "exit.at": { word: "z" } },
    };
    expect(pruneDeadAnchors(c)).toBe(3);
    expect(Object.keys(c.anchors).sort()).toEqual(["at", "enter.at", "script[0].at", "script[1].at"]);
    const bare: any = { data: {}, anchors: { "lines[2].at": { word: "q" } } };
    pruneDeadAnchors(bare);
    expect(bare.anchors).toBeUndefined();
  });
  it("the update tool prunes after a data, anchors, enter or exit change", async () => {
    const server = await fs.readFile("src/server.ts", "utf-8");
    expect(server).toMatch(/if \(params\.anchors !== undefined \|\| params\.data !== undefined \|\| params\.enter !== undefined \|\| params\.exit !== undefined\) pruneDeadAnchors\(comp as any\);/);
  });
});
