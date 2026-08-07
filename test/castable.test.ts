import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// A component the storyboard writer has never heard of cannot be cast, so it
// never appears in a generated film no matter how well it renders.
//
// st-chaos-collage shipped that way: certified, tested, correct on screen, and
// absent from the casting section of the storyboard prompt -- dead code from
// the pipeline's point of view, reachable only by hand-authoring a scene in
// Studio. Passing tests are what made it feel finished.
//
// The library IS the vocabulary. If a template exists, the writer has to know
// its name; anything deliberately unlisted has to be deleted, not left lying
// around looking available.

describe("every scene template is castable", () => {
  it("is named somewhere in the storyboard contract", async () => {
    const prompt = await read("../src/llm/storyboard-builder.ts");
    const dir = path.resolve(__dirname, "../src/components/scene-templates");
    const templates = (await fs.readdir(dir))
      .filter((f) => f.endsWith(".component.html"))
      .map((f) => f.replace(".component.html", ""));

    expect(templates.length).toBeGreaterThan(10);
    const unreachable = templates.filter((t) => !prompt.includes(t));
    expect(
      unreachable,
      `these templates exist but no storyboard can ask for them: ${unreachable.join(", ")}`,
    ).toEqual([]);
  });

  it("carries a content trigger for the problem beat, capped at one per film", async () => {
    // The collage is content-triggered, NOT grammar-triggered: a hype-cut film
    // about a launch has no mess to show, and an editorial film about a broken
    // workflow does. Putting it in a grammar section would have made every
    // film of that grammar open the same way.
    const prompt = await read("../src/llm/storyboard-builder.ts");
    const at = prompt.indexOf("st-chaos-collage");
    expect(at).toBeGreaterThan(0);
    const block = prompt.slice(at - 700, at + 700);
    expect(block).toMatch(/PROBLEM BEATS/);
    expect(block).toMatch(/ONE per film/);
    // And it must NOT have leaked into a grammar's law section.
    for (const section of ["### HYPE-CUT FILMS", "### TEMPO-CUT FILMS", "### EDITORIAL FILMS"]) {
      const start = prompt.indexOf(section);
      const end = prompt.indexOf("###", start + 4);
      expect(prompt.slice(start, end), `${section} must not mandate the collage`)
        .not.toMatch(/chaos-collage/);
    }
  });

  it("keeps one hand as the default and the cast as the single exception", async () => {
    const prompt = await read("../src/llm/storyboard-builder.ts");
    expect(prompt).toMatch(/One hand per film/);
    expect(prompt).toMatch(/THE CAST is the single exception/);
    expect(prompt).toMatch(/never threaded across scenes the way the hand is/);
  });

  it("themes the collage with the film's world like its peers", async () => {
    // Templates outside `themable` keep their own colours and become the
    // theme-whiplash the continuity rules exist to prevent.
    const prompt = await read("../src/llm/storyboard-builder.ts");
    const m = prompt.match(/const themable = new Set\(\[([^\]]+)\]\)/);
    expect(m, "themable set not found").toBeTruthy();
    expect(m![1]).toContain("st-chaos-collage");
  });
});
