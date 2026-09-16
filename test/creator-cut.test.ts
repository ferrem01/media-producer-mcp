import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_GRAMMARS } from "../src/llm/creative-director.js";
import { personCarries, ensureSpeakerNeeds, PERSON_GRAMMARS } from "../src/core/take-needs.js";
import { normalizeAssetNeeds, openAssetNeeds, provideAsset, proofComponents, hasProofFor } from "../src/core/asset-needs.js";
import { normalizeSceneShape } from "../src/llm/storyboard-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFile(path.resolve(__dirname, rel), "utf-8");

// SPEC-creator-cut.md, phase 1: a ninth grammar -- a person explains, the
// screen proves it. The person is the spine (everything the take flow does
// for `speaker` applies), the writer declares the PROOF each claim wants on
// the scene's existing needs, the board asks for it, and a provided file is
// cut in full-frame on its words. No new field, no new component type
// (Marc: fewer concepts unless there is overwhelming evidence).

function board(scenes: any[], grammar = "creator-cut"): any {
  return {
    project_id: "p", tenant_id: "t", treatment: { filmGrammar: grammar },
    storyboard: { scenes: scenes.map((s) => ({ label: "s", purpose: "", template: "", duration_seconds: 6, visual_notes: "", assets: [], ...s })) },
  };
}

describe("creator-cut is a film grammar a person carries", () => {
  it("is a value on film_grammar, wired everywhere a grammar is chosen", async () => {
    expect(FILM_GRAMMARS).toContain("creator-cut");
    const server = await read("../src/server.ts");
    expect(server).toMatch(/"screencast", "speaker", "creator-cut"\]\)/);
    expect(server, "the MCP instructions name it").toMatch(/\* creator-cut -- a person explains, the screen PROVES it/);
    const cd = await read("../src/llm/creative-director.ts");
    expect(cd).toMatch(/- "creator-cut": a person explains and the SCREEN PROVES IT/);
    expect(cd).toMatch(/speaker \| creator-cut",/);
    const axes = await read("../SPEC-creative-axes.md");
    expect(axes).toMatch(/screencast, speaker, creator-cut\*/);
  });

  it("inherits the take flow: needs, the booth, the spine, the cards all read personCarries()", async () => {
    expect(PERSON_GRAMMARS).toEqual(["speaker", "creator-cut"]);
    expect(personCarries("creator-cut")).toBe(true);
    expect(personCarries("speaker")).toBe(true);
    expect(personCarries("hype-cut")).toBe(false);
    expect(personCarries(undefined)).toBe(false);
    // A creator-cut board declares one take per scene with lines, like speaker.
    const p = board([{ voiceover_text: "Here is the claim." }, { voiceover_text: "" }]);
    expect(ensureSpeakerNeeds(p)).toBe(true);
    expect(p.storyboard.scenes[0].assets.map((a: any) => a.type)).toEqual(["camera_video"]);
    expect(p.storyboard.scenes[1].assets).toEqual([]);
    // No literal `=== "speaker"` gate survives where the grammar decides.
    for (const rel of ["../src/llm/pipeline.ts", "../src/index.ts", "../src/server.ts", "../src/core/storyboard-cards.ts", "../src/core/take-needs.ts"]) {
      const src = await read(rel);
      expect(src, `${rel} still gates on the literal speaker grammar`).not.toMatch(/filmGrammar (?:!==|===) "speaker"/);
    }
    const boardPage = await read("../src/studio-phone.ts");
    expect(boardPage).toMatch(/g === 'speaker' \|\| g === 'creator-cut'/);
  });

  it("the writer's contract inherits speaker's spine and states the busy edit", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    const at = sb.indexOf('__g("creator-cut")');
    expect(at).toBeGreaterThan(0);
    const block = sb.slice(at, sb.indexOf("` : \"\"}", at));
    expect(block).toContain("ONE CLAIM PER SCENE");
    expect(block).toContain("THE SCREEN PROVES EVERY CLAIM");
    expect(block).toContain("NO STANDING HEADER");
    expect(block).toContain("A CTA OR SPONSOR LINE ONLY WHEN ASKED");
    expect(block).toMatch(/A CARD .* ONLY when the brief asks/);
    // Ad and tutorial are one grammar split on motion and length.
    expect(block).toMatch(/AD is punchy and about 30s/);
    expect(block).toMatch(/TUTORIAL is calm and 60-90s/);
    // Motion graphics are the default proof: the writer cuts a library mock
    // in on a word; a real screen is an OPTIONAL need on the scene's existing
    // assets[] (Marc: default to motion-graphic cutaways; the user can replace).
    expect(block).toMatch(/YOU CAST THE PROOF/);
    expect(block).toMatch(/enter: \{effect: "cut", at: "@word"\}/);
    expect(block).toMatch(/Motion graphics are the DEFAULT proof/);
    expect(block).toMatch(/A REAL screen is optional/);
    expect(block).toMatch(/Never ask for a recording where a still would do/);
    expect(sb).toMatch(/assets: \{\s*type: "array"/);
    expect(sb).not.toMatch(/evidence: \{/);
  });
});

