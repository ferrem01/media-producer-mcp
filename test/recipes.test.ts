import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

describe("the recipe: the measured cut of a film with the content removed", () => {
  it("the library loads seven valid recipes, each under one grammar with proven frames and a measured source", async () => {
    const { loadRecipes, validateRecipe, recipeSceneBand } = await import("../src/core/recipes.js");
    const rs = loadRecipes();
    expect(rs.map((r) => r.id).sort()).toEqual(["founder-story-broll", "presenter-location-hop", "presenter-n-things", "presenter-split-tour", "speaker-kinetic-claims", "speaker-one-take-cards", "story-ad-idea-beats"]);
    for (const r of rs) {
      expect(validateRecipe(r)).toEqual([]);
      expect(["creator-cut", "speaker", "hype-cut"]).toContain(r.grammar);
      expect(r.frames_proven.length).toBeGreaterThan(0);
      expect(r.source.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const band = recipeSceneBand(r); expect(band.min).toBeGreaterThan(0); expect(band.max).toBeGreaterThanOrEqual(band.min);
    }
    expect(validateRecipe({ id: "x" })).toContain("missing spine");
  });
  it("the story ad and the location hop: a hype-cut recipe with no person, and a creator-cut recipe that hops places", async () => {
    const { getRecipe, recipeBlock, recipeSceneBand, recipesForGrammar } = await import("../src/core/recipes.js");
    const g = getRecipe("story-ad-idea-beats")!;
    expect(g.grammar).toBe("hype-cut");
    expect(recipesForGrammar("hype-cut").map((r) => r.id)).toEqual(["story-ad-idea-beats"]);
    expect(recipeSceneBand(g)).toEqual({ min: 6, max: 9 });
    expect(g.asks.take).toBe("none");
    expect((g.layers as any).voice).toBe("type");
    const gb = recipeBlock(g, "9x16");
    expect(gb).toMatch(/1\. HOOK -- type_card, 2s \(1\.5-2\.5s\), about 6 words \(never more than 7\)\./);
    expect(gb).toMatch(/4\. PROOF -- screen, 2\.5s .* Cutaway \(card, mockup\): enters at start, holds 100% of the beat\./);
    expect(gb).toMatch(/never drop or reorder: hook, pain, reveal, cta\./);
    const a = getRecipe("presenter-location-hop")!;
    expect(a.grammar).toBe("creator-cut");
    expect(recipeSceneBand(a)).toEqual({ min: 9, max: 17 });
    expect(a.spine.filter((b) => b.shot === "broll").map((b) => b.role)).toEqual(["audience", "ease"]);
    expect(a.spine.find((b) => b.role === "feature")!.cutaway).toEqual({ at: "product_name", hold: 0.7, exit_before: "next_beat", use: "cutaway", kind: "screen_recording" });
    expect((a.layers as any).captions.style).toBe("scatter");
    expect(String(a.asks.take)).toMatch(/per-scene take/);
    const ab = recipeBlock(a, "9x16");
    expect(ab).toMatch(/7\. FEATURE -- person\+cutaway, 4\.5s \(4-5\.5s\), about 14 words \(never more than 17\) -- REPEAT 2-3 times, one scene each\./);
    expect(ab).toMatch(/you may drop: proof-line, breather, prop, ease\./);
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
    // A scene named for its beat is held to that beat's own range.
    const a = getRecipe("presenter-location-hop")!;
    const gags = { scenes: [{ label: "AUDIENCE - the founder", duration_seconds: 2.5, voiceover_text: "The founder doing their own marketing." }, { label: "BREATHER - outtake", duration_seconds: 1.3, voiceover_text: "(pause)" }] };
    const offRole = checkBoardAgainstRecipe(gags, a);
    expect(offRole.some((w) => /Scene 1 \(audience\) runs 2\.5s; that beat runs 0\.8-1\.5s\./.test(w))).toBe(true);
    expect(offRole.some((w) => /Scene 2 \(breather\)/.test(w))).toBe(false);
    const { roleOfLabel } = await import("../src/core/recipes.js");
    expect(roleOfLabel("BREATHER - kept outtake after the promise", a)).toBe("breather");
    expect(roleOfLabel("Proof-line - live in a day", a)).toBe("proof-line");
    expect(roleOfLabel("the big-picture beat", a)).toBe("big-picture");
    // A person beat's footage is the take: its b-roll ask is dropped; a broll beat keeps its gag clip.
    const { pruneNeedsByRecipe } = await import("../src/core/recipes.js");
    const person = { label: "PROMISE - get on Quotient", assets: [{ type: "stock_footage", description: "handheld shot of a man walking, talking to camera" }, { type: "camera_video", description: "the take" }] };
    expect(pruneNeedsByRecipe(person, a)).toBe(1);
    expect(person.assets.map((x) => x.type)).toEqual(["camera_video"]);
    const gag = { label: "AUDIENCE - the founder", assets: [{ type: "stock_footage", description: "a dog in a lanyard" }, { type: "camera_video", description: "the take" }] };
    expect(pruneNeedsByRecipe(gag, a)).toBe(0);
    const feature = { label: "FEATURE - Memory", assets: [{ type: "stock_footage", description: "x" }, { type: "screen_recording", description: "y" }] };
    expect(pruneNeedsByRecipe(feature, a)).toBe(1);   // its cutaway is the screen, not found footage
    expect(feature.assets.map((x) => x.type)).toEqual(["screen_recording"]);
    // A person beat keeps the person: a scene template the writer reached for is dropped.
    const { holdShotToRecipe } = await import("../src/core/recipes.js");
    const big: any = { label: "BIG-PICTURE - the time goes back", scene_template: { type: "st-photo-close", data: { headline: "x" } } };
    expect(holdShotToRecipe(big, a)).toBe("st-photo-close");
    expect(big.scene_template).toBeUndefined();
    const gagT: any = { label: "AUDIENCE - the founder", scene_template: { type: "st-statement", data: {} } };
    expect(holdShotToRecipe(gagT, a)).toBeUndefined();
    expect(gagT.scene_template).toBeTruthy();
    // The pipeline runs the prune in the recipe pass and leaves the bar grid alone with a recipe pinned.
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/pruned \+= pruneNeedsByRecipe\(d, recipeObj\);/);
    expect(pipeline).toMatch(/if \(beatMap && !opts\.presetStoryboard && recipeObj\) \{/);
    expect(pipeline).toMatch(/beatGrid: beatMap && !recipeObj \? \{ bpm: beatMap\.bpm, barSec: beatMap\.barSec \} : undefined,/);
    expect(pipeline).toMatch(/const t = holdShotToRecipe\(d, recipeObj\);/);
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
