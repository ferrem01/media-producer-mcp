import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleComposite } from "../src/core/composite-assembler.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const gsapDir = path.resolve(here, "../vendor/gsap");

// A TIMED PLATE UNDER THE PROOF (Oct 6, Marc's churn film): a light
// gradient-background at z 30 covers the speaker while the proof (z 36) sits
// on it (Studio draws the speaker on its own layer behind the composite). In the Studio composite the camera rig PARKED every backdrop
// outside itself, and the rig is a stacking context at z 2 -- so the plate
// was weighed against 2, not 36, and painted over the calendar and charts.
// Studio showed a blank pale frame; the thumbnails (single-scene path, the
// plate inside the rig) were fine. A backdrop above the rig's z rides the rig.

describe("a plate layered among the content keeps its place in the Studio composite", () => {
  it("the proof paints over the plate in a scene with camera moves", async () => {
    const src = (p: string) => fs.readFile(path.resolve(here, "../src/components", p), "utf8");
    const stat = { type: "stat-card", data: { value: 42, suffix: "%", label: "Reply rate" } };
    const html = await assembleComposite({
      scenes: [{
        scene: {
          id: "s1", label: "signal", duration_seconds: 4, transparent_background: true,
          camera_moves: [{ at: 0.5, type: "zoom", x: 50, y: 50, scale: 1.1, duration: 0.5 }],
          components: [
            { id: "plate", type: "gradient-background", position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 30,
              data: { colors: ["#f6f7fb", "#ffffff"] } },
            { id: "proof", ...stat, position: { x: "25%", y: "25%", width: "50%", height: "50%" }, z_index: 36 },
          ],
        },
        components: [
          { type: "stat-card", source: await src("titles/stat-card.component.html") },
          { type: "gradient-background", source: await src("effects/gradient-background.component.html") },
        ],
      }],
      brandKit: { colors: { background: "#ffffff", text: "#111111" }, fonts: [] } as any,
      canvas: { width: 540, height: 960 } as any,
      gsapDir,
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "plate-z-"));
    const file = path.join(dir, "c.html");
    await fs.writeFile(file, html);
    const browser = await chromium.launch({ ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30_000 });
      await page.evaluate(() => { (window as any).__MP_TIMELINE.seek(2, false); });
      const topAt = (x: number, y: number) => page.evaluate(([px, py]) =>
        (document.elementFromPoint(px, py)?.closest("[data-cid]") as HTMLElement | null)?.getAttribute("data-cid") || "", [x, y]);
      const box = await page.evaluate(() => {
        const r = (document.querySelector('[data-cid$="__proof"]') as HTMLElement).getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      const hit = { centre: await topAt(box.x, box.y), corner: await topAt(10, 10) };
      expect(hit.centre, "the plate covers the proof").toMatch(/proof$/);
      expect(hit.corner, "the plate itself still shows around the proof").toMatch(/plate$/);
    } finally {
      await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 120_000);
});
