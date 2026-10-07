import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// SPEC-creator-formats.md: the three new components in a real browser --
// the proof beside the person, the index reel, the tier list.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOLDER: Record<string, string> = { "proof-frame": "media", "index-reel": "media", "tier-list": "data-viz" };
const SRC = (t: string) => fs.readFile(path.resolve(__dirname, `../src/components/${FOLDER[t]}/${t}.component.html`), "utf-8");
const BRAND = { colors: { primary: "#393bf5", secondary: "#d48c34", accent: "#17171c", background: "#ffffff", surface: "#dfdfed", text: "#17171c", text_muted: "#8f8f9f" }, fonts: [] };
const FULL = { x: "0%", y: "0%", width: "100%", height: "100%" };
const SHOTS = process.env.MP_TEST_SHOTS; // a folder: save a still of each case to look at

type Comp = { type: string; data: unknown; position?: unknown };
async function open(name: string, comps: Comp[], run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, opts: { w?: number; h?: number; dur?: number } = {}) {
  const W = opts.w || 1080, H = opts.h || 1920;
  const types = [...new Set(comps.map((c) => c.type))];
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: opts.dur || 14, background: "#8a7f74",
      components: comps.map((c, i) => ({ id: "c" + i, type: c.type, position: c.position || FULL, data: c.data })) } as any,
    components: await Promise.all(types.map(async (t) => ({ type: t, source: await SRC(t) }))),
    brandKit: BRAND as any,
    canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cf-"));
  await fs.writeFile(path.join(dir, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(dir, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page, async (t) => {
      await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-${t}.png`) });
    });
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
const box = (page: Page, sel: string) => page.evaluate((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const vis = (page: Page, sel: string) => page.evaluate((s) => { const e = document.querySelector(s) as HTMLElement; const cs = getComputedStyle(e); return cs.visibility !== "hidden" && Number(cs.opacity) > 0.5; }, sel);

describe("proof-frame", () => {
  it("a laptop beside the face on a wide frame, landing on its word, inside the frame", async () => {
    await open("pf-laptop", [{ type: "proof-frame", data: { chrome: "laptop", place: "side", at: 1, exit_at: 5, face: { cx: 0.38, cy: 0.42, size: 0.3 } } }], async (page, seek) => {
      await seek(0.5);
      expect(await vis(page, ".pf-box")).toBe(false);
      await seek(2);
      expect(await vis(page, ".pf-box")).toBe(true);
      const b = await box(page, ".pf-shell");
      expect(b.x).toBeGreaterThan(1920 * 0.5);         // the face is left: the laptop goes right
      expect(b.r).toBeLessThan(1920);
      expect(b.w / b.h).toBeCloseTo(1.6, 1);           // a 16:10 screen
      expect(await page.evaluate(() => document.querySelector(".pf-slate span")!.textContent)).toBe(""); // no file, no words: an empty slate
      await seek(5.5);
      expect(await vis(page, ".pf-box")).toBe(false);
    }, { w: 1920, h: 1080, dur: 6 });
  });
  it("a slate on a TV above the face on a tall frame; a reaction's source flush on top", async () => {
    await open("pf-tv", [{ type: "proof-frame", data: { chrome: "tv", need: "The churn dashboard", text: "The churn dashboard", asset_type: "Screenshot needed", hint: "Upload it", at: 0.5, face: { cx: 0.5, cy: 0.62, size: 0.2 } } }], async (page, seek) => {
      await seek(2);
      const b = await box(page, ".pf-shell");
      expect(b.b).toBeLessThan(1920 * 0.52);            // above the face
      expect(b.w).toBeGreaterThan(1080 * 0.6);
      expect(await page.evaluate(() => document.querySelector(".pf-slate span")!.textContent)).toBe("The churn dashboard");
    }, { dur: 6 });
    await open("pf-react", [{ type: "proof-frame", data: { chrome: "none", place: "split", at: 0.2, face: { cx: 0.5, cy: 0.62, size: 0.2 } } }], async (page, seek) => {
      await seek(1.5);
      const b = await box(page, ".pf-shell");
      // Flush to the seen frame (the harness's camera drifts the stage a few
      // pixels after layout; a built scene keeps the frame off the rig).
      expect(Math.abs(b.x)).toBeLessThan(8); expect(Math.abs(b.w - 1080)).toBeLessThan(16);
      expect(b.h).toBeGreaterThan(1920 * 0.34); expect(b.b).toBeLessThan(1920 * 0.52);
    }, { dur: 6 });
  });
});

describe("index-reel", () => {
  const items = ["Welcome", "Activation nudge", "Feature tip", "Trial ending", "Upgrade", "Win-back"].map((t, i) => ({ title: t, subject: `${t}: subject ${i + 1}`, preview: "One line of the body." }));
  it("host: the headline pinned from the start, the phone swapping every 0.9 s away from the face, the count", async () => {
    await open("ir-host", [{ type: "index-reel", data: { mode: "host", headline: "6 lifecycle emails in *6 seconds*", items, start_at: 1.5, face: { cx: 0.5, cy: 0.33, size: 0.2 } } }], async (page, seek) => {
      await seek(0.8);
      expect(await vis(page, ".ir-head")).toBe(true);
      const h = await box(page, ".ir-head h2");
      expect(h.y).toBeLessThan(1920 * 0.12); expect(h.x).toBeGreaterThan(0); expect(h.r).toBeLessThan(1080);
      await seek(1.6);
      expect(await page.evaluate(() => document.querySelector(".ir-count")!.textContent)).toBe("1/6");
      await seek(1.5 + 0.9 * 2 + 0.1);
      expect(await page.evaluate(() => document.querySelector(".ir-count")!.textContent)).toBe("3/6");
      expect(await page.evaluate(() => [...document.querySelectorAll(".ir-mail")].findIndex((e) => getComputedStyle(e).visibility === "visible"))).toBe(2);
      const p = await box(page, ".ir-phone");
      expect(p.y).toBeGreaterThan(1920 * 0.43);          // under the face
      expect(p.b).toBeLessThanOrEqual(1920);
      expect(await page.evaluate(() => document.querySelector(".ir-label")!.textContent)).toBe("Feature tip");
      await seek(12);
      expect(await page.evaluate(() => document.querySelector(".ir-count")!.textContent)).toBe("6/6");
    });
  });
  it("page: an opaque page, the numbered list filling in step with the examples", async () => {
    await open("ir-page", [{ type: "index-reel", data: { mode: "page", headline: "6 lifecycle emails in *6 seconds*", items, start_at: 0.8 } }], async (page, seek) => {
      await seek(0.8 + 0.9 * 3 + 0.1);
      const shown = await page.evaluate(() => [...document.querySelectorAll(".ir-list li")].map((li) => getComputedStyle(li).visibility === "visible"));
      expect(shown).toEqual([true, true, true, true, false, false]);
      expect(await page.evaluate(() => document.querySelector(".ir-list li.on span")!.textContent)).toBe("Trial ending");
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".ir-page")!).display)).toBe("block");
      const l = await box(page, ".ir-list"), p = await box(page, ".ir-phone");
      expect(l.r).toBeLessThanOrEqual(p.x + 1);           // the list beside the phone
    });
  });
});

describe("tier-list", () => {
  it("drops each item into its row on its time, the latest ringed", async () => {
    await open("tier", [{ type: "tier-list", data: { title: "Lifecycle emails, ranked", items: [{ label: "Win-back", tier: "S", at: 0 }, { label: "Welcome", tier: "A", at: 0 }, { label: "Newsletter", tier: "D", at: 2 }] }, position: { x: "6%", y: "4%", width: "88%", height: "40%" } }], async (page, seek) => {
      await seek(1);
      expect(await page.evaluate(() => [...document.querySelectorAll(".tl-item")].map((e) => Number(getComputedStyle(e).opacity) > 0.5))).toEqual([true, true, false]);
      await seek(3);
      const rows = await page.evaluate(() => [...document.querySelectorAll(".tl-row")].map((r) => r.querySelector(".tl-tier")!.textContent + ":" + [...r.querySelectorAll(".tl-item")].map((i) => i.textContent).join(",")));
      expect(rows).toEqual(["S:Win-back", "A:Welcome", "B:", "C:", "D:Newsletter"]);
      expect(await page.evaluate(() => document.querySelector(".tl-item.new")!.textContent)).toBe("Newsletter");
    }, { dur: 6 });
  });
});
