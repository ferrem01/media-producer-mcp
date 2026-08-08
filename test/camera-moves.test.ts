import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeCameraMoves } from "../src/llm/storyboard-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// Pan is pure translation at whatever zoom the camera holds. On a WIDE camera
// the cover-clamp pins that translation to zero -- so an unzoomed pan is
// authored, accepted, rendered, and moves nothing. Studio surfaces the no-op
// at drag time; a storyboard has nobody to tell.
//
// The first canvas-tour film that could author pans at all authored two, to
// 25%,20% and 75%,20% -- real, distinct places -- and neither held a zoom.
// The camera did nothing, which is why the film still read as cuts on a shared
// backdrop rather than a tour. The grammar's contract says it outright
// ("never pan without holding a zoom") and the model wrote the travel while
// skipping the thing that makes travel possible.

describe("sanitizeCameraMoves", () => {
  it("gives an unzoomed pan somewhere to go", () => {
    const { moves, notes } = sanitizeCameraMoves(
      [{ at: 2, type: "pan", x: 25, y: 20, duration: 0.8 }], 6.3);

    expect(moves).toHaveLength(2);
    // The push lands first and holds; the authored travel follows, untouched.
    expect(moves[0]).toMatchObject({ at: 0, type: "zoom", scale: 1.35 });
    expect(moves[1]).toMatchObject({ type: "pan", x: 25, y: 20 });
    expect(notes.join(" ")).toMatch(/pan at 1x moves nothing/);
  });

  it("leaves a pan alone when the scene already holds a zoom", () => {
    const { moves, notes } = sanitizeCameraMoves([
      { at: 0, type: "zoom", anchor: "tpl.composer", scale: 1.6, duration: 1 },
      { at: 2, type: "pan", x: 70, y: 40, duration: 1.2 },
    ], 6);
    expect(moves).toHaveLength(2);
    expect(moves[0]).toMatchObject({ type: "zoom", anchor: "tpl.composer" });
    expect(notes.join(" ")).not.toMatch(/moves nothing/);
  });

  it("does not invent a zoom for a scene with no pan", () => {
    const { moves } = sanitizeCameraMoves([{ at: 1, type: "reset", duration: 0.8 }], 5);
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe("reset");
  });

  it("keeps blind rects out while letting pans through", () => {
    // A rectangle drawn over footage the model cannot see is the
    // invented-callout failure class; a pan's focal point sits on a
    // composition the storyboard authored, so it is not the same thing.
    const { moves } = sanitizeCameraMoves([
      { at: 1, type: "zoom", w: 40, h: 30, x: 10, y: 10 },   // no anchor -> dropped
      { at: 2, type: "pan", x: 80, y: 60 },                   // kept
      { at: 3, type: "orbit" },                               // unknown -> dropped
    ], 8);
    expect(moves.filter((m) => m.type === "pan")).toHaveLength(1);
    expect(moves.some((m) => (m as any).w !== undefined)).toBe(false);
    expect(moves.some((m) => m.type === "orbit" as any)).toBe(false);
  });

  it("clamps a pan's focal point into the frame and strips its scale", () => {
    // The engine treats "pan also zooming" as two effects fighting and ignores
    // scale on a pan, so carrying one through would be misleading data.
    const { moves } = sanitizeCameraMoves(
      [{ at: 99, type: "pan", x: 480, y: -20, scale: 2.2, duration: 9 }], 6);
    const pan = moves.find((m) => m.type === "pan")!;
    expect(pan.x).toBe(100);
    expect(pan.y).toBe(0);
    expect((pan as any).scale).toBeUndefined();
    expect(pan.at).toBeLessThanOrEqual(5.5);   // clamped into the scene
    expect(pan.duration).toBeLessThanOrEqual(1.6);
  });

  it("survives junk without throwing", () => {
    expect(sanitizeCameraMoves(undefined, 5).moves).toEqual([]);
    expect(sanitizeCameraMoves("nope", 5).moves).toEqual([]);
    expect(sanitizeCameraMoves([null, 7, {}], 5).moves).toEqual([]);
  });
});

describe("a saved storyboard keeps its camera", () => {
  it("carries camera_moves through storyboardToSaved", async () => {
    // Same omission as scene_template before it: the moves reached the BUILT
    // scenes but never the saved storyboard, so rebuilding an approved
    // storyboard silently dropped every travel the reviewer signed off on.
    const src = await read("../src/llm/pipeline.ts");
    const at = src.indexOf("function storyboardToSaved");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 1800)).toMatch(/camera_moves:\s*s\.camera_moves/);
  });

  it("declares camera_moves on StoryboardScene", async () => {
    const types = await read("../src/core/types.ts");
    const at = types.indexOf("export interface StoryboardScene");
    const body = types.slice(at, types.indexOf("\n}", at));
    expect(body).toMatch(/camera_moves\?:\s*CameraMove\[\]/);
  });
});
