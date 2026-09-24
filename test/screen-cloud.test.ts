import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { extractAnchors } from "../src/core/word-anchors.js";

// screen-cloud: product screens at depth, a real depth of field, focus pulls
// on the words (three.js). The entrance lives inside the one render pass:
// separate opacity tweens starting after 0 sort after the render tween and it
// drew their stale values (measured: only the hero screen showed).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src/components/threed/screen-cloud.component.html");

describe("screen-cloud", () => {
  it("draws every screen, not just the hero, and a focus pull moves the picture", async () => {
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 4, background: "#fff",
        components: [{ id: "c", type: "screen-cloud", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data: { focus: [{ at: 2, screen: 3 }] } }] } as any,
      components: [{ type: "screen-cloud", source: await fs.readFile(SRC, "utf-8") }],
      brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 960, height: 540 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    expect(html).toContain("THREE"); // the vendored three.js is inlined
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scl-"));
    const file = path.join(dir, "s.html");
    await fs.writeFile(file, html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      // Opaque canvas pixels in 3x3 regions: the hero fills the centre; the
      // cloud must reach the outer regions too.
      const shot = async (t: number) => {
        await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
        return page.evaluate(() => {
          const c = document.querySelector(".scl-canvas") as HTMLCanvasElement;
          const g = document.createElement("canvas"); g.width = 96; g.height = 54;
          const x = g.getContext("2d")!; x.drawImage(c, 0, 0, 96, 54);
          const d = x.getImageData(0, 0, 96, 54).data;
          const cells = new Array(9).fill(0);
          for (let y = 0; y < 54; y++) for (let xx = 0; xx < 96; xx++) if (d[(y * 96 + xx) * 4 + 3] > 128) cells[Math.floor(y / 18) * 3 + Math.floor(xx / 32)]++;
          return cells;
        });
      };
      const t0 = await shot(0);
      expect(t0.reduce((a, b) => a + b, 0)).toBeLessThan(20); // faded in from nothing
      const a = await shot(1.2);
      expect(a[4]).toBeGreaterThan(200); // the hero in the middle
      expect(a.filter((n, i) => i !== 4 && n > 40).length).toBeGreaterThanOrEqual(3); // the cloud around it
      const b = await shot(3.6);
      const diff = a.reduce((s, n, i) => s + Math.abs(n - b[i]), 0);
      expect(diff).toBeGreaterThan(300); // the pull reframed the shot
      expect(await shot(1.2)).toEqual(a); // seeks back exactly
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 60000);

  it("takes word anchors and stays deterministic", async () => {
    const c: any = { type: "screen-cloud", data: { enter_at: "@every", focus: [{ at: "@flows", screen: 2 }, { at: "@audience", screen: 1 }] } };
    expect(extractAnchors(c)).toBe(3);
    const src = await fs.readFile(SRC, "utf-8");
    expect(src).not.toMatch(/Math\.random|repeat:\s*-1/);
    // One proxy tween drives everything (the webgl-backdrop pattern).
    expect(src.match(/onUpdate/g)!.length).toBe(1);
  });
});
