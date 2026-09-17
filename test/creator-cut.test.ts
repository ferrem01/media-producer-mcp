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

  it("the writer's contract is self-contained: speaker's spine laws restated, speaker's tall-frame law never shown", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    // No inheritance: speaker's "never an app mock on a phone" contradicts the cutaways.
    expect(sb).not.toMatch(/opts\.filmGrammar === "creator-cut" && g === "speaker"/);
    const at = sb.indexOf('__g("creator-cut")');
    expect(at).toBeGreaterThan(0);
    const block = sb.slice(at, sb.indexOf("` : \"\"}", at));
    for (const law of ["THE VOICE IS THE CLOCK", "A RECORDING NEED NOT EXIST YET", "THE HUMAN NARRATES, AND THE SCRIPT LIVES IN voiceover_text", "WRITE THE SILENCES", "TIME OVERLAYS TO WORDS, NOT SECONDS", "NO DUPLICATE TEXT"]) {
      expect(block, `creator-cut restates ${law}`).toContain(`- ${law}:`);
    }
    expect(block).not.toMatch(/NEVER a dashboard/);
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
    expect(gen).toMatch(/isCutaway\(c as any\)\) \{[\s\S]*?slots\[i\] = \{ position: \{ \.\.\.FULL_STAGE \}, z_index: isProofSurface\(t\) \? 36 : 39 \}/);
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

describe("the idea beat: a claim no screen can prove gets a drawn object (SPEC-creator-cut.md)", () => {
  it("is a proof KIND on the existing needs, not a grammar: illustration, drawn in-house, cut in on the words", async () => {
    const { PROOF_TYPES, NEED_LABELS, normalizeAssetNeeds, proofComponents } = await import("../src/core/asset-needs.js");
    expect(PROOF_TYPES).toContain("illustration");
    expect(NEED_LABELS.illustration).toMatch(/Illustration/);
    const needs = normalizeAssetNeeds([{ type: "illustration", description: "A stack of cash on a plain ground", at: "@million", until: "@avoidable", focus: "the stack" }]);
    expect(needs).toHaveLength(1);
    expect(needs[0].status).toBe("needed");
    // Drawn: the build fills path + status, and the same cast as a provided screenshot cuts it in.
    const drawn = { ...needs[0], path: "/assets/t/projects/p/assets/idea_scene_1_1.png", status: "provided" as const };
    const cuts = proofComponents({ assets: [drawn] } as any);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].type).toBe("image");
    expect((cuts[0] as any).data.at).toBe("@million");
    // The pipeline draws it after media enrichment, portrait on a tall frame, and resolves its anchors against the scene's spine.
    const pipeline = await read("../src/llm/pipeline.ts");
    expect(pipeline).toMatch(/if \(need\.type !== "illustration" \|\| !canDraw\) continue;/);
    // B-roll rides the same lane: a stock_footage need is fetched by the build (portrait on a tall frame) and cut in like any provided proof.
    expect(pipeline).toMatch(/if \(need\.type === "stock_footage" && canFetchStock\) \{/);
    expect(pipeline).toMatch(/orientation: canvas\.height > canvas\.width \? "portrait" : "landscape",/);
    expect(pipeline).toMatch(/c\.data\.at = isFootage \? 0 : Math\.round\(dur \* 0\.3 \* 100\) \/ 100;/);
    // A writer's broll_query on a person-carried film becomes a stock_footage need (never the codegen channel, which would drop the lane).
    expect(pipeline).toMatch(/d\.assets\.push\(\{ type: "stock_footage", description: q, status: "needed"/);
    // Build-from-board copies the filled storyboard back, so fetched needs read "provided" on the original project.
    const server = await read("../src/server.ts");
    expect(server).toMatch(/origProject\.storyboard = retarget\(generatedProject\.storyboard\)/);
    expect(pipeline).toMatch(/needs\.some\(\(n\) => madeHere\(n\) && n\.path === src\)/);
    const stock = await read("../src/media/stock-footage.ts");
    expect(stock).toMatch(/orientation: opts\.orientation \|\| "landscape",/);
    expect(pipeline).toMatch(/size: canvas\.height > canvas\.width \? "1024x1536" : "1536x1024"/);
    expect(pipeline).toMatch(/extractAnchors\(cut as any\);\s*if \(d\.spine\) resolveComponent\(cut as any, d\.spine\);/);
    expect(pipeline).toMatch(/portrait: canvas\.height > canvas\.width,/);
    // The writer's law, on creator-cut; the object behind the words on hype-cut and tempo-cut; the director knows a story ad.
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/THE IDEA BEAT, WHEN NO SCREEN CAN PROVE IT: a claim about money, time, a person, a place or a feeling has no product surface/);
    expect(sb).toMatch(/THE WORLD BEAT, WHEN THE LINE IS ABOUT PEOPLE OR A PLACE:.*\{type: "stock_footage"/);
    expect(sb).toMatch(/\{type: "illustration", description: the one object in one sentence/);
    expect(sb).toMatch(/with "ring": true so a hand-drawn loop circles it once it lands/);
    expect((sb.match(/THE OBJECT BEHIND THE WORDS/g) || []).length).toBe(2);
    const cd = await read("../src/llm/creative-director.ts");
    expect(cd).toMatch(/STORY ADS \(pain, flip, payoff in a few big lines over illustrated objects/);
    // The ring is the type's own: kinetic-text draws a loop around its line once the words land.
    const kt = await read("../src/components/titles/kinetic-text.component.html");
    expect(kt).toMatch(/if \(data\.ring\) \{/);
    expect(kt).toMatch(/tl\.to\(rp, \{ strokeDashoffset: 0, duration: 0\.55, ease: 'power2\.inOut' \}, ringAt\);/);
    expect(kt).toMatch(/var host = container;/);
    const schema = JSON.parse(await read("../src/components/titles/kinetic-text.schema.json"));
    expect(schema.data.ring).toBeTruthy();
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

  it("build defaults cover a writer miss: an un-cut mock becomes the cutaway, an empty scene gets its label", async () => {
    const pipeline = await read("../src/llm/pipeline.ts");
    expect(pipeline).toMatch(/isProofSurface\(c\.type\) && c\.enter === undefined && c\.data\?\.enter === undefined/);
    expect(pipeline).toMatch(/c\.enter = \{ effect: "cut", at: Math\.round\(dur \* 0\.3 \* 100\) \/ 100 \};/);
    expect(pipeline).toMatch(/if \(c\.exit === undefined\) c\.exit = \{ effect: "cut", at: Math\.round\(dur \* 0\.8 \* 100\) \/ 100 \};/);
    // THE WORDS ARE ON SCREEN THE WHOLE TIME: the captions come from the scene's spine as the existing lane; an
    // empty cast is NO LONGER filled with a label from the scene's name (Marc: "I don't like chapter labels as a default").
    expect(pipeline).not.toMatch(/is cast from the scene's name/);
    expect(pipeline).toMatch(/const lane = captionLane\(spine, Array\.isArray\(d\.emphasis\) \? d\.emphasis\.map\(String\) : \[\]\);/);
    expect(pipeline).toMatch(/c\.type === "reel-caption-lane"\);\s*if \(!hasLane && spine\.words\.length\)/);
    // ...carried from the board to the saved storyboard.
    expect(pipeline).toMatch(/emphasis: \(s as any\)\.emphasis/);
    // A STICKER NAMES THE THING, ON THE WORD, UNTIL THE PROOF (measured live: a pill at 0.2s flashing for a second).
    expect(pipeline).toMatch(/if \(emWord && \(c\.data\.at === undefined \|\| \(Number\.isFinite\(atNum\) && atNum < 0\.5\)\)\) c\.data\.at = `@\$\{emWord\}`;/);
    expect(pipeline).toMatch(/if \(firstCut !== undefined && c\.exit === undefined\) \{ c\.exit = \{ effect: "cut", at: firstCut \}; c\.data\.hold = 0; \}/);
    // ...and when the writer cut in on that same word, the sticker needs a second before the cut or rides the cutaway.
    expect(pipeline).toMatch(/if \(at \+ 1\.0 <= out\) continue;\s*if \(out - 1\.2 >= 0\.3\) \{ c\.data\.at = Math\.round\(\(out - 1\.2\) \* 100\) \/ 100;/);
    expect(pipeline).toMatch(/else if \(Number\.isFinite\(cutOut\)\) \{ c\.exit = \{ effect: "cut", at: cutOut \};/);
    // The empty-moment gate (and its enlarging repair) never runs on a scene the build knows is over the camera.
    expect(pipeline).toMatch(/const cameraIsBackground = !!opts\.overCamera \|\| sceneCompositesOverSpeaker\(opts\.scene, !!opts\.speakerUrl\);/);
    // OVER THE CAMERA a plate is the ground: ink that fails on a dark AND a light page is a finding, not dropped.
    expect(pipeline).toMatch(/variant\("scene-dark\.html", "#101014"\), variant\("scene-light\.html", "#e9e9ef"\)/);
    expect(pipeline).toMatch(/if \(type === "illegible" && opts\.overCamera && !\(failsAnyCamera && failsAnyCamera\.has\(d\.text\)\)\)/);
    // THE LINES SET THE FLOOR: a scene's duration is at least its script at speaking pace (measured live: 24 words in 4s).
    expect(pipeline).toMatch(/const floor = Math\.round\(speakingEstimate\(script\) \* 100\) \/ 100;\s*if \(\(Number\(d\.duration_seconds\) \|\| 0\) < floor\) \{[\s\S]*?d\.duration_seconds = floor;/);
    // Only creator-cut, only over the person, and before the spine pass so the proof cast after it can still replace the window.
    expect(pipeline).toMatch(/if \(filmGrammar === "creator-cut" && d\.transparent_background !== false\) \{\s*const dur = Number\(d\.duration_seconds\)/);
    const defaults = pipeline.indexOf("CREATOR-CUT DEFAULTS");
    const cast = pipeline.indexOf("for (const cut of proofComponents(d))");
    expect(defaults).toBeGreaterThan(0);
    expect(defaults).toBeLessThan(cast);
    // The director says a tutorial has no bed.
    const cd = await read("../src/llm/creative-director.ts");
    expect(cd).toMatch(/audioSystem\.music_mood "none" for a tutorial/);
  });

  it("a cut-in proof is plated and framed, a cut-in label rides above it, and the film ends on the person", async () => {
    const { isProofSurface, PROOF_SURFACE_RE } = await import("../src/core/asset-needs.js");
    expect(isProofSurface("quotient-campaign")).toBe(true);
    expect(isProofSurface("email-compose")).toBe(true);
    expect(isProofSurface("image")).toBe(true);
    expect(isProofSurface("kinetic-text")).toBe(false);
    expect(isProofSurface("sticker-prop")).toBe(false);
    expect(PROOF_SURFACE_RE.test("image-showcase")).toBe(false);
    // The assembler plates a cut-in proof (the mocks draw a floating window with margins; the camera showed through).
    const asm = await read("../src/core/scene-assembler.ts");
    expect(asm).toMatch(/function isCutInProof\(comp/);
    expect(asm).toMatch(/isCutInProof\(comp\) \? "; background:#fff" : ""/);
    // ...and the plate is a declaration of its OWN, after a separator: glued to
    // the position style ("z-index:36background:#fff") the browser dropped the
    // z-index, the wrapper fell under the camera rig, and no cutaway rendered
    // at all (measured live on the second rendered ad, every scene).
    const { assembleScene } = await import("../src/core/scene-assembler.js");
    const mockSrc = await read("../src/components/mockups/email-compose.component.html").catch(() => "");
    const html = await assembleScene({
      scene: {
        id: "s1", label: "claim", duration_seconds: 4, transparent_background: true,
        components: [{
          id: "email-compose", type: "email-compose", z_index: 36, frame_anchor: "body",
          position: { x: 0, y: 0, width: "100%", height: "100%" },
          enter: { effect: "cut", at: 1.2 }, exit: { effect: "cut", at: 3.2 },
          data: { to: "sam@acme.com", subject: "Free trial", body: "Two lines." },
        }, {
          id: "captions", type: "reel-caption-lane", z_index: 41,
          position: { x: "5%", y: "70%", width: "90%", height: "12%" },
          data: { phrases: [{ text: "One *brief*", start: 0, end: 2 }], scrim: "plate" },
        }],
      } as any,
      components: [
        { type: "email-compose", source: mockSrc || '<div class="ec">{{subject}}</div>' },
        { type: "reel-caption-lane", source: await read("../src/components/captions/reel-caption-lane.component.html") },
      ],
      brandKit: { fonts: [] } as any,
      canvas: { width: 1080, height: 1920 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const wrapper = html.match(/<div class="mp-component" data-cid="email-compose"[^>]*>/)?.[0] || "";
    expect(wrapper).toMatch(/data-mp-cutaway="1"/);
    expect(wrapper).toMatch(/style="[^"]*z-index:36;\s*background:#fff"/);
    expect(wrapper).not.toMatch(/z-index:36background/);
    // THE WORDS HOLD STILL: the caption lane is pinned to the frame and parked outside the camera rig
    // (inside it a 1.3x punch-in pushed the chest band to 87%-103% -- measured live, the captions in the platform strip).
    const laneWrap = html.match(/<div class="mp-component" data-cid="captions"[^>]*>/)?.[0] || "";
    expect(laneWrap).toMatch(/data-mp-fixed="1"/);
    expect(laneWrap).not.toMatch(/data-mp-cutaway/);
    expect(asm).toMatch(/if \(n\.hasAttribute && n\.hasAttribute\('data-mp-fixed'\)\) return;/);
    // ...hoisted out of the full-frame .mp-camera container first, which the rig adopts whole (measured: the attribute
    // alone left the lane inside, at 87%-103% under the punch-in).
    expect(asm).toMatch(/root\.querySelectorAll\('\[data-mp-fixed\]'\)\)\.forEach\(function\(f\) \{\s*if \(f\.parentNode !== root\) root\.appendChild\(f\);/);
    const composite = await read("../src/core/composite-assembler.ts");
    expect(composite).toMatch(/isFixedToFrame\(comp\.type\) \? ' data-mp-fixed="1"' : ""/);
    expect(composite).toMatch(/isCutInProof\(comp\) \? ' data-mp-cutaway="1"' : ""/);
    // Over a cutaway the pinned lane drops to the chest band for the cut window and comes back (measured live: the
    // captions "cracked out over the main part of the screen" on the mock).
    expect(asm).toMatch(/var CUTS = \$\{JSON\.stringify\(cuts\)\};/);
    expect(asm).toMatch(/master\.set\(el, \{ top: c\.cutTop \+ '%', height: '12%' \}, w\.at\);\s*if \(w\.until != null\) master\.set\(el, \{ top: c\.top0, height: c\.height0 \|\| '12%' \}, w\.until\);/);
    const gen0 = await read("../src/llm/scene-generator.ts");
    expect(gen0).toMatch(/if \(c\.type === "reel-caption-lane" && tallFrame && lay && parseFloat\(String\(lay\.position\.y\)\) < 50\) data\.cut_top = 70;/);
    // Under a plate or a shadow the lane's ink is white whatever the brand says (measured live: "black on black").
    const lane = await read("../src/components/captions/reel-caption-lane.component.html");
    expect(lane).toMatch(/\.rcl-scrim-shadow \.rcl-inner,\s*\.rcl-scrim-plate \.rcl-inner \{\s*color: #ffffff;\s*\}/);
    // ...and frames at about 1.5x, region high (Marc: 2.2x was too big for the vertical screen).
    // ...in the WRAPPER's own box, so a surface owning a band of a tall frame frames like a full-frame cutaway.
    expect(asm).toMatch(/var sc = Math\.max\(1\.2, Math\.min\(2\.2, \(W \* 0\.94 \/ r\.w\) \* 1\.5\)\);/);
    expect(asm).toMatch(/tx = Math\.max\(W - W \* sc, Math\.min\(0, tx\)\);\s*ty = Math\.max\(H - H \* sc, Math\.min\(0, ty\)\);/);
    // A framed surface with no cut (canvas-tour on 9x16: a Slack window squeezed to the phone's width) is framed from its first frame.
    expect(asm).toMatch(/if \(c\.frame && !c\.enter\) \{/);
    // ...and a framed surface's entrance lands on its framing, not the unframed pose.
    expect(asm).toMatch(/\} else if \(c\.frame\) \{[\s\S]*?scale: function\(\) \{ return frE\(\)\.scale; \}/);
    expect(gen0 || "").toBeDefined();
    // The generator lays a cut-in label above the proof and frames only proof surfaces.
    const gen = await read("../src/llm/scene-generator.ts");
    expect(gen).toMatch(/z_index: isProofSurface\(t\) \? 36 : 39/);
    expect(gen).toMatch(/var ownsWidth = !speakerBase && Number\.isFinite\(slotW\) && slotW >= 80;/);
    expect(gen).toMatch(/tallFrame && isProofSurface\(c\.type\) && \(isCutaway\(c as any\) \|\| ownsWidth\) \? frameAnchorFor\(c\.type, data\) : null;/);
    // The camera rule never emits the same move twice (a label and a mock cut in on one word did).
    const { creatorCutCameraMoves } = await import("../src/llm/scene-generator.js");
    const twice: any[] = [
      { id: "kinetic-text", type: "kinetic-text", data: {}, enter: { effect: "cut", at: 1.2 }, exit: { effect: "cut", at: 3.4 } },
      { id: "quotient-campaign", type: "quotient-campaign", data: {}, enter: { effect: "cut", at: 1.2 }, exit: { effect: "cut", at: 3.4 } },
    ];
    const moves = creatorCutCameraMoves(twice, { grammar: "creator-cut", motion: "punchy", duration: 6, takeover: false })!;
    expect(moves.map((m) => `${m.at}|${m.type}`)).toEqual(["0.2|zoom", "1.2|reset", "3.4|zoom", "4.9|reset"]);
    // The pipeline: the last claim's proof cuts out 1.5s before the end; a cut with no time lands at 30%.
    const pipeline = await read("../src/llm/pipeline.ts");
    expect(pipeline).toMatch(/the film ends on the person: \$\{c\.type\} cuts out at \$\{back\}s/);
    expect(pipeline).toMatch(/\(c\.enter\.at === undefined \|\| c\.enter\.at === null\)\) \{\s*c\.enter\.at = Math\.round\(dur \* 0\.3 \* 100\) \/ 100;/);
    expect(pipeline).not.toMatch(/CUTAWAY_MOCK_RE/);
    // The writer's shorthand (enter: "cut") is read as the object form BEFORE
    // the defaults, so a cut with no time still lands at 30% (measured live:
    // the close's mock arrived as the string and cut in at frame 0).
    expect(pipeline).toMatch(/if \(typeof c\.enter === "string" && c\.enter\) c\.enter = \{ effect: c\.enter \};\s*if \(typeof c\.exit === "string" && c\.exit\) c\.exit = \{ effect: c\.exit \};\s*if \(isProofSurface\(c\.type\) && c\.enter === undefined/);
  });

  it("a standing header becomes chapter labels, and a cut whose word is not in the lines gets the default window", async () => {
    const pipeline = await read("../src/llm/pipeline.ts");
    // The same pill on (nearly) every scene is a title that holds for the whole film -- forbidden unless asked.
    expect(pipeline).toMatch(/if \(n < 3 \|\| n < Math\.max\(3, withLines\)\) continue;/);
    expect(pipeline).toMatch(/the standing header "\$\{c\.data\.text\}" becomes the chapter label/);
    // "Weekly Newsletter · Draft" on every scene: the shared head goes, the tail stays.
    expect(pipeline).toMatch(/const tailOf = /);
    expect(pipeline, "a tail with no letter or digit is no label").toMatch(/\/\[\\p\{L\}\\p\{N\}\]\/u\.test\(t\) \? t : ""/);
    expect(pipeline).toMatch(/const chapter = \(tailOf\(c\) \|\| label\)\.toUpperCase\(\)\.slice\(0, 24\);/);
    // Unresolved enter.at / exit.at on a cut resolve to 0 otherwise -- the person gone for the whole claim.
    expect(pipeline).toMatch(/if \(u\.path !== "enter\.at" && u\.path !== "exit\.at"\) continue;/);
    expect(pipeline).toMatch(/anim\.at = Math\.round\(dur \* \(u\.path === "enter\.at" \? 0\.3 : 0\.8\) \* 100\) \/ 100;/);
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
    // The words are the text layer; the writer marks the emphasis in the line; a label only when the claim wants a name.
    expect(sb).toMatch(/THE WORDS ARE ON SCREEN THE WHOLE TIME: the build captions every scene from the take's words/);
    expect(sb).toMatch(/MARK THE EMPHASIS: wrap the ONE word each line turns on in \*stars\* inside voiceover_text/);
    expect(sb).toMatch(/A chapter label \(a plated word or two on the claim, gone when the claim moves on\) ONLY when the claim wants a name/);
    expect(sb).toMatch(/wrap the ONE word each line turns on in \*stars\* \(\\"One \*brief\*\. Every surface\.\\"\)/);
    // The normalizer lifts the stars off the line: the prompter reads the clean sentence, the scene keeps the words.
    const marked: any = { label: "Scene 1 - Hook", voiceover_text: "One *brief*. Every surface.\nThat's *Quotient*.", components: [] };
    const liftNotes = normalizeSceneShape(marked);
    expect(marked.voiceover_text).toBe("One brief. Every surface.\nThat's Quotient.");
    expect(marked.emphasis).toEqual(["brief", "quotient"]);
    expect(liftNotes.some((n) => /emphasis lifted off the lines: brief, quotient/.test(n))).toBe(true);
    // The layout: the lane owns the chest band above the proof and a label, and the band is not handed out twice.
    const gen = await read("../src/llm/scene-generator.ts");
    expect(gen).toMatch(/if \(c\.type !== "reel-caption-lane"\) return;\s*if \(vertical && !takeover\) \{[\s\S]*?z_index: 41 \};\s*laneLower = !!lb\.lower;/);
    expect(gen).toMatch(/var usedLower = laneLower, usedTop = laneTop;\s*if \(bands\.lower && stack\.length && !laneLower\) \{/);
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
    expect(gen).toMatch(/var frameAnchor = tallFrame && isProofSurface\(c\.type\) && \(isCutaway\(c as any\) \|\| ownsWidth\) \? frameAnchorFor\(c\.type, data\) : null;/);
    expect(gen).toMatch(/\.\.\.\(frameAnchor \? \{ frame_anchor: frameAnchor \} : \{\}\)/);
    const asm = await read("../src/core/scene-assembler.ts");
    expect(asm).toMatch(/frame: \(c as any\)\.frame_anchor \|\| null,/);
    // Framed at the cut's first render (the region may be a pane switched to later), from layout boxes, clamped to cover the frame.
    expect(asm).toMatch(/function frameOf\(el, name\)/);
    expect(asm).toMatch(/if \(eCut && c\.frame\) \{/);
    expect(asm).toMatch(/duration: 0\.001, ease: 'none', immediateRender: false,/);
    expect(asm).toMatch(/tx = Math\.max\(W - W \* sc, Math\.min\(0, tx\)\)/);
    // Both assemblers pass the frame through.
    expect(asm).toMatch(/wrapperChoreoScript\(scene\.components, scene\.duration_seconds, "", canvas\.width, canvas\.height\)/);
    const comp = await read("../src/core/composite-assembler.ts");
    expect(comp).toMatch(/wrapperChoreoScript\(scene\.components, scene\.duration_seconds, `\$\{scene\.id\}__`, canvas\.width, canvas\.height\)/);
  });
});
