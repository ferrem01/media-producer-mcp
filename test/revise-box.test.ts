import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Marc asked Revise to make the lower third 50% larger and it answered that
// it could only change the component's data. A library component's size and
// place are its BOX (x/y/width/height): Revise now edits it too (as _box),
// and a component that places itself in the whole frame (the lower third)
// carries its size as data.scale.

describe("Revise edits a component's box", () => {
  it("takes _box alongside the data, keeps only x/y/width/height in px or %", async () => {
    const { sanitizeDataRevise, sanitizeBox } = await import("../src/llm/scene-revise.js");
    const prev = { name: "Marc", style: "clean-bar" };
    const r = sanitizeDataRevise(JSON.stringify({ name: "Marc", style: "clean-bar", _box: { y: "45%", height: "33%", z: 9, color: "red" } }), prev);
    expect(r.ok && r.box).toEqual({ y: "45%", height: "33%" });
    expect(r.ok && (r.data as any)._box).toBeUndefined();
    // A box-only answer is fine: the data stays as it was.
    const only = sanitizeDataRevise(JSON.stringify({ _box: { width: 540 } }), prev);
    expect(only.ok && only.box).toEqual({ width: 540 });
    expect(only.ok && only.data).toEqual({});
    expect(sanitizeBox({ x: "10vw", y: "bad", width: "50%" })).toEqual({ width: "50%" });
    expect(sanitizeBox("nope")).toBeUndefined();
  });

  it("the reviser is shown the box and the frame, and the box lands on the component", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src/llm/scene-revise.ts"), "utf8");
    expect(src).toMatch(/Current box: \$\{JSON\.stringify\(comp\.position \|\| \{\}\)\}/);
    expect(src).toMatch(/if \(sanitized\.box\) comp\.position = \{ \.\.\.\(comp\.position \|\| \{\}\), \.\.\.sanitized\.box \};/);
  });
});

describe("the lower third's size", () => {
  it("is data.scale, grown from its anchored corner", () => {
    const dir = path.join(__dirname, "..", "src/components/titles");
    const schema = JSON.parse(fs.readFileSync(path.join(dir, "lower-third.schema.json"), "utf8"));
    expect(schema.data.scale).toMatchObject({ type: "number", optional: true, default: 1 });
    const html = fs.readFileSync(path.join(dir, "lower-third.component.html"), "utf8");
    expect(html).toMatch(/gsap\.set\(anchor, \{ scale: scale, transformOrigin:/);
    expect(html).toMatch(/Math\.min\(3, Math\.max\(0\.5, Number\(data\.scale\)\)\)/);
    // Its margin from the box's edges is data too (0 = flush).
    expect(schema.data.margin).toMatchObject({ type: "number", optional: true, placeholder: "default: 6 side / 8 bottom" });
    expect(html).toMatch(/Math\.max\(0, Math\.min\(40, Number\(data\.margin\)\)\)/);
  });
});

describe("the box in Studio's Inspect", () => {
  it("every component shows x/y/w/h in % of the frame and saves a change through the component PATCH", () => {
    const s = fs.readFileSync(path.join(__dirname, "..", "src/preview-app/preview-app.ts"), "utf8");
    expect(s).toMatch(/function boxPercents\(pos, canvas\)/);
    expect(s).toMatch(/box \(% of frame\)/);
    expect(s).toMatch(/class="prop-input prop-box-in" data-box="/);
    expect(s).toMatch(/api\('PATCH', patchPath, \{ position: next \}\)/);
    // Saved in place: the component stays selected (Marc: it dropped to "Select a component").
    expect(s).toMatch(/function refreshCompositeInPlace\(atTime\)/);
    const commit = s.slice(s.indexOf("// The box: any of x/y/w/h"), s.indexOf("// Toggle switches (boolean)"));
    expect(commit).toMatch(/refreshCompositeInPlace\(\);/);
    expect(commit).not.toMatch(/startCompositePreview/);
  });
});
