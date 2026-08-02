import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleScene } from "../src/core/scene-assembler.js";
import { measureTextContrast } from "../src/core/text-contrast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// #45. The annotation carries no plate of its own -- theme:"dark" only flips
// its INK for use on dark grounds. proj_b75ca862's storyboard set that flag
// on a LIGHT film: near-white ink over a near-white mesh, 1.09:1, and the
// authored color:"#17171c" (which would have been perfect) was ignored.
// The ground is measurable, so the component measures it: the theme flag is
// a hint that loses to the actual page whenever the page can be read.

const W = 1920, H = 1080;
const DUR = 3;
const AT = [DUR * 0.35, DUR * 0.6, DUR * 0.85];

async function assembleAnno(background: string, data: Record<string, unknown>): Promise<string> {
  const src = await fs.readFile(
    path.resolve(__dirname, "../src/components/titles/annotation.component.html"), "utf-8",
  );
  return assembleScene({
    scene: {
      id: "s1", label: "anno", duration_seconds: DUR, background,
      components: [{
        id: "a0", type: "annotation",
        position: { x: "8%", y: "35%", width: "84%", height: "30%" },
        data,
      }],
    } as any,
    components: [{ type: "annotation", source: src }],
    brandKit: { colors: { background, text: background === "#ffffff" ? "#17171c" : "#ffffff" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function contrastOf(html: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gink-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, html);
  try {
    return await measureTextContrast({ htmlPath, width: W, height: H, atTimes: AT });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("ground-measured ink (annotation)", () => {
  it("theme:'dark' on a LIGHT page is overruled by the measured ground", async () => {
    // The exact authored data from proj_b75ca862 scene_001.
    const defects = await contrastOf(await assembleAnno("#ffffff", {
      text: "One brief. That's the whole ask.",
      theme: "dark", color: "#17171c", align: "left", size: "display",
      lines: [{ text: "One brief. That's the whole ask.", at: 1.2 }],
    }));
    const bad = defects.filter((d) => /whole ask/.test(d.text));
    expect(bad, JSON.stringify(bad)).toEqual([]);
  }, 300_000);

  it("theme:'light' implied on a DARK page flips to light ink the same way", async () => {
    const defects = await contrastOf(await assembleAnno("#0f172a", {
      text: "Numbers carry the argument.",
      color: "#17171c", // authored dark ink on a dark film: unreadable, must be ignored
      lines: [{ text: "Numbers carry the argument.", at: 0.8 }],
    }));
    const bad = defects.filter((d) => /argument/.test(d.text));
    expect(bad, JSON.stringify(bad)).toEqual([]);
  }, 300_000);

  it("an authored ink that PASSES on the measured ground is honored", async () => {
    // A brand navy on a white page clears 4.5:1 -- the author's choice wins.
    const html = await assembleAnno("#ffffff", {
      text: "Ship the launch.",
      color: "#1e3a8a",
      lines: [{ text: "Ship the launch.", at: 0.5 }],
    });
    // Behavioral proof is the contrast run (no defect); the honored ink is
    // asserted structurally: the override only ever applies via --anno-ink.
    const defects = await contrastOf(html);
    expect(defects.filter((d) => /Ship the launch/.test(d.text))).toEqual([]);
    const src = await fs.readFile(
      path.resolve(__dirname, "../src/components/titles/annotation.component.html"), "utf-8",
    );
    expect(src).toMatch(/setProperty\('--anno-ink', data\.color\)/);
    expect(src).toMatch(/r >= 4\.5/);
  }, 300_000);
});
