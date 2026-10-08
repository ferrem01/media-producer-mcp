import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// "Should they be showing the logos? ... just the logo is fine" (Marc,
// 2026-10-08): tool-storm style logo -- the real logo on a white tile.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = () => fs.readFile(path.resolve(__dirname, "../src/components/props/tool-storm.component.html"), "utf-8");
const BRAND = { colors: { primary: "#393bf5", secondary: "#d48c34", accent: "#17171c", background: "#ffffff", surface: "#dfdfed", text: "#17171c", text_muted: "#8f8f9f" }, fonts: [] };
const SHOTS = process.env.MP_TEST_SHOTS;

async function open(data: unknown, position: unknown, run: (seek: (t: number) => Promise<void>, page: import("playwright").Page) => Promise<void>) {
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 6, background: "#8a7f74",
      components: [{ id: "p", type: "tool-storm", position, data }] } as any,
    components: [{ type: "tool-storm", source: await SRC() }],
    brandKit: BRAND as any,
    canvas: { width: 1080, height: 1920 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ppl-"));
  await fs.writeFile(path.join(dir, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(dir, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(async (t) => {
      await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `tool-storm-${t}.png`) });
    }, page);
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

describe("tool-storm style logo", () => {
  it("each logo arrives on a square white tile, one at a time, no window and no name", async () => {
    const logos = ["a.png", "b.png", "c.png", "d.png", "e.png"];
    await open({ mode: "fly", style: "logo", logos, at: 1, duration: 2.5, card_width: 30 }, { x: "4%", y: "50%", width: "92%", height: "27%" }, async (seek, page) => {
      const tiles = () => page.evaluate(() => [...document.querySelectorAll(".tsm-slot")].map((e) => { const r = e.getBoundingClientRect(); const t = e.querySelector(".tsm-tile") as HTMLElement | null; return { o: Number(getComputedStyle(e).opacity), w: r.width, h: r.height, bg: t ? t.style.backgroundImage : "", bar: !!e.querySelector(".tsm-bar") }; }));
      await seek(0.5);
      expect((await tiles()).every((t) => t.o < 0.5)).toBe(true);
      await seek(3.5);
      const t = await tiles();
      expect(t.length).toBe(5);
      expect(t.every((x) => x.o > 0.9 && !x.bar)).toBe(true);
      expect(t.map((x) => x.bg)).toEqual(logos.map((l) => `url("${l}")`));
      for (const x of t) expect(Math.abs(x.w - x.h)).toBeLessThan(2);
    });
  });
});

