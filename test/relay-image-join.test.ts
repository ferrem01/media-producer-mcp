import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// A relay join lands on a full-frame picture: the scene before ends on it and
// this scene must OPEN on it. The image component faded in over 0.6 s (and a
// timed one started invisible), so frame 0 was blank; and its picture was a
// CSS background the capture never waited for. entrance "none" stands from
// frame 0; a hidden <img> of the same URL is what the capture waits on.
// quotient-report's `at` shifts its entrance so a flood can land on a KPI.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (p: string) => fs.readFile(path.resolve(__dirname, "../src/components/", p), "utf-8");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("relay picture joins", () => {
  it("an image with entrance none stands at frame 0, preloads through an <img>; the report's entrance shifts with at", async () => {
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 3, background: "#efeeea", locked_camera: true, components: [
        { id: "pic", type: "image", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data: { src: PNG, entrance: "none", drift: false } },
        { id: "fade", type: "image", position: { x: "0%", y: "0%", width: "50%", height: "50%" }, data: { src: PNG } },
        { id: "rep", type: "quotient-report", position: { x: "50%", y: "50%", width: "50%", height: "50%" }, data: { at: 1 } },
      ] } as any,
      components: [{ type: "image", source: await src("media/image.component.html") }, { type: "quotient-report", source: await src("mockups/quotient-report.component.html") }],
      brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 960, height: 540 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "imgjoin-"));
    const file = path.join(dir, "s.html"); await fs.writeFile(file, html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      const at = async (t: number) => page.evaluate((tt) => {
        (window as any).__MP_TIMELINE.time(tt);
        const op = (id: string) => Number(getComputedStyle(document.querySelector(`[data-cid="${id}"] .image-component`) as Element).opacity);
        const card = document.querySelector('[data-cid="rep"] .qrp-card') as HTMLElement;
        return { pic: op("pic"), fade: op("fade"), card: Number(getComputedStyle(card).opacity),
          preload: document.querySelectorAll('[data-cid="pic"] img.bg-preload').length };
      }, t);
      const f0 = await at(0);
      expect(f0.pic).toBe(1);          // standing at frame 0
      expect(f0.fade).toBeLessThan(0.5); // the default still fades in
      expect(f0.preload).toBe(1);
      expect((await at(0.5)).card).toBe(0);     // report entrance not started yet (at 1)
      expect((await at(1.6)).card).toBe(1);     // started at 1.1, 0.3 s long
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  }, 60000);
});
