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

// A film grammar is a RHYTHM and a visual system is a LOOK; they are chosen
// independently. The creative director's grammar menu had canvas-tour ending
// with "Pairs naturally with visual_system {world:'paper', motion:'calm'}",
// which quietly made one grammar mean one world -- and named that world's
// components (pen-script, typewriter) while it was at it.
//
// The director already has the right instruction in its own schema: choose
// paper "when the prompt asks for a paper/print/zine/letterpress feel,
// otherwise omit and the brand decides". The world should follow the USER'S
// PROMPT, never the grammar they happened to pick.
describe("the director's grammar menu does not prescribe a look", () => {
  const grammarMenu = async () => {
    const src = await read("../src/llm/creative-director.ts");
    const at = src.indexOf('- "launch-film"');
    expect(at, "grammar menu not found").toBeGreaterThan(0);
    // The menu runs to the JSON shape the director is asked to return.
    const end = src.indexOf('"filmGrammar":', at);
    return src.slice(at, end > 0 ? end : at + 12000);
  };

  it("names no visual_system value in any grammar description", async () => {
    const menu = await grammarMenu();
    expect(menu, "a grammar is prescribing a world/motion pairing")
      .not.toMatch(/[Pp]airs naturally with visual_system/);
    expect(menu, 'a grammar is naming a world value')
      .not.toMatch(/world:\s*"(paper|light|dark)"/);
  });

  it("names no world-specific component in any grammar description", async () => {
    // Same rule as the storyboard-side guard: the parts belong to the world.
    const menu = await grammarMenu();
    for (const type of ["pen-script", "sticker-prop", "prop-strike", "para-edit"]) {
      expect(menu, `the grammar menu names "${type}", which belongs to a world`)
        .not.toContain(type);
    }
  });

  it("still tells the director to pick the world from the PROMPT", async () => {
    // Removing the coupling must not leave the world unguided -- the schema
    // line is what makes it a prompt-driven choice rather than a coin flip.
    const src = await read("../src/llm/creative-director.ts");
    expect(src).toMatch(/choose it when the prompt asks for/);
    expect(src).toMatch(/Otherwise omit and the brand decides/);
  });
});
