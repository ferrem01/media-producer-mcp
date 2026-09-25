import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Marc (proj_7adf0eb5): "take the numbers from scene 1 and move them above
// my head". Above a person the row sits on their room -- a bright wall --
// where white digits wash out. plate:true puts a dark frosted panel behind
// the row, and a banner-height box still holds it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("number-counter-row plate", () => {
  it("backs the row with a dark panel and fits a banner above the speaker", async () => {
    const type = "number-counter-row";
    const src = await fs.readFile(path.resolve(__dirname, `../src/components/titles/${type}.component.html`), "utf-8");
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 4, background: "#e8eef6", components: [{ id: "n", type,
        position: { x: "2%", y: "2%", width: "96%", height: "24%" },
        data: { plate: true, color: "#f5f6fa", count: "roll", stats: [{ value: 2140, label: "GA4 · Conversions" }, { value: 1870, label: "HubSpot · Conversions" }, { value: 2610, label: "Meta Ads · Conversions" }] } }] } as any,
      components: [{ type, source: src }],
      brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
      canvas: { width: 1080, height: 1350 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ncp-"));
    await fs.writeFile(path.join(dir, "s.html"), html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`file://${path.join(dir, "s.html")}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 20000 });
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(3.5); });
      if (process.env.NCP_SHOT) await page.screenshot({ path: process.env.NCP_SHOT });
      const m = await page.evaluate(() => {
        const root = document.querySelector(".number-counter-row") as HTMLElement;
        const box = root.parentElement!.getBoundingClientRect();
        const panel = document.querySelector(".stats-container") as HTMLElement;
        const r = panel.getBoundingClientRect();
        return { plate: root.classList.contains("nc-plate"), bg: getComputedStyle(panel).backgroundColor, inside: r.top >= box.top - 1 && r.bottom <= box.bottom + 1, bottom: r.bottom };
      });
      expect(m.plate).toBe(true);
      const a = Number((/rgba\([^)]*,\s*([\d.]+)\)/.exec(m.bg) || [])[1]);
      expect(a).toBeGreaterThan(0.5);
      expect(m.inside, "the row fits its banner box").toBe(true);
      expect(m.bottom).toBeLessThan(1350 * 0.27); // stays above the head
      expect(errors).toEqual([]);
    } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }, 60000);
});
