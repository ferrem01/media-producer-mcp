import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSoundCues, normalizeSoundId, ensureSoundFiles, sceneSfxTracks, soundSummary } from "../src/core/scene-sfx.js";
import { applySpine, type Spine } from "../src/core/word-anchors.js";
import { planMarkdown } from "../src/core/film-plan.js";

// A sound effect is an EFFECT (a ding as a notification lands, a thud as a
// stamp hits): it lives on the scene beside the camera moves, lands on a
// word, re-times with the take, and is mixed at the scene's start + at.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("sound cues", () => {
  it("normalize whatever a writer hands over", () => {
    expect(normalizeSoundId("thud")).toBe("house-thud");
    expect(normalizeSoundId("house-ding")).toBe("house-ding");
    expect(normalizeSoundId("freesound-123")).toBe("freesound-123");
    expect(normalizeSoundId("kazoo")).toBeNull();
    const cues = normalizeSoundCues([
      { at: "@emails", id: "ding" },
      { at: 2.5, id: "THUD", volume: 3 },
      { at: "1.2", sound: "pop" },
      { at: { word: "third", edge: "end", offset: 0.1 }, id: "thud" },
      { at: 1, id: "not-a-sound" },
      null,
    ]);
    expect(cues.map((c) => c.id)).toEqual(["house-ding", "house-thud", "house-pop", "house-thud"]);
    expect(cues.find((c) => c.anchor?.word === "emails")).toBeTruthy();
    expect(cues.find((c) => c.id === "house-thud" && !c.anchor)!.volume).toBe(1);
    expect(cues.find((c) => c.id === "house-pop")!.at).toBe(1.2);
    expect(cues.find((c) => c.anchor?.word === "third")!.anchor).toEqual({ word: "third", edge: "end", offset: 0.1 });
  });

  it("land on their words through the same spine as every component time", () => {
    const spine: Spine = { source: "asserted", duration: 6, words: [
      { text: "Your", start: 4.0, end: 4.3 }, { text: "emails", start: 4.3, end: 4.9 }, { text: "live", start: 4.9, end: 5.2 },
      { text: "in", start: 5.2, end: 5.3 }, { text: "a", start: 5.3, end: 5.4 }, { text: "third.", start: 5.4, end: 5.9 } ] };
    const scene: any = { components: [], sfx: normalizeSoundCues([{ at: "@emails", id: "ding" }, { at: { word: "third", edge: "end" }, id: "thud" }]) };
    const r = applySpine(scene, spine);
    expect(r.resolved).toBe(2);
    expect(scene.sfx.map((c: any) => [c.id, c.at])).toEqual([["house-ding", 4.3], ["house-thud", 5.9]]);
    // A take re-times them: the same anchors against measured words.
    const measured: Spine = { ...spine, source: "measured", words: spine.words.map((w) => ({ ...w, start: w.start + 1, end: w.end + 1 })) };
    applySpine(scene, measured);
    expect(scene.sfx.map((c: any) => c.at)).toEqual([5.3, 6.9]);
  });

  it("get their files once, on the board and the built scenes", async () => {
    const project: any = {
      storyboard: { scenes: [{ sfx: normalizeSoundCues([{ at: 1, id: "ding" }, { at: 2, id: "ding" }, { at: 3, id: "thud" }]) }] },
      scenes: [{ duration_seconds: 5, sfx: normalizeSoundCues([{ at: 1, id: "ding" }]) }],
    };
    const calls: string[] = [];
    const n = await ensureSoundFiles(project, async (id) => { calls.push(id); return { url: `/assets/t/projects/p/assets/sfx-${id}.wav`, title: id, duration: 0.4 }; });
    expect(n).toBe(4);
    expect(calls.sort()).toEqual(["house-ding", "house-thud"]);
    expect(project.scenes[0].sfx[0].src).toBe("/assets/t/projects/p/assets/sfx-house-ding.wav");
  });

  it("mix at the scene's start plus their time, never past the scene", () => {
    const project: any = { scenes: [
      { duration_seconds: 4, sfx: [{ at: 1, id: "house-ding", src: "/assets/a/ding.wav" }] },
      { duration_seconds: 5, sfx: [{ at: 2.5, id: "house-thud", src: "/assets/a/thud.wav", volume: 0.5 }, { at: 9, id: "house-pop", src: "/assets/a/pop.wav" }, { at: 1, id: "house-tick" }] },
    ] };
    const starts = [0, 4.5];
    const tracks = sceneSfxTracks(project, (i) => starts[i], (s) => `/data${s}`);
    expect(tracks).toEqual([
      { path: "/data/assets/a/ding.wav", type: "sfx", volume: 0.8, startTime: 1 },
      { path: "/data/assets/a/thud.wav", type: "sfx", volume: 0.5, startTime: 7 },
      { path: "/data/assets/a/pop.wav", type: "sfx", volume: 0.8, startTime: 9.5 },
    ]);
  });

  it("show on the plan", () => {
    expect(soundSummary(normalizeSoundCues([{ at: 1, id: "ding" }, { at: 2, id: "ding" }, { at: 3, id: "ding" }, { at: 4, id: "thud" }]))).toBe("ding ×3, thud");
    const md = planMarkdown({ treatment: { filmGrammar: "creator-cut" }, storyboard: { scenes: [
      { label: "Gap", duration_seconds: 7, visual_notes: "Lock screen.", transparent_background: false, components: [{ type: "phone-lockscreen" }],
        sfx: normalizeSoundCues([{ at: 1, id: "ding" }, { at: 3, id: "thud" }]), voiceover_text: "Line." } ] } } as any);
    expect(md).toContain("\u{1F514} ding, thud");
  });

  it("are mixed by every render path", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/core/render.ts"), "utf-8");
    expect(src.match(/sceneSfxTracks\(/g)?.length).toBe(3);
    const q = await fs.readFile(path.resolve(__dirname, "../src/core/render-queue.ts"), "utf-8");
    expect(q).toMatch(/ensureSoundFiles\(project, \(id\) => resolveSfxChoice\(id, assets\)\)/);
  });
});

