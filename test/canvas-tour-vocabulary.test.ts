import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enforceFilmDirection } from "../src/llm/storyboard-builder.js";
import { worldPromptBlock } from "../src/llm/world.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = () => fs.readFile(path.resolve(__dirname, "../src/llm/storyboard-builder.ts"), "utf-8");

// A canvas-tour film came back as paper and a line of text per scene, with one
// scene carrying ONLY the backdrop -- 6.3s of blank page. Its visual_notes
// meanwhile described a letterpress browser sliver, a phone frame swiping a
// carousel, an envelope flap with a wax seal, and a week-grid filling cell by
// cell. None of it was cast.
//
// The library was not the problem: the paper world has a real vocabulary and an
// earlier storyboard used it well. What was missing was anything NAMING that
// vocabulary -- the catalog is not filtered per film, so all ~177 components
// reach every call and the long universal casting paragraph sells the screen
// mocks hard. On a paper world that pull is actively wrong.
//
// WHERE the naming lives is the load-bearing decision. world and film_grammar
// are independent axes: a paper film can be tempo-cut or editorial, and a
// canvas-tour can run on a dark or light world. So the MATERIALS belong to the
// world, and the grammar only says that every place must carry something.
// Putting the materials in the grammar would bake a LOOK into a RHYTHM and be
// wrong every time that grammar ran on a different world.

const paperWorld = {
  backdrop: { component: "paper-ground" as const, seed: 1, palette: ["#393bf5", "#d48c34"] },
  theme: "light" as const, chapter_slots: 1,
  surface: { tone: "#f2efe7", intensity: 0.4 },
};
const darkWorld = {
  backdrop: { component: "webgl-backdrop" as const, seed: 1, palette: ["#393bf5", "#d48c34"] },
  theme: "dark" as const, chapter_slots: 1,
};

async function canvasTourLaws(): Promise<string> {
  const src = await read();
  const at = src.indexOf('__g("canvas-tour")');
  expect(at, "canvas-tour section not found").toBeGreaterThan(0);
  const end = src.indexOf('__g("speaker-screencast")', at);
  return src.slice(at, end > 0 ? end : at + 6000);
}

describe("a world's materials belong to the world, not to a grammar", () => {
  it("names the paper materials on the paper world", () => {
    const block = worldPromptBlock(paperWorld);
    for (const type of ["pen-script", "typewriter", "para-edit", "sticker-prop", "prop-strike"]) {
      expect(block, `${type} is in the library but the paper world never names it`).toContain(type);
    }
    expect(block).toMatch(/kind:"stamp"/);
  });

  it("keeps product-UI mocks off the paper", () => {
    // A dark app panel on a cream sheet is the theme whiplash the continuity
    // rules exist to prevent -- and it is what the model reaches for, because
    // the universal casting paragraph names those mocks at length.
    const block = worldPromptBlock(paperWorld);
    expect(block).toMatch(/quotient-\*/);
    expect(block).toMatch(/browser-frame/);
    expect(block).toMatch(/theme whiplash/);
  });

  it("says none of that on a world made of something else", () => {
    // The materials are the PAPER world's, not every world's. A dark film
    // should hear nothing about letterpress stamps or struck headlines.
    const block = worldPromptBlock(darkWorld);
    expect(block).not.toMatch(/pen-script|sticker-prop|prop-strike|letterpress/);
    // ...while the world block still does its original job.
    expect(block).toMatch(/Theme: DARK/);
    expect(block).toMatch(/CHAPTER CARD/);
  });

  it("leaves canvas-tour saying only that a place must carry something", async () => {
    const laws = await canvasTourLaws();
    expect(laws).toMatch(/THE SURFACE IS NOT THE SCENE/);
    expect(laws, "prose describing a thing must not count as casting it")
      .toMatch(/does not put it on the surface/);
    // It must point AT the world for the materials rather than listing them.
    expect(laws).toMatch(/THE WORLD's materials/);

    // The CONTENT vocabulary -- props, stamps, and which mocks are banned --
    // is the world's business and must not reappear here. (The separate
    // TYPE IS PERFORMED law does still name the performing-type components;
    // that one is a genuine rhythm rule -- type arrives by being MADE -- and
    // predates this split. Worth revisiting, deliberately, not by accident.)
    expect(laws, "prop vocabulary leaked back into the grammar")
      .not.toMatch(/sticker-prop|prop-strike/);
    expect(laws, "which mocks a world rejects is the world's call")
      .not.toMatch(/quotient-\*|theme whiplash/);
  });
});

describe("a scene that carries only its backdrop is reported", () => {
  const capture = (scenes: any[]) => {
    const warn = console.warn;
    const lines: string[] = [];
    console.warn = (m: any) => { lines.push(String(m)); };
    try { enforceFilmDirection(scenes as any); } finally { console.warn = warn; }
    return lines.filter((l) => /DEAD FRAME WARNING/.test(l));
  };
  const scene = (o: any) => ({ label: "s", duration_seconds: 6.3, purpose: "", visual_notes: "", components: [], ...o });

  it("flags the empty place and not the one that cast something", () => {
    const dead = capture([
      scene({ label: "Scene 1 - The Brief", components: [{ type: "paper-ground", data: {} }, { type: "pen-script", data: { text: "go" } }] }),
      scene({ label: "Scene 5 - The Week Fills In", components: [{ type: "paper-ground", data: {} }] }),
    ]);
    expect(dead.length).toBe(1);
    expect(dead[0]).toContain("The Week Fills In");
  });

  it("stays quiet on templated and footage-led scenes", () => {
    expect(capture([
      // A template scene legitimately has components: [] -- the template IS the
      // content, and flagging it would make the warning noise.
      { label: "T", duration_seconds: 4, purpose: "", visual_notes: "", components: [],
        scene_template: { type: "st-logo-close", data: { tagline: "x" } } },
      // Footage carries its own picture.
      { label: "B", duration_seconds: 5, purpose: "", visual_notes: "", broll_query: "city at dusk",
        components: [{ type: "mesh-gradient", data: {} }] },
    ])).toEqual([]);
  });
});
