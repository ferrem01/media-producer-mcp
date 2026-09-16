import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_GRAMMARS } from "../src/llm/creative-director.js";
import { personCarries, ensureSpeakerNeeds, PERSON_GRAMMARS } from "../src/core/take-needs.js";
import {
  normalizeEvidence, ensureEvidenceNeeds, openEvidenceNeeds, provideEvidence,
  evidenceComponents, hasCutawayFor, evidenceNeedOf,
} from "../src/core/evidence-needs.js";
import { normalizeSceneShape } from "../src/llm/storyboard-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFile(path.resolve(__dirname, rel), "utf-8");

// SPEC-creator-cut.md, phase 1: a ninth grammar -- a person explains, the
// screen proves it. The person is the spine (everything the take flow does
// for `speaker` applies), the writer declares the PROOF each claim wants,
// the board asks for it, and a provided file becomes a cutaway.

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
    const boardPage = await read("../src/board-page.ts");
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
    // The scene schema carries the evidence field.
    expect(sb).toMatch(/evidence: \{\s*type: "array"/);
  });
});

describe("evidence: the proof each claim wants", () => {
  const raw = [
    { kind: "screenshot", description: "The campaign screen, Metrics tab open", at: "@metrics", until: "@next", focus: "circle the Publish button" },
    { kind: "screen-recording", description: "Dragging a card across the calendar", use: "card" },
    { kind: "stock_footage", description: "hands typing at a kitchen table" },
    { kind: "hologram", description: "not a kind" },
    { kind: "mockup", description: "" },
    { type: "mockup", what: "the agent panel performing" },
  ];

  it("normalizes what the writer wrote: known kinds, a real description, times kept as written", () => {
    const ev = normalizeEvidence(raw);
    expect(ev.map((e) => e.kind)).toEqual(["screenshot", "screen_recording", "stock_footage", "mockup"]);
    expect(ev[0]).toEqual({ kind: "screenshot", description: "The campaign screen, Metrics tab open", at: "@metrics", until: "@next", focus: "circle the Publish button" });
    expect(ev[1].use).toBe("card");
    expect(ev[3].description).toBe("the agent panel performing");
    // ...and normalizeSceneShape runs it, dropping the junk with a note.
    const scene: any = { voiceover_text: "x", components: [], evidence: raw };
    const notes = normalizeSceneShape(scene);
    expect(scene.evidence).toHaveLength(4);
    expect(notes.some((n) => /dropped 2 evidence entries/.test(n))).toBe(true);
    const none: any = { voiceover_text: "x", components: [], evidence: [{ kind: "hologram" }] };
    normalizeSceneShape(none);
    expect(none.evidence).toBeUndefined();
  });

  it("becomes needs on the scene: human kinds needed, the build's kinds optional, all with the evidence index", () => {
    const p = board([{ voiceover_text: "Look at the metrics.", evidence: normalizeEvidence(raw) }]);
    expect(ensureEvidenceNeeds(p)).toBe(true);
    const assets = p.storyboard.scenes[0].assets;
    expect(assets.map((a: any) => [a.type, a.status, a.priority, a.evidence])).toEqual([
      ["screenshot", "needed", "recommended", 0],
      ["screen_recording", "needed", "recommended", 1],
      ["stock_footage", "needed", "nice_to_have", 2],
      ["mockup", "needed", "nice_to_have", 3],
    ]);
    expect(assets[0].description).toBe("Screenshot: The campaign screen, Metrics tab open");
    expect(assets[2].generation_prompt).toBe("hands typing at a kitchen table");
    // Idempotent; and it lives beside the take need without disturbing it.
    expect(ensureEvidenceNeeds(p)).toBe(false);
    ensureSpeakerNeeds(p);
    expect(ensureEvidenceNeeds(p)).toBe(false);
    expect(p.storyboard.scenes[0].assets.filter((a: any) => a.type === "camera_video")).toHaveLength(1);
    expect(openEvidenceNeeds(p)).toHaveLength(4);
  });

  it("a rewritten board drops the needs of evidence that no longer exists", () => {
    const p = board([{ voiceover_text: "x", evidence: normalizeEvidence(raw) }]);
    ensureEvidenceNeeds(p);
    p.storyboard.scenes[0].evidence = p.storyboard.scenes[0].evidence.slice(0, 1);
    expect(ensureEvidenceNeeds(p)).toBe(true);
    expect(p.storyboard.scenes[0].assets.filter((a: any) => a.evidence !== undefined)).toHaveLength(1);
  });

  it("a provided file fills one need, and the build casts it as a cutaway on its words", () => {
    const p = board([{ voiceover_text: "Look at the metrics. Then the next thing.", evidence: normalizeEvidence(raw) }]);
    ensureEvidenceNeeds(p);
    const need = provideEvidence(p, 0, 0, "/assets/t/projects/p/assets/evidence-1.png");
    expect(need.status).toBe("provided");
    expect(need.path).toBe("/assets/t/projects/p/assets/evidence-1.png");
    expect(evidenceNeedOf(p.storyboard.scenes[0], 0)).toBe(need);
    expect(openEvidenceNeeds(p).map((o) => o.evidence_index)).toEqual([1, 2, 3]);
    provideEvidence(p, 0, 2, "/assets/t/projects/p/assets/broll.mp4");
    // The card (evidence 1) is not built yet; the clip and the still are.
    provideEvidence(p, 0, 1, "/assets/t/projects/p/assets/rec.mp4");
    const cuts = evidenceComponents(p.storyboard.scenes[0]);
    expect(cuts.map((c: any) => [c.type, c.data.media, c.data.evidence])).toEqual([
      ["cutaway", "image", 0],
      ["cutaway", "video", 2],
    ]);
    expect(cuts[0].data).toMatchObject({ src: "/assets/t/projects/p/assets/evidence-1.png", at: "@metrics", exit_at: "@next", focus: "circle the Publish button" });
    expect(cuts[0].position).toEqual({ x: "0%", y: "0%", width: "100%", height: "100%" });
    // A rebuild must not stack a second cutaway for the same proof.
    expect(hasCutawayFor(cuts, 0)).toBe(true);
    expect(hasCutawayFor(cuts, 1)).toBe(false);
    // Out-of-range indexes are refused, not silently added.
    expect(() => provideEvidence(p, 0, 9, "/assets/t/projects/p/assets/x.png")).toThrow(/declares no evidence 10/);
    expect(() => provideEvidence(p, 3, 0, "/assets/t/projects/p/assets/x.png")).toThrow(/scene 4 not found/);
  });

  it("the pipeline carries evidence and needs through the saved storyboard and casts the cutaways before the spine pass", async () => {
    const pipeline = await read("../src/llm/pipeline.ts");
    expect(pipeline).toMatch(/evidence: Array\.isArray\(s\.evidence\)/);
    expect(pipeline, "a build-from-board must not throw provided files away").toMatch(/assets: Array\.isArray\(s\.assets\) \? s\.assets : \[\]/);
    expect(pipeline).toMatch(/if \(personCarries\(filmGrammar\)\) \{/);
    expect(pipeline).toMatch(/personCarries\(filmGrammar\) \|\| filmGrammar === "screencast"/);
    const cast = pipeline.indexOf("for (const cut of evidenceComponents(d))");
    const spine = pipeline.indexOf("const r = applySpine(d, spine);");
    expect(cast).toBeGreaterThan(0);
    expect(cast, "cutaways are cast BEFORE anchors resolve").toBeLessThan(spine);
    // The route the board uploads through.
    const index = await read("../src/index.ts");
    expect(index).toMatch(/\/api\/evidence\//);
    expect(index).toMatch(/provideEvidence\(evProjectObj, evScene, evIndex, evUrl\)/);
    // The layout: full-bleed, never banded, never phone-zoomed.
    const gen = await read("../src/llm/scene-generator.ts");
    expect(gen).toMatch(/CUTAWAY_TYPES = \["cutaway"\]/);
    expect(gen).toMatch(/PHONE_ZOOM_EXCLUDE = \[.*"cutaway"\]/);
  });

  it("the cutaway component is a hard cut: no fade either side, a clip from its own start", async () => {
    const html = await read("../src/components/media/cutaway.component.html");
    // Sub-frame tweens (a set() later in a timeline renders on creation).
    expect(html).toMatch(/tl\.fromTo\(root, \{ autoAlpha: 0 \}, \{ autoAlpha: 1, duration: 0\.02, ease: 'none', immediateRender: false \}, at\)/);
    expect(html).toMatch(/tl\.to\(root, \{ autoAlpha: 0, duration: 0\.02, ease: 'none' \}, exitAt\)/);
    expect(html).not.toMatch(/tl\.set\(root/);
    expect(html).toMatch(/startAt: -at/);
    const schema = JSON.parse(await read("../src/components/media/cutaway.schema.json"));
    expect(schema.type).toBe("cutaway");
    expect(Object.keys(schema.data)).toEqual(expect.arrayContaining(["src", "media", "at", "exit_at"]));
  });
});