describe("the captions follow the lines", () => {
  it("recasts a lane whose words no longer match, keeps one that does, keeps its look", async () => {
    const { recaptionIfStale } = await import("../src/core/captions.js");
    const { assertedSpine } = await import("../src/core/word-anchors.js");
    const lines = "Sarah checks pricing.\nShe gets the right email.";
    const spine = assertedSpine(lines, 4);
    const scene: any = { voiceover_text: lines, components: [
      { id: "captions", type: "reel-caption-lane", data: { phrases: [{ text: "Sarah checks pricing *twice.*", start: 0.2, end: 2.9 }, { text: "*right* *then.*", start: 4.8, end: 6.1 }], scrim: "plate", max_font: 84 } },
    ] };
    expect(recaptionIfStale(scene, spine)).toBe(1);
    const lane = scene.components[0];
    const text = lane.data.phrases.map((p: any) => p.text.replace(/\*/g, "")).join(" ");
    expect(text).toBe("Sarah checks pricing. She gets the right email.");
    expect(lane.data.scrim).toBe("plate");
    expect(Object.keys(lane.anchors).length).toBe(lane.data.phrases.length * 2);
    // Matching words: left alone.
    expect(recaptionIfStale(scene, spine)).toBe(0);
    // A writer's plain-string lane is recast too (the signals ad's beat 1).
    const s2: any = { voiceover_text: "Your customers are sending signals.", components: [{ type: "reel-caption-lane", data: { phrases: ["Your customers are telling you exactly what they *need*."] } }] };
    expect(recaptionIfStale(s2, assertedSpine(s2.voiceover_text, 3))).toBe(1);
    expect(s2.components[0].data.phrases.map((p: any) => p.text.replace(/\*/g, "")).join(" ")).toBe("Your customers are sending signals.");
  });

  it("recasts a lane whose words match but whose star marks are broken", async () => {
    // proj_86591051 scene 3: the lane was cut from lines that still carried
    // the writer's stars -- "*Quotient *Analytics*.*" -- same words as the take.
    const { recaptionIfStale, laneMarksBroken } = await import("../src/core/captions.js");
    const { assertedSpine } = await import("../src/core/word-anchors.js");
    expect(laneMarksBroken({ data: { phrases: [{ text: "*Quotient *Analytics*.*" }] } })).toBe(true);
    expect(laneMarksBroken({ data: { phrases: [{ text: "tracks everything **automatically*,*" }] } })).toBe(true);
    expect(laneMarksBroken({ data: { phrases: [{ text: "somewhere else *entirely.*" }, { text: "*Quotient* Analytics," }] } })).toBe(false);
    const lines = "we built Quotient Analytics.";
    const scene: any = { voiceover_text: lines, emphasis: ["analytics"], components: [
      { id: "captions", type: "reel-caption-lane", data: { phrases: [{ text: "we built", start: 0.2, end: 1 }, { text: "*Quotient *Analytics*.*", start: 1, end: 3 }] } },
    ] };
    expect(recaptionIfStale(scene, assertedSpine(lines, 3))).toBe(1);
    expect(laneMarksBroken(scene.components[0])).toBe(false);
    expect(scene.components[0].data.phrases.map((p: any) => p.text).join(" ")).toMatch(/\*Analytics\.?\*/);
  });

  it("runs on every re-time and on an update-tool line edit", async () => {
    const ms = await fs.readFile(path.resolve(__dirname, "../src/core/measured-spine.ts"), "utf-8");
    expect(ms.match(/recaptionIfStale\((sb|built), spine\);/g)?.length).toBe(2);
    const server = await fs.readFile(path.resolve(__dirname, "../src/server.ts"), "utf-8");
    expect(server).toMatch(/const linesEdited = u\.voiceover_text !== undefined;/);
  });
});
