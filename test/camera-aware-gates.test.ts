import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleScene } from "../src/core/scene-assembler.js";
import { measureLayout } from "../src/core/layout-metrics.js";
import { measureTextContrast } from "../src/core/text-contrast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// proj_65e702e3: a campaign board staged at x:0 width:100% -- fully on-canvas
// -- reported its title 67% past the left edge and its buttons entirely off
// the right, because the gates probed mid-zoom (camera_moves scaled the rig
// to 1.35) and blamed the layout for the cinematography. The auto-fix loop
// then shrank fonts that were never too big, twice per scene, four scenes.
// Zooms and pans are the product's vocabulary; the gates must know a camera
// from a bug.

const W = 1080, H = 1920;
const DUR = 3;
const AT_LAYOUT = [DUR * 0.45, DUR * 0.7, DUR * 0.9];
const AT_CONTRAST = [DUR * 0.35, DUR * 0.6, DUR * 0.85];

async function assembleReel(scene: Record<string, unknown>): Promise<string> {
  const src = await fs.readFile(
    path.resolve(__dirname, "../src/components/titles/kinetic-text.component.html"), "utf-8",
  );
  return assembleScene({
    scene: { id: "s1", label: "cam", duration_seconds: DUR, background: "#0f172a", ...scene },
    components: [{ type: "kinetic-text", source: src }],
    brandKit: { colors: { background: "#0f172a", text: "#ffffff", primary: "#a78bfa" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function writeScene(html: string): Promise<{ htmlPath: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "camgate-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, html);
  return { htmlPath, cleanup: () => fs.rm(dir, { recursive: true, force: true }).catch(() => {}) };
}

const TEXT = "Marketing teams of five just got replaced by one conversation.";
const GEOMETRY = new Set(["clipped_text", "off_canvas_content", "edge_bleed", "text_collision"]);

describe("camera-aware gates", () => {
  it("a held zoom does not read as clipped/off-canvas (the shot is the shot)", async () => {
    // Zoom 1.6x toward the left edge from t=0 and HOLD -- every probe lands
    // mid-zoom, with the right half of the layout legitimately off-frame.
    const html = await assembleReel({
      components: [{
        id: "kinetic-text", type: "kinetic-text",
        position: { x: "4%", y: "40%", width: "92%", height: "20%" },
        data: { text: TEXT, font_size: "7vw", color: "#ffffff" },
      }],
      camera_moves: [{ at: 0, type: "zoom", x: 15, y: 50, scale: 1.6, duration: 0.4 }],
    });
    const { htmlPath, cleanup } = await writeScene(html);
    try {
      const layout = await measureLayout({ htmlPath, width: W, height: H, atTimes: AT_LAYOUT });
      const geometry = layout.filter((d) => GEOMETRY.has(d.type));
      expect(geometry, JSON.stringify(geometry)).toEqual([]);

      const contrast = await measureTextContrast({ htmlPath, width: W, height: H, atTimes: AT_CONTRAST });
      const clipped = contrast.filter((d) => d.reason === "clipped");
      expect(clipped, JSON.stringify(clipped)).toEqual([]);
    } finally {
      await cleanup();
    }
  }, 300_000);

  it("without a camera the same gate still catches genuinely off-canvas content", async () => {
    // Control: no camera_moves (only the ambient Ken Burns, which must stay
    // below the detection thresholds) and a text block whose box genuinely
    // hangs past the right edge. If this stops flagging, the skip neutered
    // the gate instead of informing it.
    const html = await assembleReel({
      components: [{
        id: "kinetic-text", type: "kinetic-text",
        position: { x: "70%", y: "40%", width: "60%", height: "20%" },
        data: { text: TEXT, font_size: "7vw", color: "#ffffff" },
      }],
    });
    const { htmlPath, cleanup } = await writeScene(html);
    try {
      const layout = await measureLayout({ htmlPath, width: W, height: H, atTimes: AT_LAYOUT });
      const geometry = layout.filter((d) => GEOMETRY.has(d.type));
      expect(geometry.length, JSON.stringify(layout)).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  }, 300_000);
});
