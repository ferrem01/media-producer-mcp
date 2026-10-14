import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// A card's soft shadow reaches past its component box (Marc, Oct 14: the
// notification and the checklist sat on "a square shadow"), and the solid
// notification is an opaque white card, not the dark-screen glass.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(HERE, "../src/components");

describe("component shadows and the solid notification", () => {
  it("draws the card's shadow below its box, on an opaque white card", async () => {
    const scene = { id: "s", label: "s", duration_seconds: 3, background: "#ffffff", components: [
      { id: "n", type: "notification-stack", data: { surface: "solid", notifications: [{ title: "Shared inbox", body: "New demo request", time: "now" }] },
        position: { x: "10%", y: "30%", width: "60%", height: "20%" }, z_index: 5 },
    ] };
    const html = await assembleScene({ scene: scene as any,
      components: [{ type: "notification-stack", source: await fs.readFile(path.join(LIB, "mockups/notification-stack.component.html"), "utf-8") }],
      brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
      canvas: { width: 1080, height: 1920 } as any, gsapDir: path.resolve(HERE, "../vendor/gsap") } as any);
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "shadow-"));
    await fs.writeFile(path.join(tmp, "s.html"), html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      await page.goto(`file://${path.join(tmp, "s.html")}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      // Pull the box's bottom edge up to the card's, so its shadow falls outside.
      const m = await page.evaluate(() => {
        (window as any).__MP_TIMELINE.time(2);
        const wrap = document.querySelector("[data-cid='n']") as HTMLElement;
        const card = wrap.querySelector(".notification-card") as HTMLElement;
        const w = wrap.getBoundingClientRect(), c = card.getBoundingClientRect();
        wrap.style.height = Math.round(c.bottom - w.top + 1) + "px";
        const cs = getComputedStyle(card);
        return { x: Math.round(c.left + c.width / 2), y: Math.round(wrap.getBoundingClientRect().bottom + 10), bg: cs.backgroundColor, blur: cs.backdropFilter };
      });
      expect(m.bg).toBe("rgb(255, 255, 255)");
      expect(m.blur === "none" || m.blur === "").toBe(true);
      const shot = await page.screenshot({ clip: { x: m.x, y: m.y, width: 1, height: 1 } });
      // A PNG of one pixel: read it back in the page to get its colour.
      const lum = await page.evaluate(async (b64) => {
        const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
        const cv = document.createElement("canvas"); cv.width = 1; cv.height = 1;
        const ctx = cv.getContext("2d")!; ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, 1, 1).data; return (d[0] + d[1] + d[2]) / 3;
      }, shot.toString("base64"));
      expect(lum).toBeLessThan(250); // the shadow shows past the box (white = clipped)
    } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }); }
  }, 60000);
});
