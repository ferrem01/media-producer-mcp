import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleScene } from "../src/core/scene-assembler.js";
import { measureEmptyMoments, measureLayout } from "../src/core/layout-metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The measurement gates now run on component-assembled/template scenes (the
// path that shipped dead frames and invisible text in both grammar maiden
// flights). The risk in wiring them is FALSE POSITIVES: a type card with
// deliberate negative space must not read as a dead frame. This assembles a
// real st-statement and measures it exactly as the pipeline's authored
// branch does. Requires a browser (MP_CHROMIUM_PATH in constrained envs).

const W = 1920, H = 1080;
const DUR = 3;

async function assembleStatement(): Promise<string> {
  const src = await fs.readFile(
    path.resolve(__dirname, "../src/components/scene-templates/st-statement.component.html"), "utf-8",
  );
  return assembleScene({
    scene: {
      id: "s1", label: "Thesis", duration_seconds: DUR,
      components: [{
        id: "tpl_0", type: "st-statement",
        position: { x: "0%", y: "0%", width: "100%", height: "100%" },
        data: { text: "The registry is the *product*." },
      }],
    } as any,
    components: [{ type: "st-statement", source: src }],
    brandKit: { fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

describe("assembled-scene gates: no false positives on a real template", () => {
  it("st-statement (deliberate negative space) passes the empty-moment and layout gates", async () => {
    const html = await assembleStatement();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "asg-"));
    const htmlPath = path.join(dir, "scene.html");
    await fs.writeFile(htmlPath, html);
    try {
      // The same probe times the pipeline's authored branch uses.
      const earlyT = Math.min(Math.max(0.8, DUR * 0.15), DUR * 0.4);
      const empty = await measureEmptyMoments({
        htmlPath, width: W, height: H, atTimes: [earlyT, DUR * 0.5, DUR * 0.85],
      });
      expect(empty).toEqual([]);

      const layout = await measureLayout({
        htmlPath, width: W, height: H, atTimes: [DUR * 0.45, DUR * 0.7, DUR * 0.9],
      });
      expect(layout.filter((d) => d.type === "dead_frame")).toEqual([]);
      expect(layout.filter((d) => d.type === "text_collision")).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 180000);
});

describe("assembled-scene gates wiring (source guards)", () => {
  it("the authored/template branch runs all three gates and stamps quality", async () => {
    const p = await fs.readFile(path.resolve(__dirname, "../src/llm/pipeline.ts"), "utf-8");
    const branch = p.split("MEASUREMENT GATES for assembled scenes")[1]?.split("let currentScene = opts.scene")[0] || "";
    expect(branch).toContain("measureTextContrast");
    expect(branch).toContain("measureLayout");
    expect(branch).toContain("measureEmptyMoments");
    expect(branch).toContain("dead_entrance");
    expect(branch).toContain("unresolved_defects");
  });
});
