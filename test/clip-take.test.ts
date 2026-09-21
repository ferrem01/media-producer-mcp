import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isClipNeed, clipNeedOf, ensureClipNeed, openTakeNeeds, CLIP_NEED_DESCRIPTION, TAKE_NEED_DESCRIPTION } from "../src/core/take-needs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, "..", p), "utf8");

// A CLIP, NOT THE SPEAKER (AMENDMENTS 2026-09-21): a live-action moment on
// one scene of a film no person carries -- the founder's two-second cameo
// on a hype-cut sketch -- recorded in the same booth and attached as a
// video component on that scene. The rare path; the take machinery stays
// for person films.
describe("the clip need", () => {
  it("is a camera_video need with use clip; ensureClipNeed puts one on a scene of any film, idempotently; openTakeNeeds counts it", () => {
    expect(isClipNeed({ type: "camera_video", use: "clip" })).toBe(true);
    expect(isClipNeed({ type: "camera_video" })).toBe(false);
    expect(isClipNeed({ type: "screen_recording", use: "clip" })).toBe(false);
    const project: any = { treatment: { filmGrammar: "hype-cut" }, storyboard: { scenes: [
      { label: "Hook", voiceover_text: "So... what worked?", duration_seconds: 3, assets: [] },
      { label: "Pile", duration_seconds: 10, assets: [{ type: "screen_recording", status: "needed", description: "GA4" }] },
    ] } };
    const need = ensureClipNeed(project, 0);
    expect(need).toMatchObject({ type: "camera_video", use: "clip", status: "needed", description: CLIP_NEED_DESCRIPTION, recording_instructions: "So... what worked?" });
    expect(ensureClipNeed(project, 0)).toBe(need); // idempotent
    // The writer's own camera ask on a scene becomes the clip instead of a second need.
    const own: any = { treatment: { filmGrammar: "hype-cut" }, storyboard: { scenes: [{ label: "Ask", assets: [{ type: "camera_video", description: "The CMO, casual, walking past a desk", status: "needed" }] }] } };
    const conv = ensureClipNeed(own, 0);
    expect(conv).toMatchObject({ type: "camera_video", use: "clip", description: "The CMO, casual, walking past a desk" });
    expect(own.storyboard.scenes[0].assets.length).toBe(1);
    expect(clipNeedOf(project, 0)).toBe(need);
    expect(clipNeedOf(project, 1)).toBeUndefined();
    expect(openTakeNeeds(project)).toEqual([0]); // the booth and the take job wait on it
    need.status = "provided";
    expect(openTakeNeeds(project)).toEqual([]);
    // A speaker need is unchanged by it.
    const spk: any = { treatment: { filmGrammar: "speaker" }, storyboard: { scenes: [{ voiceover_text: "x", assets: [{ type: "camera_video", description: TAKE_NEED_DESCRIPTION, status: "needed" }] }] } };
    expect(openTakeNeeds(spk)).toEqual([0]);
  });

  it("the attach route takes the clip path for a clip need or a film no person carries: a video component on the scene, the need provided, the scene grown to the clip, the waiter released, nothing about the speaker", async () => {
    const idx = await read("src/index.ts");
    expect(idx).toMatch(/async function attachClipToScene\(/);
    expect(idx).toMatch(/if \(tkClipNeed \|\| \(tkSceneIdx >= 0 && !personCarries\(\(tkPeek\.treatment as any\)\?\.filmGrammar\)\)\) \{\n\s*return attachClipToScene\(/);
    const at = idx.indexOf("async function attachClipToScene(");
    const body = idx.slice(at, idx.indexOf("async function attachTakeToScene("));
    expect(body).toMatch(/type: "video", position, z_index: 12, data: \{ src: url, object_fit: "cover", start_at: 0, clip: true \}, enter: \{ effect: "cut", at: 0 \}/);
    expect(body).toMatch(/need\.status = "provided"; need\.path = url;/);
    expect(body).toMatch(/sbScene\.duration_seconds = Math\.ceil\(dur \* 10\) \/ 10;/);
    expect(body).toMatch(/resolveTakeWaiters\(tkTenant, tkProject, take\)/);
    // The slate the board cast for this need leaves with the clip's arrival, on the board and the built scene.
    expect(body).toMatch(/\(isScreenSlate\(c\) && String\(c\.data\.need\) === need\.description\)/);
    expect(body).toMatch(/const others = \(built\.components \|\| \[\]\)\.filter\(\(c: any\) => !stale\(c\)\);/);
    expect(body).not.toMatch(/speaker_track|castSpeakerLayer|queueTakeMatte|retimeScene|primeTakeWords/);
    // "Record all" never takes the clip path.
    expect(idx).toMatch(/if \(!recordAll\) \{\n\s*const tkSceneIdx/);
  });

  it("the take tool serves a clip on any film (as: 'clip', the default off person films) and still refuses a speaker take there", async () => {
    const server = await read("src/server.ts");
    expect(server).toMatch(/as: z\.enum\(\["speaker", "clip"\]\)\.optional\(\)/);
    expect(server).toMatch(/const asClip = params\.as === "clip" \|\| \(!personFilm && params\.as !== "speaker"\);/);
    expect(server).toMatch(/if \(asClip && params\.scene_index === undefined\) return err\("A clip lands on ONE scene: pass scene_index\."\);/);
    expect(server).toMatch(/ensureClipNeed\(project, params\.scene_index!\);/);
    expect(server).toMatch(/ensureClipNeed\(project, params\.scene_index!\);\n\s*\/\/ The board shows the clip[^\n]*\n\s*try \{ await castBoardStandIns\(project, config\.dataDir\); \}/);
    // The writer lists camera asks for the cameos and forgets use "clip": on a film no person carries they are clips.
    const { normalizeClipNeeds } = await import("../src/core/take-needs.js");
    const sketch: any = { treatment: { filmGrammar: "hype-cut" }, storyboard: { scenes: [
      { assets: [{ type: "camera_video", description: "The CMO", status: "needed" }] },
      { assets: [{ type: "screen_recording", description: "GA4", status: "needed" }, { type: "camera_video", description: "The marketer", status: "needed" }] },
    ] } };
    expect(normalizeClipNeeds(sketch)).toBe(2);
    expect(sketch.storyboard.scenes[0].assets[0].use).toBe("clip");
    expect(sketch.storyboard.scenes[1].assets[0].use).toBeUndefined();
    expect(normalizeClipNeeds(sketch)).toBe(0); // idempotent
    const person: any = { treatment: { filmGrammar: "creator-cut" }, storyboard: { scenes: [{ assets: [{ type: "camera_video", description: "x", status: "needed" }] }] } };
    expect(normalizeClipNeeds(person)).toBe(0); // a person film's camera asks are takes
    const standins = await read("src/core/board-standins.ts");
    expect(standins).toMatch(/const clips = normalizeClipNeeds\(project\);/);
  });

  it("the writer may ask for a cameo on any film; the recipe hold keeps it; the booth hides the background choice; Studio lists it as a clip on the scene", async () => {
    const builder = await read("src/llm/storyboard-builder.ts");
    expect(builder).toMatch(/ANY FILM for a LIVE-ACTION CAMEO/);
    expect(builder).toMatch(/\{type: \\"camera_video\\", use: \\"clip\\"/);
    const recipes = await read("src/core/recipes.ts");
    expect(recipes).toMatch(/a\.type === "camera_video" && a\.use !== "clip" && a\.status !== "provided"/);
    const page = await read("src/take-page.ts");
    expect(page).toMatch(/a0\.type === 'camera_video' && a0\.use === 'clip'/);
    expect(page).toMatch(/This is a clip on the scene, not the speaker/);
    const studio = await read("src/preview-app/preview-app.ts");
    expect(studio).toMatch(/'A live-action clip on this scene'/);
    expect(studio).toMatch(/a\.use === 'clip' \? 'Camera clip' : kind/);
    expect(studio).toMatch(/n\.need\.type === 'camera_video' && n\.need\.use !== 'clip'; \}\)\) hasSpk = true;/);
  });

  it("one take need per scene on a person film: the writer's own camera ask is dropped as a duplicate; a clip need stays", async () => {
    const { ensureSpeakerNeeds } = await import("../src/core/take-needs.js");
    const project: any = { treatment: { filmGrammar: "creator-cut" }, storyboard: { scenes: [
      { label: "Hook", voiceover_text: "So... what worked?", duration_seconds: 3, assets: [
        { type: "camera_video", description: "Founder on camera, static locked shot", status: "needed" },
        { type: "camera_video", use: "clip", description: "a cameo", status: "needed" },
        { type: "screen_recording", description: "GA4", status: "needed" },
      ] },
    ] } };
    expect(ensureSpeakerNeeds(project)).toBe(true);
    const types = project.storyboard.scenes[0].assets.map((a: any) => a.type + (a.use ? ":" + a.use : "") + "|" + a.description.slice(0, 12));
    expect(types).toEqual(["camera_video:clip|a cameo", "screen_recording|GA4", "camera_video|Camera take "]);
  });

  it("the board shows the clip: an open clip need casts a slate like a screen need, and the card draws the outline labeled for the reader", async () => {
    const { castScreenSlates } = await import("../src/core/asset-needs.js");
    const scene: any = { label: "Hook", components: [{ type: "kinetic-text", data: { text: "So... what worked?" } }], assets: [
      { type: "camera_video", use: "clip", description: "A live-action clip for this scene (a cameo on camera)", status: "needed" },
    ] };
    const r = castScreenSlates(scene);
    expect(r.cast.length).toBe(1);
    expect(r.cast[0]).toMatchObject({ type: "asset-placeholder", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data: { asset_type: "Live-action clip needed", hint: "Record it in Studio (Camera clip) -- it takes this slot" } });
    expect(r.components.map((c: any) => c.type)).toEqual(["kinetic-text", "asset-placeholder"]);
    // Provided: the slate clears.
    scene.components = r.components; scene.assets[0].status = "provided"; scene.assets[0].path = "/assets/t/projects/p/assets/cameo.webm";
    const r2 = castScreenSlates(scene);
    expect(r2.cleared).toBe(1); expect(r2.components.map((c: any) => c.type)).toEqual(["kinetic-text"]);
    // A plain speaker take need is NOT slated (the outline and the take flow own it).
    const spk: any = { components: [], assets: [{ type: "camera_video", description: "Camera take of this scene's spoken lines", status: "needed" }] };
    expect(castScreenSlates(spk).cast.length).toBe(0);
    const cards = await read("src/core/storyboard-cards.ts");
    expect(cards).toMatch(/else if \(!speakerFilm && clipNeedOf\(project, i\)\?\.status === "needed"\) \{/);
    expect(cards).toMatch(/speakerPlaceholderHtml\(canvas, undefined, "CAMEO ON CAMERA"\)/);
  });

  it("a clip that has landed is photographed as its poster frame: the staged list (clip -> image wearing a data URL) is what the authored builder gets", async () => {
    const { stageProvidedMedia } = await import("../src/core/storyboard-cards.js");
    const os = await import("node:os");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mp-clip-card-"));
    const jpg = path.join(dir, "poster.jpg");
    await fs.writeFile(jpg, Buffer.from("ffd8ffe0", "hex"));
    const project: any = { tenant_id: "t", project_id: "p" };
    const comps = [
      { type: "kinetic-text", data: { text: "So... what worked?" } },
      { type: "video", z_index: 12, data: { src: "/assets/t/projects/p/assets/cmo-cut.mp4", object_fit: "cover", clip: true }, enter: { effect: "cut", at: 0 } },
      { type: "video", data: { src: "https://cdn.example.com/broll.mp4" } },
    ];
    const seen: string[] = [];
    const staged = await stageProvidedMedia(project, comps, dir, async (_p, src) => { seen.push(src); return jpg; });
    expect(seen).toEqual(["/assets/t/projects/p/assets/cmo-cut.mp4"]);
    expect(staged[0]).toBe(comps[0]);
    expect(staged[1]).toMatchObject({ type: "image", z_index: 12, enter: { effect: "cut", at: 0 }, data: { object_fit: "cover", drift: false } });
    expect(staged[1].data.src).toBe("data:image/jpeg;base64," + Buffer.from("ffd8ffe0", "hex").toString("base64"));
    expect(staged[2]).toBe(comps[2]);
    // A poster that cannot be made leaves the clip as it was.
    const none = await stageProvidedMedia(project, comps, dir, async () => null);
    expect(none[1]).toBe(comps[1]);
    // The shoot builds the authored scene from the STAGED list, not the pre-swap one.
    const cards = await read("src/core/storyboard-cards.ts");
    expect(cards).toMatch(/\(staged as any\)\.components = await stageProvidedMedia\(project, \(staged as any\)\.components, opts\.dataDir\);/);
    expect(cards).toMatch(/buildAuthoredCompositionScene\(`card_s\$\{i\}`, staged, staged_authored, cardOpts\)/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("the built scene: on a film no person carries, the clip is the scene's PICTURE (the media-backdrop slot, full-bleed, cover, under the type), never a white-plated cutaway; over a speaker it stays a cutaway", async () => {
    const { buildAuthoredCompositionScene } = await import("../src/llm/scene-generator.js");
    const { isCutInProof } = await import("../src/core/scene-assembler.js");
    const draft: any = { label: "The Ask", duration_seconds: 5, purpose: "", visual_notes: "", components: [], beats: [] };
    const clip = { type: "video", position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 12, data: { src: "/assets/t/projects/p/assets/cmo-cut.mp4", object_fit: "cover", start_at: 0, clip: true }, enter: { effect: "cut", at: 0 } };
    const line = { type: "kinetic-text", position: { x: "6%", y: "78%", width: "88%", height: "14%" }, data: { text: "So... *what worked?*", entrance: "type-on", plate: true, at: 0.3 } };
    const build = (hasSpeakerTrack: boolean) => buildAuthoredCompositionScene("s1", draft, [line, clip] as any, {
      sceneIndex: 0, totalScenes: 13, brandKit: { colors: { primary: "#393bf5" }, fonts: [] },
      canvas: { width: 1080, height: 1350 }, hasSpeakerTrack, treatment: { filmGrammar: hasSpeakerTrack ? "speaker" : "hype-cut", frame: "4x5" },
    } as any).scene.components as any[];
    const comps = build(false);
    const bg = comps[0];
    expect(bg).toMatchObject({ id: "bg", type: "video", z_index: 1, position: { x: 0, y: 0, width: "100%", height: "100%" }, data: { src: "/assets/t/projects/p/assets/cmo-cut.mp4", object_fit: "cover", clip: true } });
    expect(bg.frame_anchor).toBeUndefined();
    expect(isCutInProof(bg)).toBe(false);
    expect(comps.filter((c) => c.type === "video").length).toBe(1);
    const text = comps.find((c) => c.type === "kinetic-text");
    expect(text.z_index).toBeGreaterThan(bg.z_index);
    // The card's poster swap (an image wearing data.clip) takes the same slot.
    const still = buildAuthoredCompositionScene("s1", draft, [line, { ...clip, type: "image", data: { ...clip.data, src: "data:image/jpeg;base64,/9j/", drift: false } }] as any, {
      sceneIndex: 0, totalScenes: 13, brandKit: { colors: {}, fonts: [] }, canvas: { width: 1080, height: 1350 },
    } as any).scene.components as any[];
    expect(still[0]).toMatchObject({ id: "bg", type: "image", z_index: 1, data: { clip: true, fit: "cover", drift: false } });
    // Over a speaker the clip is a cutaway: the person is the picture there.
    const over = build(true);
    const cut = over.find((c) => c.type === "video");
    expect(cut).toBeTruthy();
    expect(cut.id).not.toBe("bg");
    expect(isCutInProof(cut)).toBe(true);
  });
});
