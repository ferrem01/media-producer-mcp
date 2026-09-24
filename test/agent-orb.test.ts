import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { extractAnchors } from "../src/core/word-anchors.js";

// agent-orb: the AI agent as a recurring character -- a lit gradient sphere
// that flies an arcing path of word-timed stops and lands on each (three.js,
// one render pass, a transparent overlay).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src/components/threed/agent-orb.component.html");

describe("agent-orb", () => {
  it("pops in, lands on each stop, flies between them, and shrinks away", async () => {
    const data = { stops: [{ at: 0.3, x: 20, y: 30 }, { at: 2, x: 75, y: 70 }], exit_at: 3.2 };
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 4, background: "#fff",
        components: [{ id: "c", type: "agent-orb", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
      components: [{ type: "agent-orb", source: await fs.readFile(SRC, "utf-8") }],
      brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 960, height: 540 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orb-"));
    const file = path.join(dir, "s.html");
    await fs.writeFile(file, html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      // The centroid of the solid (alpha > 0.9) pixels: the sphere itself,
      // not its glow.
      const orbAt = async (t: number) => {
        await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
        return page.evaluate(() => {
          const c = document.querySelector(".orb-canvas") as HTMLCanvasElement;
          const g = document.createElement("canvas"); g.width = 192; g.height = 108;
          const x = g.getContext("2d")!; x.drawImage(c, 0, 0, 192, 108);
          const d = x.getImageData(0, 0, 192, 108).data;
          let n = 0, sx = 0, sy = 0;
          for (let y = 0; y < 108; y++) for (let xx = 0; xx < 192; xx++) if (d[(y * 192 + xx) * 4 + 3] > 230) { n++; sx += xx; sy += y; }
          return n ? { n, x: sx / n / 192 * 100, y: sy / n / 108 * 100 } : { n: 0, x: -1, y: -1 };
        });
      };
      expect((await orbAt(0.1)).n).toBe(0); // not in yet
      const a = await orbAt(1.0);
      expect(a.n).toBeGreaterThan(20);
      expect(Math.abs(a.x - 20)).toBeLessThan(4);
      expect(Math.abs(a.y - 30)).toBeLessThan(5);
      const mid = await orbAt(1.6); // in flight: off the straight line (it arcs)
      expect(mid.x).toBeGreaterThan(25); expect(mid.x).toBeLessThan(75);
      const b = await orbAt(2.8);
      expect(Math.abs(b.x - 75)).toBeLessThan(4);
      expect(Math.abs(b.y - 70)).toBeLessThan(5);
      expect((await orbAt(3.8)).n).toBe(0); // shrunk away
      expect(await orbAt(1.0)).toEqual(a); // seeks back exactly
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 60000);

  it("takes word anchors and stays deterministic", async () => {
    const c: any = { type: "agent-orb", data: { stops: [{ at: "@meet", x: 50, y: 50 }, { at: "@flows", x: 20, y: 70 }], exit_at: "@done" } };
    expect(extractAnchors(c)).toBe(3);
    const src = await fs.readFile(SRC, "utf-8");
    expect(src).not.toMatch(/Math\.random|repeat:\s*-1/);
    expect(src.match(/onUpdate/g)!.length).toBe(1); // one proxy tween drives every frame
  });
});
