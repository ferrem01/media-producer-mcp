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
    expect(cf).toMatch(/cards = cards\.slice\(0, ring \? 10 : 7\);/);
  });

  it("the ring: one custom property tweened by GSAP drives the slots' CSS (a seek suppresses callbacks), the slot carries the card's size, the far cards dim and soften", async () => {
    const cf = await fs.readFile(comp("props", "card-fan"), "utf-8");
    expect(cf).toMatch(/var ring = data\.layout === 'ring';/);
    // No onUpdate/proxy drive: GSAP's seek() does not fire callbacks, so the capture would freeze the ring.
    expect(cf).not.toMatch(/onUpdate/);
    expect(cf).toMatch(/tl\.to\(stage, \{ '--cf-rot': \(startRot \+ turn\) \+ 'deg', duration: Math\.max\(0\.1, duration - at\), ease: 'none' \}, at\);/);
    expect(cf).toMatch(/rotateY\(calc\(var\(--cf-rot, 0deg\) \+ var\(--cf-a, 0deg\)\)\) translateZ\(var\(--cf-r, 300px\)\)/);
    expect(cf).toMatch(/scale\(calc\(0\.9 \+ 0\.11 \* \(1 \+ cos\(/);
    expect(cf).toMatch(/filter: blur\(calc\(1\.4px \* \(1 - cos\(/);
    // The assembler clamps every child to max-width 100%: a zero-width slot collapsed its card (measured: 0px wide).
    expect(cf).toMatch(/o\.slot\.style\.width = cardW \+ 'px'/);
    expect(cf).toMatch(/\.cfan-slot > \.cfan-card \{ left: 0; top: 0; margin: 0 !important; width: 100% !important; height: 100% !important; \}/);
    // speed (deg/s) is an alternative to turn; collapse shrinks the cards away.
    expect(cf).toMatch(/Number\(data\.speed\) \* Math\.max\(0, duration - at\)/);
    expect(cf).toMatch(/data\.collapse_at !== undefined/);
    const schema = JSON.parse(await read("src/components/props/card-fan.schema.json"));
    expect(schema.data.layout.enum).toEqual(["fan", "ring"]);
    for (const k of ["turn", "speed", "start", "radius", "tilt", "collapse_at"]) expect(schema.data[k].type).toBe("number");
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
