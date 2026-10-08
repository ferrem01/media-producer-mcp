import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// RELAY COLLAPSES (Marc, Oct 8, the 16:9 Six Tabs: "the logos should collapse
// and then expand into an analytics screen ... they should zip across the
// screen and then ... collect, smash together again, and then open back up"):
// tool-storm's collapse_at and click-stream's end_mode "smash" fold the piece
// into a dot published as the anchor `core`; the next piece is born from it
// with enter {effect: "morph", from: "<id>.core"}.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 1920, H = 1080;
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");
const BRAND = { colors: { primary: "#393bf5", background: "#f5f4f0", text: "#17171c" }, fonts: [] } as any;
const IMG = (w: number, h: number, c: string) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`);

type Comp = { id: string; type: string; dir: string; data: unknown; position: unknown; enter?: unknown; exit?: unknown };
async function still(comps: Comp[], duration: number, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>) {
  const srcs: Array<{ type: string; source: string }> = [];
  for (const c of comps) if (!srcs.some((s) => s.type === c.type)) srcs.push({ type: c.type, source: await read(`../src/components/${c.dir}/${c.type}.component.html`) });
  const scene = { id: "s", label: "s", duration_seconds: duration, background: "#f5f4f0", components: comps.map((c, i) => ({ id: c.id, type: c.type, data: c.data, position: c.position, z_index: 10 + i, ...(c.enter ? { enter: c.enter } : {}), ...(c.exit ? { exit: c.exit } : {}) })) };
  const html = await assembleScene({ scene: scene as any, components: srcs, brandKit: BRAND, canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap") } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "relay-collapse-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
const box = (page: Page, sel: string) => page.evaluate((s) => {
  const n = document.querySelector(s);
  if (!n) return null;
  const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, vis: cs.visibility !== "hidden" && +cs.opacity > 0.05 };
}, sel);
const visibleCount = (page: Page, sel: string) => page.evaluate((s) => Array.from(document.querySelectorAll(s)).filter((n) => {
  const r = n.getBoundingClientRect(); let e: Element | null = n;
  while (e) { const cs = getComputedStyle(e); if (cs.visibility === "hidden" || +cs.opacity < 0.05) return false; e = e.parentElement; }
  return r.width > 4 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
}).length, sel);

const FULL = { x: 0, y: 0, width: "100%", height: "100%" };
const TARGET = { x: "10%", y: "10%", width: "80%", height: "70%" };
const STAT = { type: "stat-card", dir: "titles", data: { value: 42, suffix: "%", label: "Reply rate" } };

describe("relay collapses", () => {
  it("tool-storm folds its logos into a dot, and the next piece is born from the dot", async () => {
    const logos = ["#e33", "#3a3", "#33e", "#fa0", "#0aa", "#a0a"].map((c) => IMG(64, 64, c));
    await still([
      { id: "storm", type: "tool-storm", dir: "props", position: FULL, data: { mode: "fly", style: "logo", logos, at: 0.1, duration: 1, collapse_at: 1.4, collapse_duration: 0.5 } },
      { id: "next", ...STAT, position: TARGET, enter: { effect: "morph", from: "storm.core", at: 2.3, duration: 0.6 } },
    ], 4, async (page, seek) => {
      await seek(1.2);
      expect(await visibleCount(page, '[data-cid="storm"] .tsm-slot')).toBe(6);
      expect((await box(page, '[data-cid="storm"] [data-anchor="core"]'))!.vis).toBe(false);
      await seek(2.25);
      expect(await visibleCount(page, '[data-cid="storm"] .tsm-slot')).toBe(0);
      const core = (await box(page, '[data-cid="storm"] [data-anchor="core"]'))!;
      expect(core.vis).toBe(true);
      expect(Math.abs(core.x - W / 2)).toBeLessThan(40);
      expect(Math.abs(core.y - H / 2)).toBeLessThan(40);
      expect(core.w).toBeLessThan(80);
      // Born from the dot: the next piece starts small on it and opens to its own box.
      await seek(2.32);
      const born = (await box(page, '[data-cid="next"]'))!;
      expect(born.w).toBeLessThan(W * 0.3);
      expect(Math.abs(born.x - W / 2)).toBeLessThan(200);
      await seek(3.5);
      const home = (await box(page, '[data-cid="next"]'))!;
      expect(home.vis).toBe(true);
      expect(home.w).toBeGreaterThan(W * 0.7);
      // Scrub back: the logos are there again.
      await seek(1.2);
      expect(await visibleCount(page, '[data-cid="storm"] .tsm-slot')).toBe(6);
    });
  }, 60000);

  it("click-stream smashes every piece into a dot after the last stop, and the next piece is born from it", async () => {
    const stop = (c: string) => ({ src: IMG(1080, 1350, c), w: 1080, h: 1350, target: [64, 1144, 364, 90], chip: "Clicked", kind: "email" });
    const stream = ["#ccc", "#bbb", "#aaa", "#999"].map((c) => ({ src: IMG(1600, 1000, c), w: 1600, h: 1000 }));
    await still([
      { id: "cs", type: "click-stream", dir: "media", position: FULL, data: { at: 0, stops: [stop("#f88"), stop("#8f8")], stream, times: [0.8, 1.6], end_mode: "smash", smash_at: 2.2, smash_duration: 0.8, chip_to: [0.8, 0.2] } },
      { id: "next", ...STAT, position: TARGET, enter: { effect: "morph", from: "cs.core", at: 3.2, duration: 0.6 } },
    ], 5, async (page, seek) => {
      await seek(2.1);
      expect(await visibleCount(page, '[data-cid="cs"] .cks-piece')).toBeGreaterThan(0);
      expect((await box(page, '[data-cid="cs"] [data-anchor="core"]'))!.vis).toBe(false);
      await seek(3.15);
      expect(await visibleCount(page, '[data-cid="cs"] .cks-piece')).toBe(0);
      const core = (await box(page, '[data-cid="cs"] [data-anchor="core"]'))!;
      expect(core.vis).toBe(true);
      expect(Math.abs(core.x - W / 2)).toBeLessThan(60);
      expect(Math.abs(core.y - H / 2)).toBeLessThan(60);
      await seek(3.22);
      expect((await box(page, '[data-cid="next"]'))!.w).toBeLessThan(W * 0.3);
      await seek(4.5);
      expect((await box(page, '[data-cid="next"]'))!.w).toBeGreaterThan(W * 0.7);
      await seek(1.0);
      expect(await visibleCount(page, '[data-cid="cs"] .cks-piece')).toBeGreaterThan(0);
    });
  }, 60000);

  it("collapse folds a piece to nothing about its centre; expand opens the next out of nothing", async () => {
    await still([
      { id: "a", ...STAT, position: TARGET, exit: { effect: "collapse", at: 1, duration: 0.4 } } as any,
      { id: "b", ...STAT, position: TARGET, enter: { effect: "expand", at: 1.5, duration: 0.5 } },
    ], 3, async (page, seek) => {
      await seek(0.9);
      const a0 = (await box(page, '[data-cid="a"]'))!;
      expect(a0.vis).toBe(true);
      await seek(1.32);   // power3.in: most of the fold is at the end
      const a1 = (await box(page, '[data-cid="a"]'))!;
      expect(a1.w).toBeLessThan(a0.w * 0.8);
      expect(Math.abs(a1.x - a0.x)).toBeLessThan(40);  // about its centre (the ambient push drifts both)
      await seek(1.45);
      expect((await box(page, '[data-cid="a"]'))!.vis).toBe(false);
      expect((await box(page, '[data-cid="b"]'))!.vis).toBe(false);
      await seek(1.53);
      const b1 = (await box(page, '[data-cid="b"]'))!;
      expect(b1.w).toBeLessThan(a0.w * 0.6);
      await seek(2.5);
      const b2 = (await box(page, '[data-cid="b"]'))!;
      expect(b2.vis).toBe(true);
      expect(Math.abs(b2.w - a0.w)).toBeLessThan(a0.w * 0.03);  // home (the ambient push breathes)
    });
  }, 60000);
});
