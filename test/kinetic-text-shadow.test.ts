import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Bold type straight over the person: shadow:true gives it a soft drop shadow
// (Marc, Oct 14: the pills became plain bold text over his room).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(HERE, "../src/components");

async function shadowOf(data: Record<string, unknown>) {
  const scene = { id: "s", label: "s", duration_seconds: 2, background: "#ffffff", components: [
    { id: "t", type: "kinetic-text", data: { text: "Owner: *nobody*", at: 0, ...data }, position: { x: "10%", y: "40%", width: "80%", height: "10%" }, z_index: 5 },
  ] };
  const html = await assembleScene({ scene: scene as any,
    components: [{ type: "kinetic-text", source: await fs.readFile(path.join(LIB, "titles/kinetic-text.component.html"), "utf-8") }],
    brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1080, height: 1920 } as any, gsapDir: path.resolve(HERE, "../vendor/gsap") } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "kts-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    return await page.evaluate(() => {
      (window as any).__MP_TIMELINE.time(1);
      return getComputedStyle(document.querySelector("[data-cid='t'] .text-container")!).textShadow;
    });
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }); }
}

describe("kinetic-text shadow", () => {
  it("casts a drop shadow under the words only when asked", async () => {
    expect(await shadowOf({ color: "#ffffff", shadow: true })).toMatch(/rgba\(0, 0, 0, 0\.55\)/);
    expect(await shadowOf({ color: "#ffffff" })).toBe("none");
  }, 60000);
});
