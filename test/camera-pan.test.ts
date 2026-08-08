import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// The engine has always had a pan: CameraMove.type is "zoom"|"pan"|"rotate"|
// "reset", the assembler implements it as a peer-effect pure translation, and
// Studio authors one by hand. The STORYBOARD could not.
//
// Its schema described only zoom and reset, and its sanitizer silently dropped
// everything else -- so a pan the model authored vanished with no error and no
// log. That is what left canvas-tour without the travel that defines it ("each
// boundary is a camera TRAVEL to the next PLACE on the surface"), and why the
// grammar's contract told the writer to put the move in visual_notes as PROSE:
// a workaround for a closed gate, which nothing downstream reads.
//
// The ban on blind RECTS stays -- a rectangle drawn over footage the model
// cannot see is the invented-callout failure class. That reasoning never
// applied to a pan, whose focal point sits on a composition the storyboard
// itself authored.

describe("the storyboard can author the pan the engine already had", () => {
  it("keeps CameraMove.pan as an engine capability, not a new concept", async () => {
    const types = await read("../src/core/types.ts");
    expect(types).toMatch(/type:\s*"zoom"\s*\|\s*"pan"\s*\|\s*"rotate"\s*\|\s*"reset"/);
    const asm = await read("../src/core/scene-assembler.ts");
    expect(asm, "the assembler must still implement pan").toMatch(/m\.type === 'pan'/);
  });

  // The sanitizer's BEHAVIOUR -- pans surviving the filter, focal points
  // clamped, scale stripped, blind rects still banned -- is covered directly
  // in camera-moves.test.ts against the extracted sanitizeCameraMoves(). It
  // used to be asserted here by reading the inline source, which broke the
  // moment the logic was extracted: a source-shape assertion tests where the
  // code lives, not what it does.

  it("tells the model that pan exists", async () => {
    // The sanitizer accepting pans is useless if the schema never mentions
    // them -- the model only emits what it is told the shape allows.
    const src = await read("../src/llm/storyboard-builder.ts");
    const at = src.indexOf("camera_moves: {");
    expect(at).toBeGreaterThan(0);
    const desc = src.slice(at, at + 1400);
    expect(desc).toMatch(/type:'pan'/);
    expect(desc, "the model needs the units for x/y").toMatch(/percent of the canvas/);
    expect(desc, "a pan at 1x is a no-op and the model must know").toMatch(/1x/);
  });

  it("makes canvas-tour author the travel as data, not only as prose", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    const at = src.indexOf("THE CAMERA IS THE EDIT");
    expect(at).toBeGreaterThan(0);
    const law = src.slice(at, at + 1400);
    expect(law).toMatch(/camera_moves/);
    expect(law).toMatch(/type:"pan"/);
    // The prose is still wanted -- it feeds codegen -- but it is no longer the
    // only place the move exists.
    expect(law).toMatch(/visual_notes/);
  });
});
