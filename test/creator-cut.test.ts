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
    // The proof is written on the scene's existing needs, not a new field.
    expect(block).toMatch(/NAMES ITS PROOF in the scene's "assets" array/);
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
    // The layout: a full-bleed image/video is the proof layer -- never banded, never phone-zoomed.
    const gen = await read("../src/llm/scene-generator.ts");
    expect(gen).toMatch(/function isFullBleedMedia/);
    expect(gen).toMatch(/isFullBleedMedia\(c as any\)\) \{\s*slots\[i\] = \{ position: \{ \.\.\.FULL_STAGE \}, z_index: 36 \}/);
    expect(gen).toMatch(/PHONE_ZOOM_EXCLUDE = \[.*"video", "image"\]/);
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
