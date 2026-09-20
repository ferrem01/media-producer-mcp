import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

describe("the recipe: the measured cut of a film with the content removed", () => {
  it("the library loads nine valid recipes, each under one grammar with proven frames and a measured source", async () => {
    const { loadRecipes, validateRecipe, recipeSceneBand } = await import("../src/core/recipes.js");
    const rs = loadRecipes();
    expect(rs.map((r) => r.id).sort()).toEqual(["ask-work-result", "founder-bookends-chapters", "founder-story-broll", "presenter-location-hop", "presenter-n-things", "presenter-split-tour", "speaker-kinetic-claims", "speaker-one-take-cards", "story-ad-idea-beats"]);
    for (const r of rs) {
      expect(validateRecipe(r)).toEqual([]);
      expect(["creator-cut", "speaker", "hype-cut", "canvas-tour"]).toContain(r.grammar);
      expect(r.frames_proven.length).toBeGreaterThan(0);
      expect(r.source.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const band = recipeSceneBand(r); expect(band.min).toBeGreaterThan(0); expect(band.max).toBeGreaterThanOrEqual(band.min);
    }
    expect(validateRecipe({ id: "x" })).toContain("missing spine");
    // Every beat says how it is made, and the word is one of the six.
    for (const r of rs) for (const b of r.spine) expect(["take", "recording", "motion", "broll", "illustration", "type"]).toContain(b.made);
    expect(validateRecipe({ ...rs[0], spine: [{ role: "x", shot: "screen", made: "screencast", dur: [1, 2, 3] }] })).toContain("beat 1 (x): made must be one of take|recording|motion|broll|illustration|type");
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
    // HOW A BEAT IS MADE (Marc: "when it should be motion graphics vs a screencast").
    const { madeOf, holdMadeToRecipe } = await import("../src/core/recipes.js");
    expect(madeOf({ role: "x", shot: "person", dur: [1, 2, 3] })).toBe("take");
    expect(madeOf({ role: "x", shot: "person+cutaway", dur: [1, 2, 3], cutaway: { at: "start", hold: 1, kind: "screen_recording" } })).toBe("recording");
    expect(madeOf({ role: "x", shot: "screen", dur: [1, 2, 3] })).toBe("motion");
    expect(madeOf({ role: "x", shot: "broll", dur: [1, 2, 3] })).toBe("broll");
    const gr = getRecipe("founder-bookends-chapters")!;
    expect(gr.grammar).toBe("creator-cut");
    expect(recipeSceneBand(gr)).toEqual({ min: 7, max: 8 });
    expect(gr.spine.find((b) => b.role === "chapter")!.made).toBe("motion");
    const gblock = recipeBlock(gr, "16x9");
    expect(gblock).toMatch(/4\. CHAPTER -- screen, 16s .* MADE AS: MOTION GRAPHICS -- library mocks and components perform it, scripted; ask the human for NOTHING on this beat/);
    expect(gblock).toMatch(/1\. HOOK -- person, 11s .* MADE AS: the person's own take/);
    expect(recipeBlock(getRecipe("presenter-n-things")!, "16x9")).toMatch(/3\. PROOF -- person\+cutaway, 10s .* MADE AS: a REAL screen recording the human provides/);
    // The build holds the board to it: a motion beat asks for nothing, a recording beat must ask.
    const chapter: any = { label: "CHAPTER - Memory", purpose: "Memory builds", assets: [{ type: "screen_recording", status: "needed", description: "x" }, { type: "camera_video", status: "needed", description: "t" }], components: [{ type: "asset-placeholder", data: {} }, { type: "quotient-chat", data: {} }] };
    expect(holdMadeToRecipe(chapter, gr)).toEqual(["the camera take ask dropped: no person on this beat", "1 screen need(s) dropped: the beat is motion graphics", "the slate dropped: the beat is motion graphics"]);
    expect(chapter.assets).toEqual([]);
    expect(chapter.components.map((x: any) => x.type)).toEqual(["quotient-chat"]);
    const provided: any = { label: "CHAPTER - Flows", assets: [{ type: "screen_recording", status: "provided", path: "/x.webm", description: "x" }], components: [] };
    expect(holdMadeToRecipe(provided, gr)).toEqual([]);   // a recording that already landed is kept
    // A person beat asks for no screen either: the tool-window mocks the writer cast become no slate.
    const hook: any = { label: "Hook - Three tools", assets: [{ type: "screen_recording", status: "needed", description: "x" }, { type: "camera_video", status: "needed", description: "t" }], components: [{ type: "lower-third", data: {} }, { type: "asset-placeholder", data: {} }] };
    expect(holdMadeToRecipe(hook, gr)).toEqual(["1 screen need(s) dropped: the beat is the person's take", "the slate dropped: the beat is the person's take"]);
    expect(hook.assets.map((x: any) => x.type)).toEqual(["camera_video"]);
    expect(hook.components.map((x: any) => x.type)).toEqual(["lower-third"]);
    const proof: any = { label: "PROOF - Memory", purpose: "Memory remembers the brand", assets: [{ type: "camera_video", status: "needed", description: "t" }], components: [] };
    expect(holdMadeToRecipe(proof, getRecipe("presenter-n-things")!)).toEqual(["a screen_recording need added: the beat is a real recording"]);
    expect(proof.assets.map((x: any) => x.type)).toEqual(["camera_video", "screen_recording"]);
    expect(proof.assets[1].description).toBe("Memory remembers the brand");
    // No person on a chapter: its take ask goes; the kicker is cast by the build.
    const ch2: any = { label: "Chapter 2 - Campaigns From One Brief", assets: [{ type: "camera_video", status: "needed", description: "t" }], components: [{ type: "quotient-campaign", data: {} }] };
    expect(holdMadeToRecipe(ch2, gr)).toEqual(["the camera take ask dropped: no person on this beat"]);
    expect(ch2.assets).toEqual([]);
    const { castChapterKickers } = await import("../src/core/recipes.js");
    const board = { scenes: [
      { label: "Hook - The Three Tools", components: [] },
      { label: "Chapter 1 - Memory Learns Your Brand", components: [{ type: "quotient-chat", data: {} }] },
      { label: "Chapter 2 - Campaigns From One Brief", components: [] },
      { label: "Chapter 3 - Flows Run Forever", components: [{ type: "chapter-kicker", data: { text: "Flows", step: 3, steps: 3 } }] },
      { label: "Return - Hundreds of Teams", components: [] },
    ] } as any;
    expect(castChapterKickers(board, gr)).toBe(2);
    expect(board.scenes[1].components[1]).toEqual({ type: "chapter-kicker", data: { text: "Memory Learns Your Brand", step: 1, steps: 3, at: 0.3 } });
    expect(board.scenes[2].components[0].data).toEqual({ text: "Campaigns From One Brief", step: 2, steps: 3, at: 0.3 });
    expect(board.scenes[3].components.length).toBe(1);   // the writer's own kicker is kept
    expect(board.scenes[0].components.length).toBe(0);
    // No person on the beat: an opaque scene; the wordmark card is the logo-close template.
    const { holdGroundToRecipe, castWordmarkCards } = await import("../src/core/recipes.js");
    const ch3: any = { label: "Chapter 3 - Flows Run Forever" };
    expect(holdGroundToRecipe(ch3, gr)).toBe(true); expect(ch3.transparent_background).toBe(false);
    expect(holdGroundToRecipe({ label: "Hook - the three tools" } as any, gr)).toBe(false);
    const wb: any = { scenes: [
      { label: "Reveal - The Wordmark", voiceover_text: "", components: [{ type: "sticker-prop", data: { kind: "ring" } }] },
      { label: "Return - teams", voiceover_text: "Book at getquotient.ai today.", components: [] },
      { label: "Close - getquotient.ai", voiceover_text: "getquotient.ai", components: [{ type: "sticker-prop", data: { kind: "ring" } }, { type: "reel-caption-lane", data: {} }] },
    ] };
    expect(castWordmarkCards(wb, gr)).toBe(2);
    expect(wb.scenes[0].scene_template).toEqual({ type: "st-logo-close", data: { tagline: "", cta: "", url: "" } });
    expect(wb.scenes[0].components).toEqual([]);
    expect(wb.scenes[2].scene_template).toEqual({ type: "st-logo-close", data: { tagline: "", cta: "", url: "getquotient.ai" } });
    expect(wb.scenes[2].components.map((c: any) => c.type)).toEqual(["reel-caption-lane"]);
    expect(wb.scenes[1].scene_template).toBeUndefined();
    // The logo band carries only customers the brief names.
    const { holdLogoBandToBrief } = await import("../src/core/recipes.js");
    const ret: any = { components: [{ type: "logo-band", data: { logos: [{ text: "Fable" }, { text: "Nestlé" }, { src: "/assets/t/brand-kit/logo.png" }, { text: "Acme" }] } }, { type: "lower-third", data: {} }] };
    expect(holdLogoBandToBrief(ret, "We work with Nestlé and Gamma.")).toEqual(["2 invented logo(s) dropped from the band (not in the brief)"]);
    expect(ret.components[0].data.logos).toEqual([{ text: "Nestlé" }, { src: "/assets/t/brand-kit/logo.png" }]);
    const none: any = { components: [{ type: "logo-band", data: { logos: [{ text: "Fable" }, { text: "Nova" }] } }] };
    expect(holdLogoBandToBrief(none, "How Quotient works.")).toEqual(["2 invented logo(s) dropped from the band (not in the brief)", "the logo band dropped: the brief names no customers"]);
    expect(none.components).toEqual([]);
    const pipeline3 = await read("src/llm/pipeline.ts");
    expect(pipeline3).toMatch(/holdLogoBandToBrief\(d, String\(opts\.prompt \|\| ""\)\)/);
    expect(pipeline3).toMatch(/holdGroundToRecipe\(d, recipeObj\)/);
    expect(pipeline3).toMatch(/castWordmarkCards\(storyboard as any, recipeObj\)/);
    expect(pipeline3).toMatch(/castChapterKickers\(storyboard as any, recipeObj\)/);
    expect(pipeline3).toMatch(/if \(!hasLane && spine\.words\.length && wantMode !== "none"\) \{/);
    // The two components the recipe names take the recipe's motion.
    const { applyRecipeMotion } = await import("../src/core/recipes.js");
    const chScene: any = { components: [{ type: "chapter-kicker", data: { text: "Memory", step: 1, steps: 3 } }, { type: "logo-band", data: { logos: [{ text: "Acme" }] } }] };
    expect(applyRecipeMotion(chScene, gr, "chapter")).toBe(4);
    expect(chScene.components[0].enter).toEqual({ effect: "fade", duration: 0.3 });
    expect(chScene.components[1].enter).toEqual({ effect: "fade", duration: 0.4 });
    expect(chScene.camera_fixed).toBe(true);
    const pipeline2 = await read("src/llm/pipeline.ts");
    expect(pipeline2).toMatch(/const notes = holdMadeToRecipe\(d, recipeObj\);/);
    const w = getRecipe("ask-work-result")!;
    expect(w.grammar).toBe("canvas-tour");
    expect(w.frames_proven).toEqual(["1x1"]);
    expect(recipeSceneBand(w)).toEqual({ min: 4, max: 5 });   // the CTA line lives in the result's last seconds, not a beat of its own
    expect(w.asks.take).toBe("none");
    expect(w.spine.find((b) => b.role === "result")!.dur).toEqual([11, 13, 15]);
    expect(w.spine.find((b) => b.role === "result")!.enters).toEqual(["keyword:fade", "cta-line:fade@-3s"]);
    expect(w.spine.some((b) => b.role === "cta")).toBe(false);
    // A GROUND under the work beat: found footage is kept there when the brief asks (the sheet row's real office).
    expect(w.spine.find((b) => b.role === "work")!.ground).toBe("broll");
    const { pruneNeedsByRecipe: prune2 } = await import("../src/core/recipes.js");
    const work: any = { label: "Work - the pile", assets: [{ type: "stock_footage", description: "a marketer at a desk in a bright office" }] };
    expect(prune2(work, w)).toBe(0);
    expect(work.assets.length).toBe(1);
    const askB: any = { label: "Ask - the sentence", assets: [{ type: "stock_footage", description: "x" }] };
    expect(prune2(askB, w)).toBe(1);
    expect(recipeBlock(w, "1x1")).toMatch(/3\. WORK -- screen, 5s .* A found-footage GROUND may lie under it when the brief asks for one/);
    expect(recipeBlock(w, "9x16")).toMatch(/proven at 1x1; this film ships 9x16/);
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
