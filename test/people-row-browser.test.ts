import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// "I would love to show a head shot of each of them flowing and their names
// as i say them" (Marc, 2026-10-08): people-row -- round headshots and name
// cards, each on its own word, a face croppable out of a bigger picture.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = () => fs.readFile(path.resolve(__dirname, "../src/components/titles/people-row.component.html"), "utf-8");
const BRAND = { colors: { primary: "#393bf5", secondary: "#d48c34", accent: "#17171c", background: "#ffffff", surface: "#dfdfed", text: "#17171c", text_muted: "#8f8f9f" }, fonts: [] };
const SHOTS = process.env.MP_TEST_SHOTS;

async function open(data: unknown, position: unknown, run: (seek: (t: number) => Promise<void>, page: import("playwright").Page) => Promise<void>) {
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 6, background: "#8a7f74",
      components: [{ id: "p", type: "people-row", position, data }] } as any,
    components: [{ type: "people-row", source: await SRC() }],
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
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `people-row-${t}.png`) });
    }, page);
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

describe("people-row", () => {
  it("each person arrives on their own time, inside the box, a face cropped from a bigger picture", async () => {
    const data = { people: [
      { name: "Scott Murtaugh", title: "Founder, Growth Process Automation", src: "x.png", at: 1, crop: { x: 0.57, y: 0.48, w: 0.09, h: 0.16 } },
      { name: "Max Davish", title: "Co-Founder & CTO, Quotient", src: "x.png", at: 2 },
    ] };
    const box = { x: "6%", y: "52%", width: "88%", height: "24%" };
    await open(data, box, async (seek, page) => {
      const shown = () => page.evaluate(() => [...document.querySelectorAll(".ppl-photo")].map((e) => Number(getComputedStyle(e).opacity) > 0.5));
      await seek(0.5);
      expect(await shown()).toEqual([false, false]);
      await seek(1.8);
      expect(await shown()).toEqual([true, false]);
      await seek(3);
      expect(await shown()).toEqual([true, true]);
      const r = await page.evaluate(() => {
        const items = [...document.querySelectorAll(".ppl-item")].map((e) => e.getBoundingClientRect());
        const ph = document.querySelector(".ppl-photo") as HTMLElement;
        const name = document.querySelector(".ppl-name")!.getBoundingClientRect();
        const c = document.querySelector(".ppl")!.getBoundingClientRect();
        return { box: { t: c.top, b: c.bottom, l: c.left, r: c.right }, items: items.map((b) => ({ t: b.top, b: b.bottom, r: b.right })), bgSize: ph.style.backgroundSize, bgPos: ph.style.backgroundPosition, phW: ph.getBoundingClientRect().width, nameH: name.height };
      });
      // inside its box (the harness camera drifts the stage, so the box is measured, not assumed)
      for (const b of r.items) { expect(b.t).toBeGreaterThanOrEqual(r.box.t - 1); expect(b.b).toBeLessThanOrEqual(r.box.b + 1); expect(b.r).toBeLessThanOrEqual(r.box.r + 1); }
      expect(r.items[1].t).toBeGreaterThan(r.items[0].b - 1);   // one under the other
      expect(r.phW).toBeGreaterThan(150);                       // a face you can see on a phone
      expect(r.nameH).toBeGreaterThan(36);
      expect(r.bgSize).toMatch(/^1111\.1\d*% 625%$/);
      expect(r.bgPos).toMatch(/^62\.6\d*% 57\.1\d*%$/);
    });
  });
});
