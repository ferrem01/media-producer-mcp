import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { cameraMovesScript } from "../src/core/scene-assembler.js";

const require = createRequire(import.meta.url);
const GSAP = readFileSync(require.resolve("gsap/dist/gsap.min.js"), "utf8");

/** Scale of the scene rig at time t, for a scene with these moves. */
async function scaleAt(moves: any[], t: number): Promise<number> {
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.setContent(`<html><body style="margin:0;width:1080px;height:1920px;position:relative">
      <div class="mp-component" style="position:absolute;inset:0"></div>
      <script>${GSAP}</script>
      <script>window.__MP_TIMELINE = gsap.timeline({ paused: true });</script>
      <script>${cameraMovesScript(moves, { width: 1080, height: 1920 }, "document.body", "window.__MP_TIMELINE")}</script>
      </body></html>`);
    await page.waitForFunction(() => !!document.querySelector(".__mp_camera_rig"));
    return await page.evaluate((tt) => {
      (window as any).__MP_TIMELINE.seek(tt, false);
      return Number((window as any).gsap.getProperty(document.querySelector(".__mp_camera_rig"), "scaleX"));
    }, t);
  } finally { await browser.close(); }
}

describe("a scene that opens on a framing", () => {
  it("holds the punch-in on its first frame, not the wide shot", async () => {
    const moves = [{ at: 0, type: "zoom", x: 48, y: 26, scale: 1.12, duration: 0.01 }, { at: 1.28, type: "reset", duration: 0.1 }];
    expect(await scaleAt(moves, 0)).toBeCloseTo(1.12, 2);
    expect(await scaleAt(moves, 2)).toBeCloseTo(1, 2);
  }, 30000);

  it("still eases a real zoom in from the wide shot", async () => {
    expect(await scaleAt([{ at: 0, type: "zoom", x: 50, y: 50, scale: 1.5, duration: 1 }], 0)).toBeCloseTo(1, 2);
  }, 30000);
});
