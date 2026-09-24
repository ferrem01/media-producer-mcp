import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { extractAnchors } from "../src/core/word-anchors.js";

// shatter mode "crack" (cracks spread over the word and HOLD, nothing falls)
// and edge-lit-slab rim "rainbow" (a neon ring of every hue running round
// the pane) -- from the X posts Marc sent.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHATTER = path.resolve(__dirname, "../src/components/effects/shatter.component.html");
const SLAB = path.resolve(__dirname, "../src/components/threed/edge-lit-slab.component.html");

async function open(type: string, src: string, data: unknown, run: (page: Page) => Promise<void>) {
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 4, background: "#d81f2a",
      components: [{ id: "c", type, position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
    components: [{ type, source: await fs.readFile(src, "utf-8") }],
    brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 960, height: 540 } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fx6-"));
  const file = path.join(dir, "s.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
const seek = (page: Page, t: number) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);

describe("shatter crack mode", () => {
  it("cracks nothing before the impact, spreads after it, holds, and drops no shards", async () => {
    await open("shatter", SHATTER, { mode: "crack", at: 1, x: 40, y: 50 }, async (page) => {
      const drawn = () => page.evaluate(() => [...document.querySelectorAll(".sc-line")].map((p) => {
        const s = getComputedStyle(p); return 1 - parseFloat(s.strokeDashoffset) / parseFloat(s.strokeDasharray);
      }));
      await seek(page, 0.9);
      const before = await drawn();
      expect(before.length).toBeGreaterThan(15);
      expect(Math.max(...before)).toBeLessThan(0.01);
      await seek(page, 1.15);
      const mid = await drawn();
      expect(mid.some((d) => d > 0.2)).toBe(true);
      expect(mid.some((d) => d < 0.99)).toBe(true); // still racing out
      await seek(page, 3.8);
      expect(Math.min(...(await drawn()))).toBeGreaterThan(0.99); // all there, and they stay
      expect(await page.evaluate(() => document.querySelectorAll(".shard").length)).toBe(0);
    });
  }, 60000);

  it("breaks the same glass every load (seeded, no Math.random) and takes a word anchor", async () => {
    const src = await fs.readFile(SHATTER, "utf-8");
    expect(src).not.toMatch(/Math\.random/);
    expect(extractAnchors({ type: "shatter", data: { mode: "crack", at: "@feel" } } as any)).toBe(1);
    const shards: string[][] = [];
    for (let k = 0; k < 2; k++) {
      await open("shatter", SHATTER, {}, async (page) => {
        shards.push(await page.evaluate(() => [...document.querySelectorAll(".shard")].map((s) => (s as HTMLElement).style.clipPath)));
      });
    }
    expect(shards[0].length).toBeGreaterThan(20);
    expect(shards[1]).toEqual(shards[0]);
  }, 60000);
});

describe("edge-lit-slab rainbow rim", () => {
  it("runs a ring of every hue round the pane, on the timeline", async () => {
    await open("edge-lit-slab", SLAB, { rim: "rainbow" }, async (page) => {
      const angle = async (t: number) => { await seek(page, t); return page.evaluate(() => getComputedStyle(document.querySelector(".els-rainbow")!).getPropertyValue("--els-rb-a").trim()); };
      const a = await angle(1), b = await angle(2);
      expect(a).toMatch(/deg$/);
      expect(a).not.toBe(b);
      expect(await angle(1)).toBe(a); // seeks back
      expect(await page.evaluate(() => !!document.querySelector(".els-rainbow-bloom"))).toBe(true);
    });
    await open("edge-lit-slab", SLAB, {}, async (page) => {
      expect(await page.evaluate(() => document.querySelectorAll(".els-rainbow, .els-rainbow-bloom").length)).toBe(0);
    });
  }, 60000);
});
