import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// calm: settle, never bounce. The physics contract is machinery: on a calm
// scene every overshooting ease (back / elastic / bounce) on the master
// timeline becomes a plain power ease, so nothing lands past its mark.
// A scene that did not ask for it keeps its overshoot.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 960, H = 540, DUR = 3;

async function sheet(motionPhysics?: "calm"): Promise<string> {
  const text = await fs.readFile(path.resolve(__dirname, "../src/components/titles/kinetic-text.component.html"), "utf-8");
  return assembleScene({
    scene: {
      id: "s1", label: "calm", duration_seconds: DUR, background: "#fcefe0",
      ...(motionPhysics ? { motion_physics: motionPhysics } : {}),
      components: [{
        id: "hero", type: "kinetic-text",
        position: { x: "10%", y: "35%", width: "80%", height: "30%" },
        data: { text: "SETTLE", color: "#17171c" },
        enter: { effect: "rise", at: 0, duration: 1.2, ease: "back.out(3)" },
      }],
    } as any,
    components: [{ type: "kinetic-text", source: text }],
    brandKit: { colors: { background: "#fcefe0", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function heroYs(html: string): Promise<number[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "calm-"));
  const file = path.join(dir, "scene.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}) });
  try {
    const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.route(/^https?:/, (r) => r.abort());
    await page.goto(`file://${file}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
    return await page.evaluate(() => {
      const out: number[] = [];
      for (let t = 0; t <= 1.6; t += 0.05) {
        (window as any).__MP_TIMELINE.pause(t);
        const hero = document.querySelector('.mp-component[data-cid="hero"]')!;
        out.push((window as any).gsap.getProperty(hero, "y") as number);
      }
      return out;
    });
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("calm: settle, never bounce", () => {
  it("a calm scene's rise lands without passing its mark; a default scene overshoots", async () => {
    const punchy = await heroYs(await sheet());
    const calm = await heroYs(await sheet("calm"));
    // Both start below and end on the mark.
    expect(punchy[0]).toBeGreaterThan(1);
    expect(calm[0]).toBeGreaterThan(1);
    expect(Math.abs(calm[calm.length - 1])).toBeLessThan(0.5);
    // back.out(3) overshoots above the mark (negative y) on the default scene.
    expect(Math.min(...punchy)).toBeLessThan(-1);
    // calm never passes it.
    expect(Math.min(...calm)).toBeGreaterThan(-0.01);
    // and still moves monotonically toward it.
    for (let i = 1; i < calm.length; i++) expect(calm[i]).toBeLessThanOrEqual(calm[i - 1] + 0.01);
  }, 90_000);
});
