import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

// SPEC-creator-formats.md: four hard concepts, each a closed list --
// grammar (film), recipe and its format (film), setting (scene), proof use
// (beat) -- and the build that honors the two new ones.

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

describe("the vocabulary: every option of the four hard concepts, printable", () => {
  it("lists grammars, formats with their recipes, settings, proof uses and frames -- the code's own lists", async () => {
    const { vocabulary, GRAMMAR_NOTES } = await import("../src/core/vocabulary.js");
    const { FILM_GRAMMARS } = await import("../src/llm/creative-director.js");
    expect(GRAMMAR_NOTES.map((g) => g.id)).toEqual(FILM_GRAMMARS);
    const v = vocabulary();
    expect(v.formats.map((f) => f.id)).toEqual(["talking-head", "screen-share", "listicle", "ranking", "reaction", "clone", "split-screen", "green-screen", "voiceover-broll", "yap"]);
    expect(v.settings.map((s) => s.id)).toEqual(["selfie", "sit-down", "walk-talk", "car", "podcast", "outdoor-sit", "doing", "second-camera"]);
    expect(v.proof_uses.map((u) => u.id)).toEqual(["cutaway", "split", "card", "clip", "green", "tv", "laptop", "phone", "whiteboard", "point", "react", "prop", "demo", "clone"]);
    expect(v.frames).toEqual(["16x9", "9x16", "4x5", "1x1"]);
    // Every format names recipes that exist and say they are that format; every
    // recipe that names a format is listed under it.
    const { VIRAL_FORMATS } = await import("../src/core/formats.js");
    const { getRecipe, loadRecipes } = await import("../src/core/recipes.js");
    for (const f of VIRAL_FORMATS) {
      expect(f.recipes.length).toBeGreaterThan(0);
      for (const id of f.recipes) expect(getRecipe(id)?.format, `${f.id} -> ${id}`).toBe(f.id);
    }
    for (const r of loadRecipes()) if (r.format) expect(VIRAL_FORMATS.find((f) => f.id === r.format)!.recipes).toContain(r.id);
    expect(v.formats.find((f) => f.id === "listicle")!.default_recipe).toBe("presenter-n-things");
    expect(v.grammars.find((g) => g.id === "tempo-cut")!.recipes).toContain("index-reel-page");
  });

  it("a format picks its recipe: the first under it, the one proven at the frame when there is one", async () => {
    const { recipeForFormat } = await import("../src/core/recipes.js");
    expect(recipeForFormat("listicle")!.id).toBe("presenter-n-things");
    expect(recipeForFormat("listicle", "9x16")!.id).toBe("index-reel-host");
    expect(recipeForFormat("Voiceover B-roll")!.id).toBe("voiceover-broll-story");
    expect(recipeForFormat("nope")).toBeUndefined();
  });

  it("the MCP lists it and takes creator_format; the recipe param names the library itself", async () => {
    const server = await read("src/server.ts");
    expect(server).toMatch(/target: z\.enum\(\["projects", "components", "vocabulary"\]\)/);
    expect(server).toMatch(/if \(target === "vocabulary"\) return ok\(vocabulary\(\)\);/);
    expect(server).toMatch(/creator_format: z\.enum\(FORMAT_IDS/);
    expect(server).toMatch(/if \(!params\.recipe && params\.creator_format\) \{\s*const fr = recipeForFormat\(params\.creator_format, params\.frame\);/);
    expect(server).toMatch(/setting: z\.string\(\)\.nullable\(\)\.optional\(\)/);
  });

  it("the recipe validates its format, its beats' settings and uses", async () => {
    const { validateRecipe, getRecipe } = await import("../src/core/recipes.js");
    const r = getRecipe("clone-dialogue")!;
    expect(validateRecipe(r)).toEqual([]);
    expect(validateRecipe({ ...r, format: "vlog" })).toContain("format must be one of talking-head|screen-share|listicle|ranking|reaction|clone|split-screen|green-screen|voiceover-broll|yap");
    expect(validateRecipe({ ...r, spine: [{ ...r.spine[0], setting: "boat" }] }).join(" ")).toMatch(/setting must be one of selfie\|sit-down/);
    expect(validateRecipe({ ...r, spine: [{ ...r.spine[0], cutaway: { at: "start", hold: 1, use: "hologram" } }] }).join(" ")).toMatch(/cutaway\.use must be one of cutaway\|split/);
  });
});

describe("the setting: where the person is, on the performer plan", () => {
  it("is checked, written, shown on the board line, and is the shot a generated performer gets", async () => {
    const { cleanPlan, writePlan, planLine, resolvePlan } = await import("../src/core/cast-plan.js");
    expect(cleanPlan({ setting: "Car" }, [], [])).toEqual({ setting: "car" });
    expect(() => cleanPlan({ setting: "boat" }, [], [])).toThrow(/setting must be one of selfie, sit-down/);
    expect(cleanPlan({ setting: null }, [], [])).toEqual({ setting: "" });
    const plan = writePlan(undefined, { setting: "walk-talk" })!;
    expect(plan).toEqual({ setting: "walk-talk" });
    const project: any = { storyboard: { scenes: [{ performer: plan }] } };
    const r = resolvePlan(project, 0, [], true);
    expect(r).toMatchObject({ how: "record", setting: "walk-talk" });
    expect(planLine(r)).toBe("Me · Record · Walk & Talk");
    const { sceneShot, DEFAULT_SHOT } = await import("../src/core/scene-performance.js");
    const { shotForSetting } = await import("../src/core/performer-settings.js");
    expect(sceneShot(undefined, undefined, "car")).toBe(shotForSetting("car"));
    expect(sceneShot(undefined, DEFAULT_SHOT, "car")).toBe(shotForSetting("car"));
    expect(sceneShot(undefined, shotForSetting("car"), "podcast")).toBe(shotForSetting("podcast")); // a setting's shot follows the setting
    expect(sceneShot(undefined, "On a rooftop at dusk", "podcast")).toBe("On a rooftop at dusk"); // a hand-written shot stays
    expect(sceneShot("Asked", "x", "car")).toBe("Asked");
    expect(sceneShot(undefined, undefined, undefined)).toBe(DEFAULT_SHOT);
  });

  it("a recipe beat writes its setting on the scene unless one is set; the take page shows the guidance", async () => {
    const { getRecipe, holdSettingToRecipe } = await import("../src/core/recipes.js");
    const r = getRecipe("yap-one-take")!;
    const s: any = { label: "Talk - why nobody reads onboarding" };
    expect(holdSettingToRecipe(s, r)).toBe(true);
    expect(s.performer).toEqual({ setting: "selfie" });
    const set: any = { label: "Talk - x", performer: { setting: "car", actor: null } };
    expect(holdSettingToRecipe(set, r)).toBe(false);
    expect(set.performer.setting).toBe("car");
    const page = (await import("../src/take-page.js")).getTakeHtml();
    expect(page).toMatch(/var SETTINGS = \{"selfie":\{"name":"Selfie","booth":"Hold the phone/);
    expect(page).toContain('id="cloneChoice"');
    expect(page).toMatch(/as: takingClone\(\) && !recordAll \? 'clone' : undefined/);
    expect(page).toMatch(/Yap: the lines are talking points, not a script/);
  });
});

describe("proof use: where the proof sits", () => {
  it("places each use: split marks, framed uses become a proof-frame, green is the ground, clone a half, prop and demo draw nothing", async () => {
    const { placeProof, asProofUse } = await import("../src/core/proof-placement.js");
    const full = { x: "0%", y: "0%", width: "100%", height: "100%" };
    const img = () => ({ type: "image", data: { src: "/a.png", at: 2, exit_at: 5, drift: false }, position: { ...full } });
    expect(placeProof(img(), undefined)).toEqual(img());
    expect(placeProof(img(), "cutaway")).toEqual(img());
    expect(placeProof(img(), "split")!.data.use).toBe("split");
    expect(placeProof(img(), "tv")).toEqual({ type: "proof-frame", data: { chrome: "tv", place: "side", src: "/a.png", media: "image", at: 2, exit_at: 5 }, position: full });
    expect(placeProof(img(), "point")!.data).toMatchObject({ chrome: "card", place: "side" });
    expect(placeProof(img(), "react")!.data).toMatchObject({ chrome: "none", place: "split" });
    expect(placeProof(img(), "laptop", { side: "left" })!.data.side).toBe("left");
    const g = placeProof(img(), "green")!;
    expect(g).toEqual({ type: "image", data: { src: "/a.png", drift: false, ground: true }, z_index: 1, position: full });
    expect(placeProof(img(), "prop")).toBeNull();
    expect(placeProof(img(), "demo")).toBeNull();
    const vid = { type: "video", data: { src: "/b.webm", clip: true }, position: { ...full } };
    expect(placeProof(vid, "clone")).toEqual({ type: "video", data: { src: "/b.webm", clip: true, object_position: "right center", volume: 0 }, position: { x: "50%", y: "0%", width: "50%", height: "100%" } });
    expect(placeProof(vid, "clone", { side: "left" })!.position).toEqual({ x: "0%", y: "0%", width: "50%", height: "100%" });
    // A slate timed by its cuts keeps its clock on its data, its anchors re-aimed.
    const slate = { type: "asset-placeholder", data: { need: "N", text: "N", asset_type: "Screenshot needed", hint: "h" }, position: { ...full }, enter: { effect: "cut", at: 1 }, exit: { effect: "cut", at: 3 }, anchors: { "enter.at": { word: "dashboard" } } };
    expect(placeProof(slate, "whiteboard")).toEqual({ type: "proof-frame", data: { chrome: "whiteboard", place: "side", need: "N", text: "N", asset_type: "Screenshot needed", hint: "h", at: 1, exit_at: 3 }, position: full, anchors: { at: { word: "dashboard" } } });
    expect(asProofUse("Green Screen")).toBe("green");
    expect(asProofUse("point-and-explain")).toBe("point");
    expect(asProofUse("hologram")).toBeUndefined();
  });

  it("the board keeps the use (clone only on a camera take, prop and demo need no file) and the build places it", async () => {
    const { normalizeAssetNeeds, proofComponents, castScreenSlates, castProvidedScreens, recastProvidedNeed, isScreenSlate, openAssetNeeds } = await import("../src/core/asset-needs.js");
    const needs = normalizeAssetNeeds([
      { type: "screenshot", description: "The welcome email", use: "laptop", side: "left", at: "@welcome" },
      { type: "mockup", description: "The printed report", use: "prop" },
      { type: "screenshot", description: "Not a clone", use: "clone" },
      { type: "camera_video", description: "Take B", use: "clone" },
      { type: "camera_video", description: "Not a tv", use: "tv" },
    ]);
    expect(needs.map((n) => n.use)).toEqual(["laptop", "prop", undefined, "clone", undefined]);
    expect(needs[0].side).toBe("left");
    expect(needs[1].status).toBe("provided");
    expect(openAssetNeeds({ storyboard: { scenes: [{ assets: needs }] } } as any).map((n) => n.description)).toEqual(["The welcome email", "Not a clone"]);
    // Provided: a framed proof.
    const comps = proofComponents({ assets: [{ ...needs[0], status: "provided", path: "/assets/t/p/welcome.png" }] } as any);
    expect(comps).toEqual([{ type: "proof-frame", data: { chrome: "laptop", place: "side", side: "left", src: "/assets/t/p/welcome.png", media: "image", at: "@welcome" }, position: { x: "0%", y: "0%", width: "100%", height: "100%" } }]);
    // Open: the slate stands in the frame (the mock it would have taken leaves), a clone's slate in its half.
    const scene: any = { assets: [needs[0], needs[3]], components: [{ type: "quotient-email-editor", data: {}, enter: { effect: "cut", at: 2 } }] };
    const sl = castScreenSlates(scene, { anchors: true });
    expect(sl.components.map((c: any) => c.type)).toEqual(["proof-frame", "asset-placeholder"]);
    expect(sl.components[0].data).toMatchObject({ chrome: "laptop", need: "The welcome email", at: "@welcome" });
    expect(isScreenSlate(sl.components[0])).toBe(true);
    expect(sl.components[1].position).toEqual({ x: "50%", y: "0%", width: "50%", height: "100%" });
    expect(sl.components[1].data.asset_type).toBe("Clone take needed (Take B)");
    // Idempotent: a second pass casts nothing.
    expect(castScreenSlates({ ...scene, components: sl.components }, { anchors: true }).cast.length).toBe(0);
    // The file lands in the frame the slate held.
    const filled = castProvidedScreens({ assets: [{ ...needs[0], status: "provided", path: "/assets/t/p/w.png" }], components: sl.components } as any);
    expect(filled.replaced).toBe(1);
    expect(filled.components[0]).toMatchObject({ type: "proof-frame", data: { chrome: "laptop", src: "/assets/t/p/w.png", media: "image" } });
    expect((filled.components[0] as any).data.need).toBeUndefined();
    // A pick on a built scene places it too.
    const r = recastProvidedNeed({ components: [], duration_seconds: 6 }, { ...needs[0], type: "stock_footage", status: "provided", path: "/x.mp4", at: 1, until: 4 } as any, undefined, { personFilm: true });
    expect(r.how).toBe("placed (laptop)");
    expect(r.components[0]).toMatchObject({ type: "proof-frame", data: { media: "video", at: 1, exit_at: 4 } });
  });

  it("a recipe beat's use reaches its needs; a clone beat asks for Take B; the speaker's need stays one", async () => {
    const { getRecipe, holdUseToRecipe, holdMadeToRecipe, CLONE_NEED_DESCRIPTION } = await import("../src/core/recipes.js");
    const green = getRecipe("green-screen-explainer")!;
    const s: any = { label: "Point - the open rate chart", purpose: "the chart", assets: [] };
    expect(holdMadeToRecipe(s, green)).toEqual(["a screen_recording need added: the beat is a real recording"]);
    expect(s.assets[0].use).toBe("green");
    const s2: any = { label: "Point - x", assets: [{ type: "screenshot", description: "a chart", status: "needed" }, { type: "camera_video", description: "Camera take of this scene's spoken lines" }] };
    expect(holdUseToRecipe(s2, green)).toBe(1);
    expect(s2.assets.map((a: any) => a.use)).toEqual(["green", undefined]);
    const clone = getRecipe("clone-dialogue")!;
    const s3: any = { label: "Exchange - Doubter: does this scale?", assets: [{ type: "camera_video", description: "Camera take of this scene's spoken lines", status: "needed" }] };
    expect(holdUseToRecipe(s3, clone)).toBe(1);
    expect(s3.assets[1]).toMatchObject({ type: "camera_video", use: "clone", description: CLONE_NEED_DESCRIPTION, status: "needed" });
    expect(holdUseToRecipe(s3, clone)).toBe(0); // once
    const { ensureSpeakerNeeds, isCloneNeed, cloneNeedOf } = await import("../src/core/take-needs.js");
    const project: any = { treatment: { filmGrammar: "creator-cut" }, storyboard: { scenes: [{ voiceover_text: "Does this scale?", assets: s3.assets }] }, takes: [], speaker_track: { clips: [] } };
    ensureSpeakerNeeds(project);
    expect(project.storyboard.scenes[0].assets.filter(isCloneNeed).length).toBe(1);
    expect(cloneNeedOf(project, 0)!.description).toBe(CLONE_NEED_DESCRIPTION);
  });

  it("the clone's take lands as a clip in its half; the self-placing frames hold still and read the face", async () => {
    const idx = await read("src/index.ts");
    expect(idx).toMatch(/if \(tkBody\.as === "clone" && tkSceneIdx >= 0\) return attachClipToScene\(tkTenant, tkProject, tkBody, tkPeek, tkSceneIdx, "clone"\);/);
    expect(idx).toMatch(/placeProof\(base, "clone", \{ side: \(need as any\)\.side \}\)/);
    const gen = await read("src/llm/scene-generator.ts");
    expect(gen).toMatch(/var SELF_PLACING_TYPES = \[[^\]]*"proof-frame", "index-reel"\]/);
    expect(gen).toMatch(/if \(\(c\.type === "proof-frame" \|\| c\.type === "index-reel"\) && data\.face === undefined && \(draft as any\)\.take_face\) data\.face = \(draft as any\)\.take_face;/);
    const { isFixedToFrame } = await import("../src/core/scene-assembler.js");
    for (const t of ["proof-frame", "index-reel", "tier-list"]) expect(isFixedToFrame(t)).toBe(true);
    const video = await read("src/components/media/video.component.html");
    expect(video).toMatch(/style \+= 'object-position:' \+ data\.object_position/);
  });
});
