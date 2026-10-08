import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Prerna on the Six Tabs 16:9 (Oct 8): open on the email's cover without the
// speakers and come back to it at the end; the announce email's waves on the
// ground; Claude and Quotient in the upper left.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, "../src/components");
const src = (cat: string, type: string) => fs.readFile(path.join(LIB, cat, `${type}.component.html`), "utf-8");

async function boot(components: any[], shot?: string) {
  const scene = { id: "s", label: "s", duration_seconds: 4, background: "#f4efe1", components };
  const html = await assembleScene({ scene: scene as any,
    components: [
      { type: "cream-ground", source: await src("effects", "cream-ground") },
      { type: "webinar-cover", source: await src("cta", "webinar-cover") },
      { type: "cobrand-lockup", source: await src("media", "cobrand-lockup") },
    ],
    brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1920, height: 1080 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap") } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wcover-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`file://${path.join(tmp, "s.html")}`);
  await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
  return { page, done: async () => { if (shot) await page.screenshot({ path: shot }); await browser.close(); await fs.rm(tmp, { recursive: true, force: true }); } };
}

const COVER = { title: "Claude for\nMarketing *Analytics*", pill: "FREE WEBINAR", kicker: "A live, 45-minute session",
  subtitle: "Learn how to use Claude to see exactly what each post and email produced, from clicks to leads.",
  date: "Tuesday\nOctober 20, 2026", time: "1:00 – 1:45 PM ET" };

describe("webinar cover, waves, co-brand lockup", () => {
  it("the cover is whole on the first frame, fits its box, and sets the starred word in the accent", async () => {
    const { page, done } = await boot([
      { id: "ground", type: "cream-ground", position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 0, data: { pattern: "waves" } },
      { id: "brand", type: "cobrand-lockup", position: { x: "3%", y: "4%", width: "30%", height: "5.5%" }, z_index: 50,
        data: { marks: [{ builtin: "claude", label: "Claude" }, { label: "Quotient" }] } },
      { id: "cover", type: "webinar-cover", position: { x: "10%", y: "11%", width: "80%", height: "74%" }, z_index: 10, data: { ...COVER, still: true } },
    ], process.env.MP_SHOT ? `${process.env.MP_SHOT}-open.png` : undefined);
    try {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(0); });
      const m = await page.evaluate(() => {
        const box = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const title = document.querySelector(".wc-title") as HTMLElement;
        return {
          title: box(".wc-title"), block: box(".wc-block"), slot: box("[data-cid='cover']") ,
          titleOpacity: getComputedStyle(title).opacity, em: getComputedStyle(document.querySelector(".wc-title em")!).color,
          waves: document.querySelectorAll(".crg-waves path").length, spark: document.querySelectorAll(".cbl-mark svg line").length,
          brand: box(".cbl-row"),
        };
      });
      expect(Number(m.titleOpacity)).toBe(1);
      expect(m.block.t).toBeGreaterThanOrEqual(m.slot.t - 1);
      expect(m.block.b).toBeLessThanOrEqual(m.slot.b + 1);
      const [r, , b] = m.em.match(/\d+/g)!.map(Number);
      expect(r).toBeGreaterThan(b + 80);
      expect(m.waves).toBeGreaterThan(20);
      expect(m.spark).toBe(12);
      expect(m.brand.b).toBeLessThan(m.block.t);
    } finally { await done(); }
  }, 60000);

  it("the close is the same cover with the button landing", async () => {
    const { page, done } = await boot([
      { id: "ground", type: "cream-ground", position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 0, data: { pattern: "waves" } },
      { id: "cover", type: "webinar-cover", position: { x: "10%", y: "8%", width: "80%", height: "76%" }, z_index: 10,
        data: { ...COVER, subtitle: undefined, at: 0.1, button_text: "Save your spot", button_at: 1 } },
    ], process.env.MP_SHOT ? `${process.env.MP_SHOT}-close.png` : undefined);
    try {
      const at = async (t: number) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt);
        return Number(getComputedStyle(document.querySelector(".wc-button")!).opacity); }, t);
      expect(await at(0.5)).toBe(0);
      expect(await at(3)).toBe(1);
    } finally { await done(); }
  }, 60000);
});

describe("the co-brand lockup holds still", () => {
  it("is pinned to the frame, not the camera rig", async () => {
    const { isFixedToFrame } = await import("../src/core/scene-assembler.js");
    expect(isFixedToFrame("cobrand-lockup")).toBe(true);
  });
});
