import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { fitBoxFor, FIT_RANGES } from "../src/core/fit-box.js";
import { assembleScene } from "../src/core/scene-assembler.js";

// THE FIT BOX: legacy widgets lay out in a design box and scale to their slot
// (the polish audit: web-size type in big slots, strips of letters in the
// writer's 14%-wide panels).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const C = { width: 1920, height: 1080 };

describe("fitBoxFor", () => {
  it("scales a widget UP in a big slot", () => {
    const f = fitBoxFor({ type: "progress-bar", position: { x: "2%", y: "6%", width: "62%", height: "88%" } }, C)!;
    expect(f.s).toBeGreaterThan(1.2);
    expect(f.w).toBeLessThanOrEqual(FIT_RANGES["progress-bar"][1] + 1);
  });
  it("keeps a sane layout width in a narrow slot and scales DOWN (no strip of letters)", () => {
    const f = fitBoxFor({ type: "email-compose", position: { x: "51%", y: "12%", width: "14%", height: "76%" } }, C)!;
    expect(f.w).toBeGreaterThanOrEqual(FIT_RANGES["email-compose"][0]);
    expect(f.s).toBeLessThan(1);
  });
  it("never shrinks a widget below 1:1 because its slot is short", () => {
    expect(fitBoxFor({ type: "testimonial-card", position: { x: "10%", y: "30%", width: "80%", height: "40%" } }, C)).toBeNull();
  });
  it("caps the scale-up by the minimum design height (bar-chart's title stayed in its box)", () => {
    const f = fitBoxFor({ type: "bar-chart", position: { x: "3%", y: "12%", width: "94%", height: "76%" } }, C)!;
    expect(f.h).toBeGreaterThanOrEqual(600);
  });
  it("leaves unlisted types and data.fit === false alone", () => {
    expect(fitBoxFor({ type: "quotient-home" }, C)).toBeNull();
    expect(fitBoxFor({ type: "progress-bar", data: { fit: false }, position: { x: 0, y: 0, width: "90%", height: "90%" } }, C)).toBeNull();
  });
});

describe("in the page", () => {
  it("the component's el is the design box, laid out at design width, scaled to the slot", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/components/data-viz/progress-bar.component.html"), "utf-8");
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 3, background: "#fff",
        components: [{ id: "c", type: "progress-bar", position: { x: "2%", y: "6%", width: "62%", height: "88%" }, data: { value: 41, label: "Open rate" } }] } as any,
      components: [{ type: "progress-bar", source: src }],
      brandKit: { colors: {}, fonts: [] } as any, canvas: C as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fit-"));
    await fs.writeFile(path.join(dir, "s.html"), html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: C });
      await page.goto(`file://${path.join(dir, "s.html")}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      const m = await page.evaluate(() => {
        const outer = document.querySelector('.mp-component[data-cid="c"]') as HTMLElement;
        const fit = outer.querySelector(":scope > .mp-fit") as HTMLElement;
        return { fit: !!fit, designW: fit?.clientWidth, slotW: outer.getBoundingClientRect().width, drawnW: fit?.getBoundingClientRect().width };
      });
      expect(m.fit).toBe(true);
      expect(m.designW).toBeLessThan(m.slotW);
      expect(Math.abs(m.drawnW! - m.slotW)).toBeLessThan(2);
    } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }, 60000);
});
