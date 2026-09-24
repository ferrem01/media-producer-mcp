import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Found by the first live film with the new components (proj_74e69eff): the
// writer staged quotient-chat FULL-FRAME (a 1960px panel of 11px type) and
// zoomed 1.4x on its full-width transcript anchor, cutting every line off
// at the left edge. The mock now takes a fit box, and a zoom never scales
// an anchor past the frame's width.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("anchored zoom on a full-frame house mock", () => {
  it("lays the mock out at panel size and never crops the transcript", async () => {
    const type = "quotient-chat";
    const html = await assembleScene({
      scene: {
        id: "s", label: "s", duration_seconds: 5, background: "#ffffff",
        camera_moves: [{ at: 0.5, type: "zoom", anchor: "tpl_artifact.messages", scale: 1.4, duration: 0.9 }],
        components: [{ id: "c0", type, data: {
          history: [{ type: "user", text: "Plan next week's launch for the analytics release" }],
          script: [{ action: "agent-message", text: "On it -- here's the plan for the analytics release launch:", at: 0.3 }],
        } }],
      } as any,
      components: [{ type, source: await fs.readFile(path.resolve(__dirname, "../src/components/mockups/quotient-chat.component.html"), "utf-8") }],
      brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
      canvas: { width: 1920, height: 1080 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cam-"));
    await fs.writeFile(path.join(dir, "s.html"), html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(`file://${path.join(dir, "s.html")}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(3); });
      const m = await page.evaluate(() => {
        const rig = document.querySelector(".__mp_camera_rig") as HTMLElement;
        const scale = rig ? new DOMMatrix(getComputedStyle(rig).transform).a : 1;
        const texts = [...document.querySelectorAll("[data-anchor='messages'] *")].filter((e) => e.childElementCount === 0 && (e.textContent || "").trim().length > 3)
          .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
        const fit = document.querySelector(".mp-fit") as HTMLElement | null;
        return { scale, minLeft: Math.min(...texts.map((r) => r.left)), n: texts.length, fit: !!fit };
      });
      expect(m.fit).toBe(true);
      expect(m.n).toBeGreaterThan(0);
      expect(m.scale).toBeLessThan(1.1); // the zoom did not blow a full-width anchor past the frame
      expect(m.minLeft).toBeGreaterThanOrEqual(0); // no line cut off at the left edge
    } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }, 60000);
});
