import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// HyperFrames audit gaps: before-after-wipe (Before After Wipe / Comparison
// Split), screen-carousel (Screen Flow Carousel), screen-swap (Sticky Mock Swap).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (t: string) => fs.readFile(path.resolve(__dirname, `../src/components/media/${t}.component.html`), "utf-8");
const BRAND = { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] };
// A tiny real image (so the capture's image wait has something to load).
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";

async function open(type: string, data: unknown, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, size = { w: 1920, h: 1080 }, position: unknown = { x: "center", y: "center" }) {
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 8, background: "#fafaf8", components: [{ id: "c0", type, position, data }] } as any,
    components: [{ type, source: await SRC(type) }],
    brandKit: BRAND as any, canvas: { width: size.w, height: size.h } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pf-"));
  await fs.writeFile(path.join(dir, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(dir, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

describe("before-after-wipe", () => {
  it("sweeps to reveal the after, rests at the split, and seeks exactly", async () => {
    await open("before-after-wipe", { before_text: "14 tabs, 6 tools", after_text: "One prompt", split: 0.5 }, async (page, seek) => {
      const at = async (t: number) => { await seek(t); return page.evaluate(() => {
        const f = document.querySelector(".baw-frame")!.getBoundingClientRect(), d = document.querySelector(".baw-divider")!.getBoundingClientRect();
        return { p: (d.left + d.width / 2 - f.left) / f.width, clip: getComputedStyle(document.querySelector(".baw-before")!).clipPath };
      }); };
      expect((await at(0.3)).p).toBeGreaterThan(0.97); // enters showing the before
      const mid = await at(1.6);
      expect(mid.p).toBeLessThan(0.3); // swept most of the way
      const rest = await at(6);
      expect(Math.abs(rest.p - 0.5)).toBeLessThan(0.01);
      expect(rest.clip).toMatch(/inset\(0px 50%/);
      expect((await at(1.6)).p).toBeCloseTo(mid.p, 3); // seek back: same frame
    });
  }, 60000);
});

describe("before-after-wipe: padding", () => {
  it("holds an exact gap around the frame all scene long, against the ambient camera drift", async () => {
    // Marc: "give the component a little space, 10-20px". The scene's slow
    // camera push grew the frame past the gap (16px at the start, -16px at the end).
    await open("before-after-wipe", { before_text: "Light", after_text: "Dark", padding: 16 }, async (page, seek) => {
      for (const t of [0.8, 3, 7.9]) {
        await seek(t);
        const g = await page.evaluate(() => { const r = document.querySelector(".baw-frame")!.getBoundingClientRect(); return [r.left, r.top, innerWidth - r.right, innerHeight - r.bottom]; });
        for (const v of g) expect(Math.abs(v - 16), `gap at ${t}s: ${g.join(",")}`).toBeLessThan(0.75);
      }
    }, { w: 1920, h: 1080 }, { x: "0%", y: "0%", width: "100%", height: "100%" });
  }, 60000);

  it("paints the gap in the editorial cream when ground is 'cream', edge to edge all scene long", async () => {
    // Marc: "change the background to be more like" the cream statement beats.
    await open("before-after-wipe", { before_text: "Light", after_text: "Dark", padding: 16, ground: "cream" }, async (page, seek) => {
      for (const t of [0.8, 7.9]) {
        await seek(t);
        const m = await page.evaluate(() => { const el = document.querySelector(".baw-root") as HTMLElement; const r = el.getBoundingClientRect();
          return { bg: getComputedStyle(el).backgroundColor, img: getComputedStyle(el).backgroundImage, covers: r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight }; });
        expect(m.bg).toBe("rgb(244, 239, 225)");
        expect(m.img).toContain("radial-gradient");
        expect(m.covers, `ground covers the frame at ${t}s`).toBe(true);
      }
    }, { w: 1920, h: 1080 }, { x: "0%", y: "0%", width: "100%", height: "100%" });
  }, 60000);
});

describe("screen-carousel", () => {
  it("advances one screen per cue, the centre screen biggest and its caption showing", async () => {
    const screens = [1, 2, 3].map((i) => ({ src: PNG, title: "Step " + i, caption: "Line " + i }));
    await open("screen-carousel", { screens }, async (page, seek) => {
      for (const [t, want] of [[1.2, 0], [4.0, 1], [7.5, 2]] as const) {
        await seek(t);
        const m = await page.evaluate(() => ({
          w: [...document.querySelectorAll(".scr-item")].map((e) => e.getBoundingClientRect().width),
          cap: [...document.querySelectorAll(".scr-cap")].map((c) => +getComputedStyle(c).opacity),
        }));
        expect(m.w.indexOf(Math.max(...m.w))).toBe(want);
        expect(m.cap.indexOf(Math.max(...m.cap))).toBe(want);
        expect(Math.max(...m.cap)).toBeGreaterThan(0.99);
      }
    });
  }, 60000);
});

describe("screen-swap", () => {
  it("lights one feature at a time, its screen on top, its bar filling", async () => {
    const screens = [1, 2, 3].map((i) => ({ src: PNG, title: "Feature " + i, caption: "Line " + i }));
    await open("screen-swap", { screens }, async (page, seek) => {
      await seek(4.0);
      const m = await page.evaluate(() => ({
        shots: [...document.querySelectorAll(".ssw-shot")].map((s) => +getComputedStyle(s).opacity),
        rows: [...document.querySelectorAll(".ssw-item")].map((r) => +getComputedStyle(r).opacity),
        fill: [...document.querySelectorAll(".ssw-fill")].map((f) => (f as HTMLElement).style.height),
      }));
      expect(m.shots).toEqual([0, 1, 0]);
      expect(m.rows[1]).toBe(1);
      expect(m.rows[0]).toBeLessThan(0.5);
      expect(parseFloat(m.fill[0])).toBe(100);
      expect(parseFloat(m.fill[1])).toBeGreaterThan(0);
      expect(parseFloat(m.fill[1])).toBeLessThan(100);
    });
  }, 60000);

  it("on a tall frame shows only the active feature, under the window", async () => {
    const screens = [1, 2].map((i) => ({ src: PNG, title: "Feature " + i }));
    await open("screen-swap", { screens }, async (page, seek) => {
      await seek(6.5);
      const m = await page.evaluate(() => {
        const st = document.querySelector(".ssw-stage")!.getBoundingClientRect();
        return { rows: [...document.querySelectorAll(".ssw-item")].map((r) => ({ o: +getComputedStyle(r).opacity, top: r.getBoundingClientRect().top })), stageBottom: st.bottom };
      });
      expect(m.rows.map((r) => r.o)).toEqual([0, 1]);
      expect(m.rows[1].top).toBeGreaterThan(m.stageBottom);
    }, { w: 1080, h: 1920 });
  }, 60000);
});
