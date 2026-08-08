import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveWorld } from "../src/llm/world.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

const kit = { colors: { background: "#ffffff", primary: "#393bf5", secondary: "#d48c34", accent: "#17171c" }, fonts: [] } as any;

// generate() documents visual_system as "omit to infer, pass to PIN". It was
// not pinned. deriveWorld only ever read treatment.visualSystem.world, so a
// caller's pin survived only if the creative director chose to echo it back --
// and when it did not, the axis silently vanished. Measured: a canvas-tour film
// generated with visual_system {world:"paper"} came back on a mesh-gradient
// (proj_ecb05e27), so it was typewriter and pen-script type sitting on a brand
// gradient. The film was never on paper at all.
//
// film_grammar has had the right precedence all along -- caller > director >
// inference, resolved once and read as data. This is the same rule for the
// look axis.

describe("a caller's visual_system pin outranks the treatment", () => {
  it("uses the caller's world when the director never echoed one", () => {
    const w = deriveWorld({
      brandKit: kit,
      treatment: { concept: "a clean product film", visualStyle: {} } as any,
      visualSystem: { world: "paper" },
      seedSource: "t:film",
    });
    expect(w.backdrop.component).toBe("paper-ground");
  });

  it("uses the caller's world even when the director committed a different one", () => {
    const w = deriveWorld({
      brandKit: kit,
      treatment: { concept: "x", visualSystem: { world: "dark" }, visualStyle: {} } as any,
      visualSystem: { world: "paper" },
      seedSource: "t:film",
    });
    expect(w.backdrop.component).toBe("paper-ground");
  });

  it("still honours the director when the caller pinned nothing", () => {
    const w = deriveWorld({
      brandKit: kit,
      treatment: { concept: "x", visualSystem: { world: "paper" }, visualStyle: {} } as any,
      seedSource: "t:film",
    });
    expect(w.backdrop.component).toBe("paper-ground");
  });

  it("falls back to inference when nobody pinned anything", () => {
    const w = deriveWorld({
      brandKit: kit,
      treatment: { concept: "a clean product film", visualStyle: {} } as any,
      seedSource: "t:film",
    });
    expect(w.backdrop.component).not.toBe("paper-ground");
  });

  it("is actually wired at the call site", async () => {
    // The precedence is worthless if the pipeline never hands the pin over.
    const src = await read("../src/llm/pipeline.ts");
    const at = src.indexOf("const world = deriveWorld({");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 400)).toMatch(/visualSystem: opts\.visual_system/);
  });
});

// The universal scene-budget line said "3-4 scenes ... a HARD budget" and named
// only tempo-cut and hype-cut as exceptions. Every other grammar was told 3-4
// there and then asked for 5-10 by its own contract twenty lines below, and the
// louder universal rule won: canvas-tour shipped intro / 15s middle / outro --
// three scenes with five beats crammed into the middle, the exact opposite of
// a journey across places. The model was obeying instructions; the
// instructions contradicted each other.

describe("the active grammar sets the scene budget", () => {
  it("gives every grammar with a stated shape its own band", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    const at = src.indexOf("const GRAMMAR_SCENE_BAND");
    expect(at).toBeGreaterThan(0);
    const table = src.slice(at, src.indexOf("};", at));
    for (const g of ["tempo-cut", "hype-cut", "editorial", "social-reel", "data-story", "canvas-tour"]) {
      expect(table, `${g} states a scene count in its contract but has no band`).toContain(`"${g}"`);
    }
    // launch-film IS the 3-4 default and speaker-screencast's length comes from
    // the recording -- neither wants a band, and adding one would be wrong.
    expect(table).not.toContain('"launch-film"');
    expect(table).not.toContain('"speaker-screencast"');
  });

  it("no longer hardcodes the two-exception list", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    expect(src, "the stale exception clause named only tempo-cut and hype-cut")
      .not.toMatch(/EXCEPTION: a TEMPO-CUT film/);
  });

  it("stops telling a banded grammar to fold its places into beats", async () => {
    // The live nudge fired the moment scene 3 landed. On a grammar that wants
    // 5-9 places that is precisely backwards, so it now encourages MORE.
    const src = await read("../src/llm/storyboard-builder.ts");
    const at = src.indexOf("var budgetNote =");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, at + 800);
    expect(body).toMatch(/!band/);
    expect(body).toMatch(/this grammar wants more/);
  });

  it("clamps a director scene count that fights the grammar", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    expect(src).toMatch(/director asked for \$\{opts\.sceneCount\} scenes/);
    expect(src).toMatch(/Math\.max\(band\.min, Math\.min\(band\.max, opts\.sceneCount\)\)/);
  });
});
