import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_GRAMMARS } from "../src/llm/creative-director.js";
import { FRAMES, FRAME_SPECS, frameFromDims, frameIsTall } from "../src/core/types.js";
import { migrateProject } from "../src/persistence/project.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFile(path.join(HERE, rel), "utf8");

// SPEC-format-and-spine.md. A frame is the geometry of the output surface and
// nothing else; where a film SHIPS is not a grammar. social-reel was a format
// mis-filed as a grammar (its own contract said "the FORMAT carries the film")
// and it forbade voiceover_text, so a performed vertical ad could not be
// boarded (proj_ddca872c). It is deleted, not aliased.

describe("the FRAME axis", () => {
  it("registers the four geometric frames with canvas + platform safe bands", () => {
    expect(FRAMES).toEqual(["16x9", "9x16", "4x5", "1x1"]);
    expect(FRAME_SPECS["9x16"]).toMatchObject({ width: 1080, height: 1920, safe: { top: 0.12, bottom: 0.18 } });
    expect(FRAME_SPECS["4x5"]).toMatchObject({ width: 1080, height: 1350, safe: { top: 0, bottom: 0 } });
    expect(frameIsTall("9x16")).toBe(true);
    expect(frameIsTall("4x5")).toBe(true);
    expect(frameIsTall("16x9")).toBe(false);
  });

  it("maps arbitrary dimensions to the nearest frame (images get odd sizes)", () => {
    expect(frameFromDims(1920, 1080)).toBe("16x9");
    expect(frameFromDims(1200, 630)).toBe("16x9");
    expect(frameFromDims(1080, 1920)).toBe("9x16");
    expect(frameFromDims(1080, 1350)).toBe("4x5");
    expect(frameFromDims(1000, 1000)).toBe("1x1");
  });

  it("is a size and nothing else: carries no duration and no story shape", () => {
    for (const f of FRAMES) {
      const spec = FRAME_SPECS[f] as Record<string, unknown>;
      expect(Object.keys(spec).sort()).toEqual(["height", "homes", "safe", "width"]);
    }
  });

  it("is pinnable on generate and create, and the pipeline resizes the canvas from it", async () => {
    const server = await read("../src/server.ts");
    expect(server).toMatch(/frame: z\.enum\(\["16x9", "9x16", "4x5", "1x1"\]\)/);
    expect(server).not.toMatch(/preset: z\.enum/);
    const pipeline = await read("../src/llm/pipeline.ts");
    expect(pipeline).toMatch(/treatment\.frame && !\(opts\.canvasWidth && opts\.canvasHeight\)/);
  });

  it("the director infers it (video only) and echoes a pinned one", async () => {
    const cd = await read("../src/llm/creative-director.ts");
    expect(cd).toMatch(/"frame": "16x9 \| 9x16 \| 4x5 \| 1x1/);
    expect(cd).toMatch(/THE CALLER HAS FIXED THE FRAME/);
    expect(cd).toMatch(/export function resolveFrame/);
  });
});

describe("the tall-frame composition laws live on the FRAME, in the universal block", () => {
  it("fires for any grammar on a tall canvas and carries the measured learnings verbatim", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    const at = src.indexOf("### THIS FILM'S FRAME");
    expect(at).toBeGreaterThan(0);
    // It is a frame law, so it is gated on the canvas, not on a grammar.
    expect(src.slice(at - 80, at)).toMatch(/opts\.canvas\.height > opts\.canvas\.width/);
    // ...and it sits BEFORE the grammar sections, i.e. in the universal preamble.
    expect(at).toBeLessThan(src.indexOf('__g("tempo-cut")'));
    const block = src.slice(at, src.indexOf("### WHAT A FILM GRAMMAR IS"));
    for (const law of [
      "SIDE-BY-SIDE IS BANNED",
      "LANDSCAPE SURFACES GET CROPPED, NOT SHRUNK",
      "WHOLE DESKTOP WORKSPACES ARE BANNED",
      "proj_56358b25",      // the cited evidence must survive the move
      "SPEAKER: the person is the surface",
    ]) expect(block, law).toContain(law);
    // A frame carries no story shape: hook / escalation / loop seam belong to grammars.
    for (const notHere of ["HOOK", "LOOP SEAM", "escalation"]) expect(block).not.toContain(notHere);
  });
});

describe("social-reel is gone, not aliased", () => {
  it("is absent from the grammar registry, the tool enum, the director and the builder", async () => {
    expect(FILM_GRAMMARS).not.toContain("social-reel");
    for (const rel of ["../src/server.ts", "../src/llm/creative-director.ts", "../src/llm/storyboard-builder.ts", "../src/llm/scene-generator.ts", "../src/llm/grammar-prep.ts"]) {
      expect(await read(rel), rel).not.toContain("social-reel");
    }
  });
});

describe("speaker-screencast is split into screencast + speaker", () => {
  it("both grammars are registered; the compound name is gone", async () => {
    expect(FILM_GRAMMARS).toContain("screencast");
    expect(FILM_GRAMMARS).toContain("speaker");
    expect(FILM_GRAMMARS).not.toContain("speaker-screencast");
    for (const rel of ["../src/server.ts", "../src/llm/creative-director.ts", "../src/llm/storyboard-builder.ts", "../src/llm/pipeline.ts", "../src/llm/grammar-prep.ts", "../src/index.ts"]) {
      const s = await read(rel);
      // the scene-template COMPONENT keeps its name; the grammar value must not appear
      expect(s.replace(/st-speaker-screencast/g, ""), rel).not.toContain("speaker-screencast");
    }
  });

  it("speaker is choosable BEFORE a recording exists and requires voiceover_text", async () => {
    const cd = await read("../src/llm/creative-director.ts");
    expect(cd).not.toMatch(/do NOT choose/);
    expect(cd).toMatch(/a recording need not exist yet/i);
    const sb = await read("../src/llm/storyboard-builder.ts");
    const at = sb.indexOf('__g("speaker")');
    expect(at).toBeGreaterThan(0);
    const block = sb.slice(at, sb.indexOf("` : \"\"}", at));
    expect(block).toContain("A RECORDING NEED NOT EXIST YET");
    expect(block).toContain("EVERY scene carries voiceover_text");
  });

  it("a screencast_source routes to the screencast grammar; a bare speaker to speaker", async () => {
    const server = await read("../src/server.ts");
    expect(server).toMatch(/film_grammar: "screencast",\s*screencast_source/);
    const pipeline = await read("../src/llm/pipeline.ts");
    expect(pipeline).toMatch(/pipelineHasNarration\) \? "speaker" : "launch-film"/);
    const cd = await read("../src/llm/creative-director.ts");
    expect(cd).toMatch(/opts\.hasSpeaker \? "speaker" : "launch-film"/);
  });
});

describe("on-disk projects migrate forward on load", () => {
  it("canvas.preset -> canvas.frame; speaker-screencast -> screencast", () => {
    const p: any = migrateProject({
      canvas: { width: 1080, height: 1920, preset: "vertical", fps: 30, background: "#000" },
      treatment: { filmGrammar: "speaker-screencast" },
    });
    expect(p.canvas.frame).toBe("9x16");
    expect(p.canvas.preset).toBeUndefined();
    expect(p.treatment.filmGrammar).toBe("screencast");
  });
});
