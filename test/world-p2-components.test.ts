import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseComponent } from "../src/core/component-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const comp = (cat: string, name: string) =>
  path.resolve(__dirname, "../src/components", cat, `${name}.component.html`);

// SPEC-world.md P2: the five component steals. Each must parse (template +
// script), carry a schema the catalog can advertise, and stay seek-safe
// (parametric clocks -- no rAF, no autoplay).
const P2 = [
  ["titles", "ghost-type"],
  ["titles", "headline-carousel"],
  ["props", "floating-pills"],
  ["code", "reasoning-stream"],
] as const;

describe("world P2 components", () => {
  for (const [cat, name] of P2) {
    it(`${name}: parses, schema matches, no wall-clock animation`, async () => {
      const src = await fs.readFile(comp(cat, name), "utf-8");
      const parsed = parseComponent(src);
      expect(parsed.template.length).toBeGreaterThan(10);
      expect(parsed.script).toContain("createTimeline");
      // Seek-safety: no requestAnimationFrame / setInterval clocks.
      expect(src).not.toMatch(/requestAnimationFrame|setInterval|performance\.now/);
      const schema = JSON.parse(
        await fs.readFile(comp(cat, name).replace(".component.html", ".schema.json"), "utf-8"),
      );
      expect(schema.type).toBe(name);
      expect(schema.description.length).toBeGreaterThan(40);
    });
  }

  it("dashboard-kpi gained the focus-fidelity mode", async () => {
    const src = await fs.readFile(comp("mockups", "dashboard-kpi"), "utf-8");
    expect(src).toContain("dk-focus");
    expect(src).toContain("data.fidelity === 'focus'");
    const schema = JSON.parse(await fs.readFile(comp("mockups", "dashboard-kpi").replace(".component.html", ".schema.json"), "utf-8"));
    expect(schema.data.fidelity).toBeTruthy();
  });

  it("the storyboard intent map advertises the new grammar", async () => {
    const sb = await fs.readFile(path.resolve(__dirname, "../src/llm/storyboard-builder.ts"), "utf-8");
    for (const name of ["ghost-type", "headline-carousel", "floating-pills", "reasoning-stream"]) {
      expect(sb, `storyboard prompt missing ${name}`).toContain(name);
    }
  });
});
