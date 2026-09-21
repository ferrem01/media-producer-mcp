import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseComponent } from "../src/core/component-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const comp = (cat: string, name: string) => path.resolve(__dirname, "../src/components", cat, `${name}.component.html`);
const read = (rel: string) => fs.readFile(path.resolve(__dirname, "..", rel), "utf-8");

// From the naano launch film (AMENDMENTS 2026-09-21): motion blur on the
// travelling word, a checklist whose switches flip on word anchors, a fan
// of cards in 3D, and the recipe that cut them together.
describe("the naano takeaways", () => {
  for (const [cat, name, key] of [["props", "checklist-toggles", "items"], ["props", "card-fan", "cards"]] as const) {
    it(`${name}: parses, sizes to its box, stays seek-safe and deterministic, and the catalog advertises it`, async () => {
      const src = await fs.readFile(comp(cat, name), "utf-8");
      const parsed = parseComponent(src);
      expect(parsed.template.length).toBeGreaterThan(10);
      expect(parsed.script).toContain("createTimeline");
      expect(src).not.toMatch(/requestAnimationFrame|setInterval|performance\.now|Math\.random/);
      expect(src).toContain("host.clientWidth");
      const schema = JSON.parse(await fs.readFile(comp(cat, name).replace(".component.html", ".schema.json"), "utf-8"));
      expect(schema.type).toBe(name);
      expect(schema.category).toBe("props");
      expect(schema.data[key].type).toBe("array");
      expect(schema.data[key].required).toBe(true);
      expect(schema.data.theme.enum).toEqual(["light", "dark"]);
      expect(schema.data.at.type).toBe("number");
    });
  }

  it("the checklist flips each switch at its row's own anchor; the fan turns and can focus a card", async () => {
    const ck = await fs.readFile(comp("props", "checklist-toggles"), "utf-8");
    expect(ck).toMatch(/o\.it\.at !== undefined/);
    expect(ck).toMatch(/tl\.to\(o\.knob, \{ x: Math\.max\(8, travel\)/);
    expect(ck).toMatch(/if \(o\.it\.on === false\) return;/);
    const cf = await fs.readFile(comp("props", "card-fan"), "utf-8");
    expect(cf).toMatch(/perspective: 1400px/);
    expect(cf).toMatch(/tl\.to\(stage, \{ rotationY: turn \* 0\.6/);
    expect(cf).toMatch(/data\.focus !== undefined/);
    expect(cf).toMatch(/cards = cards\.slice\(0, 7\);/);
  });

  it("kinetic type streaks while it travels and lands sharp; data.blur=false turns it off", async () => {
    const kt = await fs.readFile(comp("titles", "kinetic-text"), "utf-8");
    expect(kt).toMatch(/var mbOn = data\.blur !== false/);
    expect(kt).toMatch(/feGaussianBlur/);
    expect(kt).toMatch(/attr: \{ stdDeviation: '0 0' \}, duration: 0\.8/);
    expect(kt).toMatch(/tl\.set\(o\.span, \{ filter: 'none' \}, when \+ 0\.8\);/);
    expect(kt).toMatch(/if \(data\.blur !== false\) tl\.to\(w, \{ filter: 'blur\(9px\)'/);
    const schema = JSON.parse(await read("src/components/titles/kinetic-text.schema.json"));
    expect(schema.data.blur).toMatchObject({ type: "boolean", default: true });
  });

  it("the props size themselves: no phone zoom on top", async () => {
    const gen = await read("src/llm/scene-generator.ts");
    expect(gen).toMatch(/PHONE_ZOOM_EXCLUDE = \[.*"checklist-toggles", "card-fan", "video", "image"\]/);
  });
});
