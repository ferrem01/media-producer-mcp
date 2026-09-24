import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { extractAnchors } from "../src/core/word-anchors.js";

// crt-screen: the old TV (after the Bundance spec ad's CRT "Over-"), for
// anything legacy -- the Old Chimp's "2008".

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src/components/effects/crt-screen.component.html");

describe("crt-screen", () => {
  it("powers on from a line, bends the glass, jolts on a glitch, collapses on power-off", async () => {
    const data = { text: "2008", phosphor: "amber", glitches: [1.5], power_off_at: 2.4 };
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 3, background: "#000",
        components: [{ id: "c", type: "crt-screen", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
      components: [{ type: "crt-screen", source: await fs.readFile(SRC, "utf-8") }],
      brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 1080, height: 1920 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crt-"));
    const file = path.join(dir, "s.html");
    await fs.writeFile(file, html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      const at = async (t: number) => {
        await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
        return page.evaluate(() => {
          const glass = document.querySelector(".crt-glass")!;
          const content = document.querySelector(".crt-content") as HTMLElement;
          const tube = document.querySelector(".crt-tube")!.getBoundingClientRect();
          const m = new DOMMatrix(getComputedStyle(glass).transform);
          const cm = new DOMMatrix(getComputedStyle(content).transform);
          return { sy: m.d, sx: m.a, dx: cm.e, filter: content.style.filter, text: content.textContent, tubeL: tube.left, tubeR: tube.right };
        });
      };
      const t0 = await at(0.15);
      expect(t0.sy).toBeLessThan(0.05); // a line
      const t1 = await at(1.0);
      expect(t1.sy).toBeCloseTo(1, 2);
      expect(t1.filter).toMatch(/^url\("?#crt/); // the curved glass
      expect(t1.text).toContain("2008");
      // A tall box FITS the set (its bezel is not cropped off the sides).
      expect(t1.tubeL).toBeGreaterThan(0);
      expect(t1.tubeR).toBeLessThan(1080);
      const g = await at(1.52);
      expect(Math.abs(g.dx)).toBeGreaterThan(5);
      const off = await at(2.69);
      expect(off.sx).toBeLessThan(0.3);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 60000);

  it("takes word anchors and stays deterministic", async () => {
    const c: any = { type: "crt-screen", data: { power_on_at: "@guy", power_off_at: "@retire", glitches: ["@hundred"] } };
    expect(extractAnchors(c)).toBe(3);
    expect(await fs.readFile(SRC, "utf-8")).not.toMatch(/Math\.random|onUpdate|repeat:\s*-1/);
  });
});
