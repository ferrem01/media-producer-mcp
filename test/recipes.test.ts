import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

describe("the recipe: the measured cut of a film with the content removed", () => {
  it("the library loads five valid recipes, each under one grammar with proven frames and a measured source", async () => {
    const { loadRecipes, validateRecipe, recipeSceneBand } = await import("../src/core/recipes.js");
    const rs = loadRecipes();
    expect(rs.map((r) => r.id).sort()).toEqual(["founder-story-broll", "presenter-n-things", "presenter-split-tour", "speaker-kinetic-claims", "speaker-one-take-cards"]);
    for (const r of rs) {
      expect(validateRecipe(r)).toEqual([]);
      expect(["creator-cut", "speaker"]).toContain(r.grammar);
      expect(r.frames_proven.length).toBeGreaterThan(0);
      expect(r.source.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const band = recipeSceneBand(r); expect(band.min).toBeGreaterThan(0); expect(band.max).toBeGreaterThanOrEqual(band.min);
    }
    expect(validateRecipe({ id: "x" })).toContain("missing spine");
  });
  it("briefs the writer with the spine's seconds and word budgets, and checks a board against them", async () => {
    const { getRecipe, recipeBlock, checkBoardAgainstRecipe, wordBudget } = await import("../src/core/recipes.js");
    const r = getRecipe("presenter-n-things")!;
    const block = recipeBlock(r, "16x9");
    expect(block).toMatch(/^## THE RECIPE: Presenter: N things \("presenter-n-things"\) -- MANDATORY/);
    expect(block).toMatch(/3\. PROOF -- person\+cutaway, 10s \(8-12s\), about 28 words \(never more than 33\) -- REPEAT 2-4 times, one scene each\./);
    expect(block).toMatch(/Cutaway \(cutaway\): enters at claim_verb, holds 60% of the beat, out before next_line\./);
    expect(wordBudget(10, 165)).toBe(28);
    // a board that matches the spine passes; one that sprawls is told why
    const good = { scenes: [
      { duration_seconds: 7, voiceover_text: "We shipped a lot this summer. Here are three things you might have missed." },
      { duration_seconds: 3, voiceover_text: "Three things." },
      { duration_seconds: 10, voiceover_text: "One. Memory. Quotient remembers your brand and your voice and draws on it in every draft." },
      { duration_seconds: 10, voiceover_text: "Two. Flows. A welcome series built once and switched on." },
      { duration_seconds: 10, voiceover_text: "Three. Zoom. Create the webinar, sync who came, run the follow-up." },
      { duration_seconds: 7, voiceover_text: "Every one of these came from you. Keep telling us." },
    ] };
    expect(checkBoardAgainstRecipe(good, r)).toEqual([]);
    const bad = { scenes: [{ duration_seconds: 20, voiceover_text: "word ".repeat(80) }, { duration_seconds: 4, voiceover_text: "x" }] };
    const off = checkBoardAgainstRecipe(bad, r);
    expect(off.join(" ")).toMatch(/wants 4-7 scenes; the board has 2/);
    expect(off.join(" ")).toMatch(/Scene 1 runs 20s; no beat in the recipe runs past 12s/);
    expect(off.join(" ")).toMatch(/Scene 1 carries 80 words in 20s/);
  });
  it("applies the recipe's motion to the cast without overriding the writer, and pins the camera", async () => {
    const { getRecipe, applyRecipeMotion, roleOfLabel } = await import("../src/core/recipes.js");
    const r = getRecipe("presenter-n-things")!;
    const scene: any = { label: "Proof - Memory", components: [
      { type: "sticker-prop", data: { kind: "stamp", text: "MEMORY" } },
      { type: "lower-third", data: {} },
      { type: "sticker-prop", data: { kind: "stamp", text: "kept" }, enter: { effect: "rise" } },
      { type: "kinetic-text", data: {} },
    ] };
    expect(roleOfLabel(scene.label, r)).toBe("proof");
    const n = applyRecipeMotion(scene, r, "proof");
    expect(n).toBe(5); // stamp in+out, lower-third in+out, the writer's rise kept but its exit filled; no keyword spec here
    expect(scene.components[0].enter).toEqual({ effect: "pop", duration: 0.35 });
    expect(scene.components[0].exit).toEqual({ effect: "fade", duration: 0.25 });
    expect(scene.components[1].enter).toEqual({ effect: "slide-up", duration: 0.4 });
    expect(scene.components[2].enter).toEqual({ effect: "rise" });
    expect(scene.components[2].exit).toEqual({ effect: "fade", duration: 0.25 });
    expect(scene.components[3].enter).toBeUndefined();
    expect(scene.camera_fixed).toBe(true);
    // the recipe's fixed camera clears a move the writer authored anyway
    const moved: any = { label: "Proof - Zoom", components: [], camera_moves: [{ at: 3, type: "zoom", scale: 1.2, duration: 4 }] };
    expect(applyRecipeMotion(moved, r, "proof")).toBe(1);
    expect(moved.camera_moves).toEqual([]); expect(moved.camera_fixed).toBe(true);
    const k = getRecipe("speaker-kinetic-claims")!;
    const s2: any = { components: [{ type: "kinetic-text", data: {} }] };
    applyRecipeMotion(s2, k, "claim");
    expect(s2.components[0].enter).toBeUndefined(); // type-on is not an assembler effect: left to the component
    expect(s2.camera_fixed).toBeUndefined(); // punch-in per claim
  });
  it("is the third axis: the director gets the menu and honors a pin, the writer gets the block, the pipeline checks and applies, the tool takes it", async () => {
    const director = await read("src/llm/creative-director.ts");
    expect(director).toMatch(/"recipe": "<recipe id> \| null -- THE RECIPE \(the third axis\)/);
    expect(director).toMatch(/THE CALLER HAS FIXED THE RECIPE: "\$\{r\.id\}"/);
    expect(director).toMatch(/recipe: resolveRecipe\(opts, result\.recipe\),/);
    expect(director).toMatch(/const pinnedRecipe = opts\.recipe && getRecipe\(opts\.recipe\);\s*if \(pinnedRecipe\) return pinnedRecipe\.grammar as FilmGrammar;/);
    const builder = await read("src/llm/storyboard-builder.ts");
    expect(builder).toMatch(/if \(opts\.recipe\) band = recipeSceneBand\(opts\.recipe\);/);
    expect(builder).toMatch(/\$\{opts\.recipe \? recipeBlock\(opts\.recipe, /);
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/const recipeObj = getRecipe\(opts\.recipe\) \|\| getRecipe\(\(treatment as any\)\?\.recipe\);/);
    expect(pipeline).toMatch(/recipe: recipeObj,\n\s*\}\);/);
    expect(pipeline).toMatch(/const off = checkBoardAgainstRecipe\(project\.storyboard as any, recipeObj\);/);
    expect(pipeline).toMatch(/touched \+= applyRecipeMotion\(d, recipeObj, roleOfLabel\(d\.label, recipeObj\)\);/);
    expect(await read("src/llm/scene-generator.ts")).toMatch(/if \(!cameraMoves && !\(draft as any\)\.camera_fixed\) \{/);
    const server = await read("src/server.ts");
    expect((server.match(/recipe: z\.string\(\)\.optional\(\)\.describe\("The RECIPE axis/g) || []).length).toBe(3);
    expect((server.match(/recipe: params\.recipe,/g) || []).length).toBe(2);
    expect(await read("package.json")).toMatch(/cp -r src\/recipes dist\//);
  });
});
