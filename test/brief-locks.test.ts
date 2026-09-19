/**
 * The sheet-row test (SPEC-briefs.md): a marketing brief's hook, storyline,
 * must-say lines and end line survive a feedback redraft; real footage is a
 * need on any grammar; a framed mock's crop is not off-canvas content.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractBriefLocks, briefLockBlock, missingLocks, previousBoardBlock } from "../src/llm/brief-locks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFile(path.join(__dirname, "..", f), "utf-8");

const BRIEF = `HERO BRAND FILM for Quotient, 25-30 seconds.

OPENING HOOK: a marketer types: "Launch our product update next Tuesday."

STORYLINE (follow this beat for beat): one sentence appears on screen. It bursts into copy, audience, email and social tasks until the marketer is visually buried. Hard cut: Quotient collapses the chaos back into one instruction.

CTA / END LINE, verbatim: "You set the direction. Quotient gets the work done."

Avoid futuristic AI visuals: no "glowing" things.`;

describe("what a brief locks", () => {
  const locks = extractBriefLocks(BRIEF);
  it("keeps the quoted hook and end line, not a one-word quote", () => {
    expect(locks.quotes).toEqual(["Launch our product update next Tuesday.", "You set the direction. Quotient gets the work done."]);
  });
  it("keeps the named sections with their bodies", () => {
    const names = locks.sections.map((s) => s.name);
    expect(names).toContain("opening hook");
    expect(names).toContain("storyline");
    expect(names).toContain("cta / end line");
    expect(locks.sections.find((s) => s.name === "storyline")!.text).toMatch(/Hard cut: Quotient collapses the chaos/);
  });
  it("renders a lock block for the redraft prompt, and nothing for a brief that locks nothing", () => {
    expect(briefLockBlock(locks)).toMatch(/LOCKED BY THE BRIEF[\s\S]*- "Launch our product update next Tuesday\."[\s\S]*STORYLINE:/);
    expect(briefLockBlock(extractBriefLocks("make a nice video"))).toBe("");
  });
  it("finds the locked lines a board dropped, ignoring case, quotes and spacing", () => {
    const board = { scenes: [{ voiceover_text: "launch our product update next tuesday." }, { scene_template: { data: { text: "You set the direction.\nQuotient gets the work done." } } }] };
    expect(missingLocks(board, locks)).toEqual([]);
    expect(missingLocks({ scenes: [{ voiceover_text: "Launch our Q3 product hunt campaign" }] }, locks)).toEqual(locks.quotes);
  });
  it("summarises the previous board scene by scene for the redraft", () => {
    const b = previousBoardBlock({ scenes: [{ label: "The Ask", duration_seconds: 6, voiceover_text: "It starts with one sentence.", components: [{ type: "composer" }], broll_query: "hands typing" }, { label: "Close", scene_template: { type: "st-logo-close" } }] });
    expect(b).toMatch(/1\. The Ask \[6s\] -- components composer -- broll: hands typing/);
    expect(b).toMatch(/2\. Close \[\?s\] -- template st-logo-close/);
    expect(previousBoardBlock(null)).toBe("");
  });
});

describe("the wiring", () => {
  it("a redraft is the brief + its locks + the previous board + the feedback, and the brief is persisted once", async () => {
    const server = await read("src/server.ts");
    expect(server).toMatch(/const brief = String\(params\.prompt \|\| existingProject\.brief \|\|/);
    expect(server).toMatch(/const lockBlock = briefLockBlock\(locks\);/);
    expect(server).toMatch(/const prev = previousBoardBlock\(existingProject\.storyboard\);/);
    expect(server).toMatch(/brief: redraftBrief,/);
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/project\.brief = opts\.brief \|\| project\.brief \|\| opts\.prompt;/);
    expect(pipeline).toMatch(/const missing = missingLocks\(project\.storyboard, locks\);/);
    const types = await read("src/core/types.ts");
    expect(types).toMatch(/  brief\?: string;/);
  });
  it("real footage is a need on any grammar: fetched for every film, laid as the ground on a film nobody carries", async () => {
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/if \(\(personFilm && \(canDraw \|\| canFetchStock\)\) \|\| canFetchStock\) \{/);
    expect(pipeline).toMatch(/if \(!personFilm\) needFootage\.set\(i, need\.path\);/);
    expect(pipeline).toMatch(/var brollUrlMap = new Map<number, string>\(needFootage\);/);
    const sb = await read("src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/ANY FILM for stock_footage/);
    expect(sb).toMatch(/REAL FOOTAGE -- when the brief's visual direction asks for real footage/);
  });
  it("a framed mock's crop is not off-canvas content", async () => {
    const capture = await read("src/core/capture.ts");
    expect(capture).toMatch(/const framedHere = !!\(el\.closest && el\.closest\("\[data-mp-frame\]"\)\);/);
    expect(capture).toMatch(/if \(\(kind === "button" \|\| kind === "media"\) && !framedHere\) \{/);
    expect(capture).toMatch(/if \(kindHere && !fullBleedIsh && !inFramed && r\.width \* r\.height >= 1500\) \{/);
  });
});

describe("a locked line survives the writer's typography", () => {
  it("line breaks, emphasis stars and moved commas are not a dropped line", async () => {
    const { missingLocks } = await import("../src/llm/brief-locks.js");
    const locks = { quotes: ["One. Quotient now remembers your brand, your voice, and how you like to work, and it draws on that in every campaign, blog and email it writes with you.", "Two. Flows. A welcome series or a win-back, built as one automated flow that runs on its own once you turn it on."], sections: {} } as any;
    const board = { scenes: [
      { voiceover_text: "One.\nQuotient now *remembers* your brand, your voice, and how you like to work, and it draws on that in every campaign, blog and email it writes with you." },
      { voiceover_text: "Two.\nFlows.\nA welcome series or a win-back, built as one automated flow that runs on its own, once you turn it on." },
    ] };
    expect(missingLocks(board, locks)).toEqual([]);
    expect(missingLocks({ scenes: [{ voiceover_text: "Something else entirely." }] }, locks).length).toBe(2);
  });
});

describe("the mock is the placeholder: a provided screen takes its slot on any film", () => {
  it("replaces the staged product mock with the recording at the same position, layer and timing; lays it full-bleed when there is no mock", async () => {
    const { castProvidedScreens } = await import("../src/core/asset-needs.js");
    const scene: any = {
      components: [
        { id: "bg", type: "webgl-backdrop", data: {} },
        { id: "campaign", type: "quotient-campaign", data: { title: "Q3" }, position: { x: "0%", y: "18%", width: "100%", height: "70%" }, z_index: 10, enter: { effect: "cut", at: 1 } },
      ],
      assets: [
        { type: "screen_recording", description: "the campaign board", status: "provided", path: "/assets/t/projects/p/assets/campaign.mp4" },
        { type: "stock_footage", description: "office", status: "provided", path: "/assets/t/projects/p/assets/office.mp4" },
      ],
    };
    const r = castProvidedScreens(scene);
    expect(r.replaced).toBe(1); expect(r.added).toBe(0);
    expect(r.components[1]).toMatchObject({ id: "campaign", type: "video", data: { src: "/assets/t/projects/p/assets/campaign.mp4", object_fit: "contain" }, position: { y: "18%", height: "70%" }, z_index: 10, enter: { effect: "cut", at: 1 } });
    expect(r.components[0].type).toBe("webgl-backdrop");
    // No mock: full-bleed, like any provided proof. A pending need casts nothing.
    const r2 = castProvidedScreens({ components: [{ type: "kinetic-text", data: {} }], assets: [{ type: "screenshot", description: "x", status: "provided", path: "/a/s.png", at: 2, until: 5 }] } as any);
    expect(r2.added).toBe(1);
    expect(r2.components[1]).toMatchObject({ type: "image", data: { src: "/a/s.png", drift: false, fit: "contain", at: 2, exit_at: 5 }, position: { width: "100%", height: "100%" } });
    expect(castProvidedScreens({ components: [{ type: "quotient-home", data: {} }], assets: [{ type: "screen_recording", description: "x", status: "needed" }] } as any).replaced).toBe(0);
  });
  it("the screen slate: an open screen need takes the mock's slot with a slate, never the mock; the recording then takes the slate's slot", async () => {
    const { castScreenSlates, castProvidedScreens, isProofSurface } = await import("../src/core/asset-needs.js");
    const scene: any = {
      components: [
        { id: "bg", type: "webgl-backdrop", data: {} },
        { id: "campaign", type: "quotient-campaign", data: { title: "Q3" }, position: { x: "0%", y: "18%", width: "100%", height: "70%" }, z_index: 10, enter: { effect: "cut", at: 1 }, exit: { effect: "cut", at: 6 } },
      ],
      assets: [{ type: "screen_recording", description: "the campaign board filling in", status: "needed" }],
    };
    const r = castScreenSlates(scene);
    expect(r.cast.length).toBe(1); expect(r.cleared).toBe(0);
    expect(r.components.length).toBe(2);
    expect(r.components[1]).toMatchObject({ id: "campaign", type: "asset-placeholder", data: { need: "the campaign board filling in", text: "the campaign board filling in", asset_type: "Screen recording needed" }, position: { y: "18%", height: "70%" }, z_index: 10, enter: { effect: "cut", at: 1 }, exit: { effect: "cut", at: 6 } });
    expect(String(r.components[1].data.hint)).toMatch(/Studio/);
    expect(isProofSurface("asset-placeholder")).toBe(true);
    // Idempotent: the slate already there casts nothing more.
    const again = castScreenSlates({ ...scene, components: r.components });
    expect(again.cast.length).toBe(0); expect(again.components).toEqual(r.components);
    // No mock: full-bleed, cut in on the need's seconds; a word anchor only when asked for.
    const r2 = castScreenSlates({ components: [{ type: "kinetic-text", data: {} }], assets: [{ type: "screenshot", description: "the inbox", status: "needed", at: 2, until: 5 }] } as any);
    expect(r2.components[1]).toMatchObject({ type: "asset-placeholder", data: { asset_type: "Screenshot needed" }, position: { width: "100%", height: "100%" }, enter: { effect: "cut", at: 2 }, exit: { effect: "cut", at: 5 } });
    const r3 = castScreenSlates({ components: [], assets: [{ type: "screen_recording", description: "x", status: "needed", at: "@plugins", until: "@next" }] } as any);
    expect(r3.components[0].enter).toBeUndefined();
    const r4 = castScreenSlates({ components: [], assets: [{ type: "screen_recording", description: "x", status: "needed", at: "@plugins", until: "@next" }] } as any, { anchors: true });
    expect(r4.components[0]).toMatchObject({ enter: { effect: "cut", at: "@plugins" }, exit: { effect: "cut", at: "@next" } });
    // The recording lands: it takes the slate's slot (the mock's position and window), and the slate is gone.
    const provided = { ...scene, components: r.components, assets: [{ ...scene.assets[0], status: "provided", path: "/a/campaign.mp4" }] };
    const p = castProvidedScreens(provided);
    expect(p.replaced).toBe(1);
    expect(p.components[1]).toMatchObject({ id: "campaign", type: "video", data: { src: "/a/campaign.mp4" }, position: { y: "18%" }, enter: { effect: "cut", at: 1 } });
    expect(castScreenSlates({ ...provided, components: p.components }).components.some((c: any) => c.type === "asset-placeholder")).toBe(false);
    // A slate whose need was filled some other way is cleared.
    const stale = castScreenSlates({ components: r.components, assets: [{ ...scene.assets[0], status: "provided", path: "/a/c.txt" }] } as any);
    expect(stale.cleared).toBe(1); expect(stale.components.length).toBe(1);
  });
  it("the pipeline casts the slate on every grammar: in the mock's slot on a film nobody carries, on its words on a person film", async () => {
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/if \(!personFilm\) \{[\s\S]*?const sl = castScreenSlates\(d\);/);
    expect(pipeline).toMatch(/\} else \{[\s\S]*?const sl = castScreenSlates\(d, \{ anchors: true \}\);[\s\S]*?extractAnchors\(c\);[\s\S]*?resolveComponent\(c, d\.spine\)/);
    const sb = await read("src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/the build casts a SLATE in the mock's slot/);
    expect(sb).toMatch(/REAL SCREENS -- a scene whose payoff is a product mock also lists[\s\S]*?stands a slate in the mock's slot/);
  });
  it("the pick applies now: a need provided on a built film takes its slot in the built scene", async () => {
    const { recastProvidedNeed } = await import("../src/core/asset-needs.js");
    // A swap: the b-roll ground points at the new clip.
    const built: any = { duration_seconds: 5, components: [{ id: "bg", type: "video", z_index: 1, position: { x: 0, y: 0, width: "100%", height: "100%" }, data: { src: "/a/old.mp4", object_fit: "cover" } }, { type: "kinetic-text", data: {} }] };
    const r = recastProvidedNeed(built, { type: "stock_footage", description: "office", status: "provided", path: "/a/new.mp4" } as any, "/a/old.mp4", { personFilm: false });
    expect(r).toMatchObject({ changed: 1, how: "swapped" });
    expect(r.components[0].data).toMatchObject({ src: "/a/new.mp4" });
    expect(built.components[0].data.src).toBe("/a/old.mp4"); // pure
    // A first b-roll on a film nobody carries lays the ground.
    const r2 = recastProvidedNeed({ components: [{ type: "kinetic-text", data: {} }] }, { type: "stock_footage", description: "x", status: "provided", path: "/a/b.mp4" } as any, undefined, { personFilm: false });
    expect(r2.how).toBe("laid as the ground"); expect(r2.components[0]).toMatchObject({ id: "bg", type: "video", data: { src: "/a/b.mp4" } });
    // A screen recording takes the slate's slot.
    const r3 = recastProvidedNeed({ components: [{ id: "m", type: "asset-placeholder", data: { need: "the board" }, position: { x: "0%", y: "18%", width: "100%", height: "70%" } }] }, { type: "screen_recording", description: "the board", status: "provided", path: "/a/s.mp4" } as any, undefined, { personFilm: false });
    expect(r3.how).toBe("took the slate's slot"); expect(r3.components[0]).toMatchObject({ id: "m", type: "video", position: { y: "18%" } });
    // On a person film a drawn object cuts in on its seconds.
    const r4 = recastProvidedNeed({ duration_seconds: 10, components: [] }, { type: "illustration", description: "x", status: "provided", path: "/a/d.png", at: 2, until: 6 } as any, undefined, { personFilm: true });
    expect(r4.components[0]).toMatchObject({ type: "image", data: { src: "/a/d.png", at: 2, exit_at: 6 } });
    // Nothing to do: already there, or not provided.
    expect(recastProvidedNeed({ components: r2.components }, { type: "stock_footage", description: "x", status: "provided", path: "/a/b.mp4" } as any, undefined, { personFilm: false }).changed).toBe(0);
    expect(recastProvidedNeed({ components: [] }, { type: "stock_footage", description: "x", status: "needed" } as any, undefined, { personFilm: false }).changed).toBe(0);
    const index = await read("src/index.ts");
    expect(index).toMatch(/const evRecast = recastInBuiltScene\(evProjectObj, evScene, evNeed, evPrev\);/);
    // ...and the BOARD scene is recast too, so the card and the band agree with the film
    expect(index).toMatch(/const board = project\.storyboard\?\.scenes\?\.\[sceneIndex\];[\s\S]*?recastProvidedNeed\(board as any, need, prevPath, \{ personFilm \}\)/);
    const cards = await read("src/core/storyboard-cards.ts");
    expect(cards).toMatch(/const pf = await ensureMediaPoster\(project as any, src, opts\.dataDir!\);/);
    expect(cards).toMatch(/type: "image", data: \{ \.\.\.c\.data, src: `data:image\/jpeg;base64,/);
    expect(index).toMatch(/const nsRecast = recastInBuiltScene\(nsProj, nsScene, need, nsPrev\);/);
    expect(await read("src/preview-app/preview-app.ts")).toMatch(/function npRecastNote\(r\)/);
  });
  it("the pipeline casts provided screens on a film nobody carries; the writer lists the need beside every product mock", async () => {
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/if \(!personFilm\) \{[\s\S]*?const r = castProvidedScreens\(d\);/);
    const sb = await read("src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/ANY FILM for screen_recording \/ screenshot: wherever a scene stages a product mock as its payoff/);
    expect(sb).toMatch(/REAL SCREENS -- a scene whose payoff is a product mock also lists/);
  });
});
