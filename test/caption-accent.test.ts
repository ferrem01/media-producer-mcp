import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Prerna on the Six Tabs 16:9: "FREE WEBINAR IN ORANGE". The caption lane's
// *starred* words take `accent` (default the brand primary).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
describe("caption emphasis ink", () => {
  it("starred words take the accent colour", async () => {
    const source = await fs.readFile(path.resolve(__dirname, "../src/components/captions/reel-caption-lane.component.html"), "utf-8");
    const scene = { id: "s", label: "s", duration_seconds: 2, background: "#f4efe1", components: [
      { id: "cap", type: "reel-caption-lane", position: { x: "10%", y: "80%", width: "80%", height: "12%" }, z_index: 46,
        data: { scrim: "plate", accent: "#d48c34", phrases: [{ text: "It's *free*", start: 0, end: 2 }] } }] };
    const html = await assembleScene({ scene: scene as any, components: [{ type: "reel-caption-lane", source }],
      brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
      canvas: { width: 1920, height: 1080 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap") } as any);
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cap-accent-"));
    await fs.writeFile(path.join(tmp, "s.html"), html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(`file://${path.join(tmp, "s.html")}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(1); });
      const col = await page.evaluate(() => getComputedStyle(document.querySelector(".rcl-w.em")!).color);
      const [r, g, b] = col.match(/\d+/g)!.map(Number);
      expect(r).toBeGreaterThan(b + 60);   // warm amber, not the blue primary
    } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }); }
  }, 60000);
});