describe("proof on the board: the needs a claim asks for", () => {
  const raw = [
    { type: "screenshot", description: "The campaign screen, Metrics tab open", at: "@metrics", until: "@next", focus: "circle the Publish button" },
    { type: "screen-recording", description: "Dragging a card across the calendar", use: "card" },
    { kind: "stock_footage", description: "hands typing at a kitchen table" },
    { type: "hologram", description: "not a kind" },
    { type: "mockup", description: "" },
    { type: "mockup", description: "the agent panel performing" },
  ];

  it("normalizes what the writer wrote into full need records; junk is dropped with a note", () => {
    const needs = normalizeAssetNeeds(raw);
    expect(needs.map((n) => [n.type, n.status, n.priority])).toEqual([
      ["screenshot", "needed", "recommended"],
      ["screen_recording", "needed", "recommended"],
      ["stock_footage", "needed", "nice_to_have"],
      ["mockup", "needed", "nice_to_have"],
    ]);
    expect(needs[0]).toMatchObject({ description: "The campaign screen, Metrics tab open", at: "@metrics", until: "@next", focus: "circle the Publish button" });
    expect(needs[1].use).toBe("card");
    expect(needs[2].generation_prompt).toBe("hands typing at a kitchen table");
    expect(needs[0].fallback).toMatch(/runs on the person alone/);
    // ...and normalizeSceneShape runs it.
    const scene: any = { voiceover_text: "x", components: [], assets: raw };
    const notes = normalizeSceneShape(scene);
    expect(scene.assets).toHaveLength(4);
    expect(notes.some((n) => /dropped 2 asset need\(s\)/.test(n))).toBe(true);
    const none: any = { voiceover_text: "x", components: [], assets: [{ type: "hologram" }] };
    normalizeSceneShape(none);
    expect(none.assets).toBeUndefined();
  });

  it("a hydrated board's needs pass through with their status, file and take intact", () => {
    const hydrated = [
      { description: "Camera take of this scene's spoken lines", type: "camera_video", status: "provided", priority: "critical", fallback: "slate", path: "/x/t.mp4", recording_instructions: "Hi." },
      { description: "Screenshot: the metrics", type: "screenshot", status: "provided", priority: "recommended", fallback: "f", path: "/x/m.png", at: "@metrics" },
    ];
    const needs = normalizeAssetNeeds(hydrated);
    expect(needs).toHaveLength(2);
    expect(needs[0]).toMatchObject({ type: "camera_video", status: "provided", path: "/x/t.mp4", recording_instructions: "Hi." });
    expect(needs[1]).toMatchObject({ status: "provided", path: "/x/m.png", at: "@metrics" });
  });

  it("lives beside the take need; a provided file fills one; the build cuts it in on its words", () => {
    const p = board([{ voiceover_text: "Look at the metrics. Then the next thing.", assets: normalizeAssetNeeds(raw) }]);
    ensureSpeakerNeeds(p);
    const scene = p.storyboard.scenes[0];
    expect(scene.assets.map((a: any) => a.type)).toEqual(["screenshot", "screen_recording", "stock_footage", "mockup", "camera_video"]);
    expect(openAssetNeeds(p).map((o) => o.asset_index)).toEqual([0, 1, 2, 3]);   // the take is not proof

    const need = provideAsset(p, 0, 0, "/assets/t/projects/p/assets/proof-1.png");
    expect(need.status).toBe("provided");
    expect(openAssetNeeds(p).map((o) => o.asset_index)).toEqual([1, 2, 3]);
    provideAsset(p, 0, 2, "/assets/t/projects/p/assets/broll.mp4");
    provideAsset(p, 0, 1, "/assets/t/projects/p/assets/rec.mp4");   // a card: not built yet

    const cuts = proofComponents(scene);
    expect(cuts.map((c: any) => [c.type, c.data.src])).toEqual([
      ["image", "/assets/t/projects/p/assets/proof-1.png"],
      ["video", "/assets/t/projects/p/assets/broll.mp4"],
    ]);
    // The existing image/video components, timed: at/exit_at from the words.
    expect(cuts[0].data).toEqual({ src: "/assets/t/projects/p/assets/proof-1.png", at: "@metrics", exit_at: "@next", drift: false });
    expect(cuts[0].position).toEqual({ x: "0%", y: "0%", width: "100%", height: "100%" });
    expect(hasProofFor(cuts, "/assets/t/projects/p/assets/proof-1.png")).toBe(true);
    expect(hasProofFor(cuts, "/assets/t/projects/p/assets/rec.mp4")).toBe(false);
    expect(() => provideAsset(p, 0, 9, "/assets/t/projects/p/assets/x.png")).toThrow(/no need 10/);
    expect(() => provideAsset(p, 3, 0, "/assets/t/projects/p/assets/x.png")).toThrow(/scene 4 not found/);
  });

  it("the pipeline carries the needs through the saved storyboard and casts the proof before the spine pass", async () => {
    const pipeline = await read("../src/llm/pipeline.ts");
    expect(pipeline, "a build-from-board must not throw provided files away").toMatch(/assets: Array\.isArray\(s\.assets\) \? s\.assets : \[\]/);
    expect(pipeline).toMatch(/if \(personCarries\(filmGrammar\)\) \{/);
    expect(pipeline).toMatch(/personCarries\(filmGrammar\) \|\| filmGrammar === "screencast"/);
    const cast = pipeline.indexOf("for (const cut of proofComponents(d))");
    const spine = pipeline.indexOf("const r = applySpine(d, spine);");
    expect(cast).toBeGreaterThan(0);
    expect(cast, "proof is cast BEFORE anchors resolve").toBeLessThan(spine);
    // The route the board uploads through -- the HTTP twin of update.provide_asset.
    const index = await read("../src/index.ts");
    expect(index).toMatch(/\/api\/provide-asset\//);
    expect(index).toMatch(/provideAsset\(evProjectObj, evScene, evIndex, evUrl\)/);
    // The layout: a cutaway (a mock cut in, or a full-bleed image/video) is the
    // proof layer -- full stage, never banded, never phone-zoomed, never dropped
    // as desktop furniture on a phone reel.
    const gen = await read("../src/llm/scene-generator.ts");
    expect(gen).toMatch(/function isCutaway/);
    expect(gen).toMatch(/isCutaway\(c as any\)\) \{\s*slots\[i\] = \{ position: \{ \.\.\.FULL_STAGE \}, z_index: 36 \}/);
    expect(gen).toMatch(/PHONE_REEL_MOCK_RE\.test\(c\.type\) && !isCutaway\(c as any\)/);
    expect(gen).toMatch(/data\.scale === undefined && !isCutaway\(c as any\)\) zoom = PHONE_ZOOM/);
    expect(gen).toMatch(/PHONE_ZOOM_EXCLUDE = \[.*"video", "image"\]/);
    // ...and a mock cut in for a beat never turns its scene into a takeover.
    expect(pipeline).toMatch(/SURFACE_RE\.test\(c\.type\) && !cutIn\(c\)/);
    // No component type was added for it.
    const media = await fs.readdir(path.resolve(__dirname, "../src/components/media"));
    expect(media.some((f) => /cutaway/.test(f))).toBe(false);
  });

  it("a timed image or clip is a hard cut: no fade either side, a clip from its own start", async () => {
    for (const rel of ["../src/components/media/image.component.html", "../src/components/media/video.component.html"]) {
      const html = await read(rel);
      expect(html, rel).toMatch(/var timed = isFinite\(at\) \|\| isFinite\(exitAt\)/);
      expect(html, rel).toMatch(/tl\.fromTo\((root|container), \{ autoAlpha: 0 \}, \{ autoAlpha: 1, duration: 0\.02, ease: 'none', immediateRender: false \}, at\)/);
      expect(html, rel).toMatch(/tl\.to\((root|container), \{ autoAlpha: 0, duration: 0\.02, ease: 'none' \}, exitAt\)/);
    }
    const video = await read("../src/components/media/video.component.html");
    expect(video).toMatch(/startAt: timed && at > 0 \? -at : 0/);
  });
});

describe("the cut, the words, and the camera (Marc: motion graphics by default, the voice never stops)", () => {
  it("a directed entrance or exit lands on a word like any data time", async () => {
    const { extractAnchors, resolveComponent, assertedSpine } = await import("../src/core/word-anchors.js");
    const c: any = { type: "quotient-campaign", data: { script: [] }, enter: { effect: "cut", at: "@plans" }, exit: { effect: "cut", at: { word: "itself", edge: "end" } } };
    expect(extractAnchors(c)).toBe(2);
    expect(c.anchors["enter.at"]).toEqual({ word: "plans" });
    expect(c.anchors["exit.at"]).toEqual({ word: "itself", edge: "end" });
    const spine = assertedSpine("An agent reads that brief and plans the whole campaign itself.", 5);
    const r = resolveComponent(c, spine);
    expect(r.resolved).toBe(2);
    expect(c.enter.at).toBeGreaterThan(0);
    expect(c.exit.at).toBeGreaterThan(c.enter.at);
  });

  it("enter/exit the writer nested inside data are lifted to the component (measured live: every cut-in arrived as data.enter)", async () => {
    const { liftWrapperAnims, extractAnchors } = await import("../src/core/word-anchors.js");
    const c: any = { type: "quotient-social", data: { post_text: "x", enter: { effect: "cut", at: "@writes" }, exit: { effect: "cut", at: "@calendar" } } };
    expect(liftWrapperAnims(c)).toBe(2);
    expect(c.enter).toEqual({ effect: "cut", at: "@writes" });
    expect(c.data.enter).toBeUndefined();
    // A component-level enter wins over a stray data.enter; the stray is dropped either way.
    const d: any = { type: "x", data: { enter: "fade" }, enter: { effect: "cut", at: 1 } };
    expect(liftWrapperAnims(d)).toBe(0);
    expect(d.enter).toEqual({ effect: "cut", at: 1 });
    expect(d.data.enter).toBeUndefined();
    // extractAnchors lifts first, so the anchors land on the wrapper's clock.
    const e: any = { type: "quotient-campaign", data: { script: [], enter: { effect: "cut", at: "@plans" } } };
    expect(extractAnchors(e)).toBe(1);
    expect(e.anchors["enter.at"]).toEqual({ word: "plans" });
    expect(e.enter).toEqual({ effect: "cut", at: 0 });
    // ...and the normalizer does the same for the saved storyboard, with a note.
    const scene: any = { voiceover_text: "It plans.", components: [{ type: "quotient-campaign", data: { script: [], enter: { effect: "cut", at: "@plans" } } }] };
    const notes = normalizeSceneShape(scene);
    expect(scene.components[0].enter).toEqual({ effect: "cut", at: "@plans" });
    expect(notes).toContain("quotient-campaign: enter/exit lifted out of data");
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/A sibling of data, never inside it/);
    expect(sb).toMatch(/EVERY SCENE IS CAST, THE FIRST ONE TOO/);
  });

  it("the cut effect is a hard cut in the choreography: sub-frame, no ease", async () => {
    const asm = await read("../src/core/scene-assembler.ts");
    expect(asm).toMatch(/'cut': \{ autoAlpha: 0 \}/);
    expect(asm).toMatch(/var CUT = 0\.02;/);
    expect(asm).toMatch(/var eDur = eCut \? CUT : \(c\.enter\.duration \|\| 0\.8\)/);
    expect(asm).toMatch(/var xDur = xCut \? CUT : \(c\.exit\.duration \|\| 0\.8\)/);
    const gen = await read("../src/llm/scene-generator.ts");
    expect(gen).toMatch(/"cut",\s*\]\);/);
  });

  it("a provided real screen replaces the mock cut in on the same word, and nothing else", async () => {
    const { replaceCutWindow } = await import("../src/core/asset-needs.js");
    const comps = [
      { type: "sticker-prop", data: { kind: "pill", text: "THE PLAN" } },
      { type: "quotient-campaign", data: {}, enter: { effect: "cut", at: "@plans" }, exit: { effect: "cut", at: "@itself" } },
      { type: "quotient-social", data: {}, enter: { effect: "cut", at: 2.1 }, anchors: { "enter.at": { word: "posts" } } },
    ];
    expect(replaceCutWindow(comps, "@plans").map((c: any) => c.type)).toEqual(["sticker-prop", "quotient-social"]);
    expect(replaceCutWindow(comps, "@posts").map((c: any) => c.type)).toEqual(["sticker-prop", "quotient-campaign"]);
    expect(replaceCutWindow(comps, "@nowhere")).toHaveLength(3);
    expect(replaceCutWindow(comps, undefined)).toHaveLength(3);
  });

  it("the camera moves on the person by rule: a punch-in on the claim, a zoom on each cutaway's region, back to the person, a pull-back on the turn", async () => {
    const { creatorCutCameraMoves } = await import("../src/llm/scene-generator.js");
    const face = { cx: 0.48, cy: 0.36, size: 0.3, confidence: 0.9 } as any;
    const comps: any[] = [
      { id: "sticker-prop", type: "sticker-prop", data: { kind: "pill", text: "THE PLAN" } },
      { id: "quotient-campaign", type: "quotient-campaign", data: { script: [{ action: "switch-tab", at: 0.2, tab: "tasks" }] }, enter: { effect: "cut", at: 1.4 }, exit: { effect: "cut", at: 3.6 } },
    ];
    const punchy = creatorCutCameraMoves(comps, { grammar: "creator-cut", motion: "punchy", face, duration: 6, takeover: false })!;
    expect(punchy.map((m) => [m.at, m.type, m.scale])).toEqual([
      [0.2, "zoom", 1.22],        // punch-in on the claim, at the face
      [1.4, "reset", undefined],  // the cutaway: the camera rests (the wrapper frames the mock)
      [3.6, "zoom", 1.22],        // back to the person on its exit
      [4.9, "reset", undefined],  // pull-back on the turn
    ]);
    expect(punchy[0]).toMatchObject({ x: 48, y: 36 });
    // Calm: one slow push, no pull-back; a cutaway with no anchors (a provided still) rests the camera.
    const calm = creatorCutCameraMoves([{ id: "image", type: "image", data: { src: "/x.png" }, enter: { effect: "cut", at: 2 }, position: { x: "0%", y: "0%", width: "100%", height: "100%" } }],
      { grammar: "creator-cut", motion: "calm", duration: 6, takeover: false })!;
    expect(calm.map((m) => [m.at, m.type, m.scale])).toEqual([[0.3, "zoom", 1.1], [2, "reset", undefined]]);
    // Not for speaker films, not for takeovers; and a storyboard's own moves win (the generator only asks when there are none).
    expect(creatorCutCameraMoves(comps, { grammar: "speaker", duration: 6, takeover: false })).toBeNull();
    expect(creatorCutCameraMoves(comps, { grammar: "creator-cut", duration: 6, takeover: true })).toBeNull();
    const gen = await read("../src/llm/scene-generator.ts");
    expect(gen).toMatch(/var cameraMoves: any\[\] \| undefined = \(draft as any\)\.camera_moves\?\.length \? \(draft as any\)\.camera_moves : undefined;/);
    // A storyboard that wrote nothing but resets wrote no camera (measured: four scenes of "@3.3s reset").
    expect(gen).toMatch(/if \(cameraMoves && cameraMoves\.every\(\(m: any\) => !m \|\| m\.type === "reset"\)\) cameraMoves = undefined;/);
    // A cut window shorter than CUT_MIN is held open at build.
    expect(gen).toMatch(/var CUT_MIN = 1\.2;/);
    expect(gen).toMatch(/cut window .* is too short to read -- held to/);
    // The person is the base of every scene on a person grammar, take or no take.
    const pipeline2 = await read("../src/llm/pipeline.ts");
    expect(pipeline2).toMatch(/const personBase = !!opts\.speaker_source \|\| pipelineHasNarration \|\| personCarries\(filmGrammar\);/);
    expect(pipeline2.match(/hasSpeakerTrack: personBase,/g)?.length).toBe(4);
    expect(pipeline2).not.toMatch(/hasSpeakerTrack: !!opts\.speaker_source \|\| pipelineHasNarration/);
    expect(pipeline2.match(/overCamera: personBase &&/g)?.length).toBe(2);
  });

  it("a cutaway mock on a tall frame is FRAMED on the region it performs in (a desktop mock at full frame fills the top quarter of a phone)", async () => {
    const { componentAnchors, frameAnchorFor } = await import("../src/llm/scene-generator.js");
    const lib = path.resolve(__dirname, "../src/components");
    // The anchors come from the library itself.
    expect(componentAnchors("quotient-campaign", lib)).toEqual(expect.arrayContaining(["tasks", "calendar", "metrics"]));
    expect(componentAnchors("sticker-prop", lib)).toEqual([]);
    // The region the script performs in wins; else the first content region; chrome never.
    const anchorsOf = (t: string) => t === "quotient-campaign" ? ["tabs", "brief", "tasks", "calendar"] : t === "quotient-social" ? ["toolbar", "post", "status"] : [];
    expect(frameAnchorFor("quotient-campaign", { script: [{ action: "switch-tab", tab: "tasks" }] }, anchorsOf)).toBe("tasks");
    // ...or the region its actions work on (measured: move-event on a calendar was framed on the brief), or the tab it opens on.
    expect(frameAnchorFor("quotient-campaign", { script: [{ action: "move-event" }, { action: "set-event-status" }] }, anchorsOf)).toBe("calendar");
    expect(frameAnchorFor("quotient-campaign", { active_tab: "tasks" }, anchorsOf)).toBe("tasks");
    expect(frameAnchorFor("quotient-campaign", {}, anchorsOf)).toBe("brief");
    expect(frameAnchorFor("quotient-social", {}, anchorsOf)).toBe("post");
    expect(frameAnchorFor("image", {}, anchorsOf)).toBeNull();
    // The generator stamps it on tall-frame cutaways; the assembler frames the wrapper at mount.
    const gen = await read("../src/llm/scene-generator.ts");
    expect(gen).toMatch(/var frameAnchor = tallFrame && isCutaway\(c as any\) \? frameAnchorFor\(c\.type, data\) : null;/);
    expect(gen).toMatch(/\.\.\.\(frameAnchor \? \{ frame_anchor: frameAnchor \} : \{\}\)/);
    const asm = await read("../src/core/scene-assembler.ts");
    expect(asm).toMatch(/frame: \(c as any\)\.frame_anchor \|\| null,/);
    // Framed at the cut's first render (the region may be a pane switched to later), from layout boxes, clamped to cover the frame.
    expect(asm).toMatch(/function frameOf\(el, name\)/);
    expect(asm).toMatch(/if \(eCut && c\.frame\) \{/);
    expect(asm).toMatch(/duration: 0\.001, ease: 'none', immediateRender: false,/);
    expect(asm).toMatch(/tx = Math\.max\(CW - W \* sc, Math\.min\(0, tx\)\)/);
    // Both assemblers pass the frame through.
    expect(asm).toMatch(/wrapperChoreoScript\(scene\.components, scene\.duration_seconds, "", canvas\.width, canvas\.height\)/);
    const comp = await read("../src/core/composite-assembler.ts");
    expect(comp).toMatch(/wrapperChoreoScript\(scene\.components, scene\.duration_seconds, `\$\{scene\.id\}__`, canvas\.width, canvas\.height\)/);
  });
});
