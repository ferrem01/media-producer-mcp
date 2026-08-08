import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enforceFilmDirection } from "../src/llm/storyboard-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = () => fs.readFile(path.resolve(__dirname, "../src/llm/storyboard-builder.ts"), "utf-8");

// A canvas-tour film came back as paper and a line of text per scene, with one
// scene carrying ONLY the backdrop -- 6.3s of blank page. Its visual_notes
// meanwhile described a letterpress browser sliver, a phone frame swiping a
// carousel, an envelope flap with a wax seal, and a week-grid filling cell by
// cell. None of it was cast.
//
// The library was not the problem. The paper world has a real vocabulary --
// pen-script, typewriter print/cli, para-edit, sticker-prop (stamp/ring/pill/
// image), prop-strike -- and an earlier storyboard used it well, stamping
// "BLOG POST" and "MON -- BLOG" onto the sheet.
//
// The contract was. canvas-tour's ONLY component instruction was "the surface
// component is the first entry of every scene" -- it named the vocabulary for
// TYPE and never for CONTENT, while tempo-cut and hype-cut carry a long
// casting paragraph naming ~15 product mocks. Same shape as the
// OBJECTS-NOT-STRINGS gap: a grammar that cannot say what to cast gets prose.

async function canvasTourLaws(): Promise<string> {
  const src = await read();
  const at = src.indexOf('__g("canvas-tour")');
  expect(at, "canvas-tour section not found").toBeGreaterThan(0);
  const end = src.indexOf('__g("speaker-screencast")', at);
  return src.slice(at, end > 0 ? end : at + 6000);
}

describe("canvas-tour can say what to cast", () => {
  it("names the paper vocabulary it actually has", async () => {
    const laws = await canvasTourLaws();
    for (const type of ["pen-script", "typewriter", "para-edit", "sticker-prop", "prop-strike"]) {
      expect(laws, `${type} is in the library but the grammar never names it`).toContain(type);
    }
    // The stamp is the letterpress landing -- the film's recurring physical verb.
    expect(laws).toMatch(/kind:"stamp"/);
  });

  it("says the surface alone is not a scene", async () => {
    const laws = await canvasTourLaws();
    expect(laws).toMatch(/THE SURFACE IS NOT THE SCENE/);
    expect(laws, "prose describing a proof must not count as casting it")
      .toMatch(/visual_notes does not put it on the page/);
  });

  it("keeps product-UI mocks out of the paper world", async () => {
    // A dark app panel on a cream sheet is the theme whiplash the continuity
    // rules exist to prevent -- and it is what the model reaches for, because
    // the universal casting paragraph names those mocks at length.
    const laws = await canvasTourLaws();
    expect(laws).toMatch(/quotient-\*/);
    expect(laws).toMatch(/browser-frame/);
    expect(laws).toMatch(/theme whiplash/);
  });

  it("reports a scene that carries only its backdrop", () => {
    const scene = (o: any) => ({ label: "s", duration_seconds: 6.3, purpose: "", visual_notes: "", components: [], ...o });
    const warn = console.warn;
    const lines: string[] = [];
    console.warn = (m: any) => { lines.push(String(m)); };
    try {
      enforceFilmDirection([
        scene({ label: "Scene 1 - The Brief", components: [{ type: "paper-ground", data: {} }, { type: "pen-script", data: { text: "go" } }] }),
        scene({ label: "Scene 5 - The Week Fills In", components: [{ type: "paper-ground", data: {} }] }),
      ] as any);
    } finally {
      console.warn = warn;
    }
    const dead = lines.filter((l) => /DEAD FRAME WARNING/.test(l));
    expect(dead.length, lines.join("\n")).toBe(1);
    expect(dead[0]).toContain("The Week Fills In");
    expect(dead[0], "the scene that DID cast something must not be flagged").not.toContain("The Brief");
  });

  it("does not flag a templated or footage-led scene", () => {
    const warn = console.warn;
    const lines: string[] = [];
    console.warn = (m: any) => { lines.push(String(m)); };
    try {
      enforceFilmDirection([
        // A template scene legitimately has components: [] -- the template IS
        // the content, and flagging it would make the warning noise.
        { label: "T", duration_seconds: 4, purpose: "", visual_notes: "", components: [],
          scene_template: { type: "st-logo-close", data: { tagline: "x" } } },
        // Footage carries its own picture.
        { label: "B", duration_seconds: 5, purpose: "", visual_notes: "", broll_query: "city at dusk",
          components: [{ type: "mesh-gradient", data: {} }] },
      ] as any);
    } finally {
      console.warn = warn;
    }
    expect(lines.filter((l) => /DEAD FRAME WARNING/.test(l))).toEqual([]);
  });
});
