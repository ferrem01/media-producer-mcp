import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene, resolveMorphSource } from "../src/core/scene-assembler.js";
import { assembleComposite } from "../src/core/composite-assembler.js";

// MORPH v1 (SPEC-metamorph.md, settled in review): an ENTRANCE EFFECT with a
// source -- enter {effect:"morph", from:"A" | "A.anchor"} -- so one component
// is born from another's box inside one scene. The wrapper starts on the
// source's box and travels to its own; the source fades out in place. The
// relay grammar's handoffs were coordinates between purpose-built pieces;
// this is the handoff for ANY pair. Every check seeks the master timeline
// the way the capture does, backwards included.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 1920, H = 1080;
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");
const BRAND = { colors: { primary: "#393bf5", background: "#f5f4f0", text: "#17171c" }, fonts: [] } as any;

const CARD = { type: "verdict-scorecard", dir: "ui-mocks", data: { criteria: ["Fit", "Tenure", "Signal"], verdict: "Top 5%", at: 0.1, stagger: 0.2, verdict_at: 0.8 } };
const STAT = { type: "stat-card", dir: "titles", data: { value: 42, suffix: "%", label: "Reply rate" } };

type Comp = { id: string; type: string; dir: string; data: unknown; position: unknown; enter?: unknown; exit?: unknown };
async function sources(comps: Comp[]) {
  const out: Array<{ type: string; source: string }> = [];
  for (const c of comps) if (!out.some((s) => s.type === c.type)) out.push({ type: c.type, source: await read(`../src/components/${c.dir}/${c.type}.component.html`) });
  return out;
}
const sceneOf = (comps: Comp[], duration: number) => ({
  id: "s", label: "s", duration_seconds: duration, background: "#f5f4f0",
  components: comps.map((c, i) => ({ id: c.id, type: c.type, data: c.data, position: c.position, z_index: 10 + i, ...(c.enter ? { enter: c.enter } : {}), ...(c.exit ? { exit: c.exit } : {}) })),
});

async function open(html: string, run: (page: Page, seek: (t: number) => Promise<void>, warns: string[]) => Promise<void>, ready = "__MP_READY") {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "morph-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors: string[] = [], warns: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "warning" && /\[morph\]/.test(m.text())) warns.push(m.text()); });
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction((k) => k === "__MP_READY" ? (window as any).__MP_READY === true : !!(window as any)[k], ready, { timeout: 30000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t), warns);
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
async function still(comps: Comp[], run: (page: Page, seek: (t: number) => Promise<void>, warns: string[]) => Promise<void>, duration = 4) {
  const html = await assembleScene({ scene: sceneOf(comps, duration) as any, components: await sources(comps), brandKit: BRAND, canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap") } as any);
  await open(html, run);
}
const shot = async (page: Page, name: string) => { if (process.env.MORPH_SHOTS) await page.screenshot({ path: path.join(process.env.MORPH_SHOTS, name) }); };
const box = (page: Page, sel: string) => page.evaluate((s) => {
  const n = document.querySelector(s)!;
  const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
  return { x: r.left, y: r.top, w: r.width, h: r.height, o: +cs.opacity, vis: cs.visibility !== "hidden" && +cs.opacity > 0.05 };
}, sel);
const near = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, tol: number) => {
  for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(a[k] - b[k]), `${k}: ${a[k].toFixed(1)} vs ${b[k].toFixed(1)}`).toBeLessThan(tol);
};

const SMALL = { x: "5%", y: "8%", width: "25%", height: "22%" };
const BIG = { x: "45%", y: "45%", width: "50%", height: "50%" };

describe("morph: one component born from another's box", () => {
  it("starts on the source's box, travels to its own, the source fades out -- and scrubs back", async () => {
    await still([
      { id: "A", ...CARD, position: SMALL },
      { id: "B", ...STAT, position: BIG, enter: { effect: "morph", from: "A", at: 1, duration: 0.6, ease: "power3.inOut" } },
    ], async (page, seek) => {
      const A = '[data-cid="A"]', B = '[data-cid="B"]';
      await seek(0.9);
      expect((await box(page, B)).vis).toBe(false);
      expect((await box(page, A)).vis).toBe(true);
      // At `at` the box IS the source's box. Both wrappers ride the same
      // camera (ambient push included), so their client rects agree.
      await seek(1.0);
      const a0 = await box(page, A), b0 = await box(page, B);
      near(b0, a0, 3);
      // A skin dresses the travelling box and rides the same transform.
      const skin = await box(page, '.mp-morph-skin[data-morph-for="B"]');
      near(skin, b0, 3);
      // Halfway through it is between the two boxes.
      await shot(page, "morph-1.0.png");
      await seek(1.3);
      const mid = await box(page, B);
      await shot(page, "morph-1.3.png");
      expect(mid.x).toBeGreaterThan(a0.x + 20);
      expect(mid.w).toBeGreaterThan(a0.w + 20);
      // Home: its own box, fully visible; the source handed itself over.
      await seek(1.7);
      const b1 = await box(page, B);
      const home = { x: W * 0.45, y: H * 0.45, w: W * 0.5, h: H * 0.5 };
      near(b1, home, 40); // the ambient push scales the frame ~3%
      expect(mid.x).toBeLessThan(b1.x - 20);
      expect(b1.o).toBe(1);
      expect((await box(page, A)).vis).toBe(false);
      expect((await box(page, '.mp-morph-skin[data-morph-for="B"]')).vis).toBe(false);
      // Unscaled once it lands: its content is not smeared.
      const t = await page.evaluate(() => getComputedStyle(document.querySelector('[data-cid="B"]')!).transform);
      expect(t === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t)).toBe(true);
      // Seek-safety: back before the morph, it is as if it never ran.
      await seek(0.5);
      expect((await box(page, B)).vis).toBe(false);
      expect((await box(page, A)).vis).toBe(true);
      expect((await box(page, '.mp-morph-skin[data-morph-for="B"]')).vis).toBe(false);
      await seek(1.0);
      near(await box(page, B), a0, 3);
    });
  }, 60000);

  it("an explicit exit on the source wins: the morph leaves its wrapper alone", async () => {
    await still([
      { id: "A", ...CARD, position: SMALL, exit: { effect: "fade", at: 2.5, duration: 0.3 } },
      { id: "B", ...STAT, position: BIG, enter: { effect: "morph", from: "A", at: 1, duration: 0.6 } },
    ], async (page, seek) => {
      await seek(1.8);
      expect((await box(page, '[data-cid="A"]')).vis).toBe(true);
      await seek(3.0);
      expect((await box(page, '[data-cid="A"]')).vis).toBe(false);
    });
  }, 60000);

  it("a source that is not in the scene degrades to a plain fade, with one warning", async () => {
    await still([
      { id: "A", ...CARD, position: SMALL },
      { id: "B", ...STAT, position: BIG, enter: { effect: "morph", from: "nope", at: 1, duration: 0.6 } },
    ], async (page, seek, warns) => {
      await seek(0.9);
      expect((await box(page, '[data-cid="B"]')).vis).toBe(false);
      await seek(2.2);
      const b = await box(page, '[data-cid="B"]');
      expect(b.o).toBe(1);
      near(b, { x: W * 0.45, y: H * 0.45, w: W * 0.5, h: H * 0.5 }, 40);
      // The source is untouched and nothing was built for it.
      expect((await box(page, '[data-cid="A"]')).vis).toBe(true);
      expect(await page.evaluate(() => document.querySelectorAll(".mp-morph-skin").length)).toBe(0);
      expect(warns.length).toBe(1);
      expect(warns[0]).toMatch(/"nope"/);
    });
  }, 60000);

  it("from 'A.anchor' is born from that part: the part hands over, the component stays", async () => {
    await still([
      { id: "A", ...CARD, position: { x: "4%", y: "6%", width: "44%", height: "40%" } },
      { id: "B", ...STAT, position: BIG, enter: { effect: "morph", from: "A.number", at: 2, duration: 0.6 } },
    ], async (page, seek) => {
      const tile = '[data-cid="A"] [data-anchor="number"]';
      await seek(1.9);
      const t0 = await box(page, tile);
      expect(t0.vis).toBe(true);
      await seek(2.0);
      near(await box(page, '[data-cid="B"]'), t0, 3);
      await seek(2.15); await shot(page, "anchor-2.15.png");
      await seek(2.3); await shot(page, "anchor-2.3.png");
      await seek(2.45); await shot(page, "anchor-2.45.png");
      await seek(2.0);
      // The skin wears the tile's dark fill.
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".mp-morph-skin")!).backgroundColor)).toBe("rgb(23, 23, 28)");
      expect(await page.evaluate(() => document.querySelector('[data-cid="B"]')!.getAttribute("data-mp-morph"))).toBe("A.number");
      await seek(2.8);
      expect((await box(page, tile)).vis).toBe(false);
      expect((await box(page, '[data-cid="A"]')).vis).toBe(true);
      expect((await box(page, '[data-cid="B"]')).o).toBe(1);
      await seek(1.0);
      expect((await box(page, '[data-cid="B"]')).vis).toBe(false);
    });
  }, 60000);

  it("the Studio composite plays the same morph on its namespaced wrappers", async () => {
    const comps: Comp[] = [
      { id: "A", ...CARD, position: SMALL },
      { id: "B", ...STAT, position: BIG, enter: { effect: "morph", from: "A", at: 1, duration: 0.6 } },
    ];
    const html = await assembleComposite({
      scenes: [{ scene: sceneOf(comps, 4) as any, components: await sources(comps) }],
      brandKit: BRAND, canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    expect(html).toContain('"src":"s__A"');
    await open(html, async (page, seek) => {
      const A = '[data-cid="s__A"]', B = '[data-cid="s__B"]';
      await seek(0.9);
      expect((await box(page, B)).vis).toBe(false);
      await seek(1.0);
      near(await box(page, B), await box(page, A), 3);
      await seek(1.7);
      expect((await box(page, B)).o).toBe(1);
      expect((await box(page, A)).vis).toBe(false);
    }, "__MP_TIMELINE");
  }, 60000);
});

describe("morph: the source resolves against the scene's cast", () => {
  const cast = [{ id: "stat-card", type: "stat-card" }, { id: "stat-card_2", type: "stat-card" }, { id: "hero", type: "verdict-scorecard" }];
  it("by id, by type (the board's name for it), and as id.anchor", () => {
    expect(resolveMorphSource("hero", "x", cast)).toEqual({ src: "hero", anchor: null });
    expect(resolveMorphSource("verdict-scorecard", "x", cast)).toEqual({ src: "hero", anchor: null });
    expect(resolveMorphSource("stat-card_2", "x", cast)).toEqual({ src: "stat-card_2", anchor: null });
    expect(resolveMorphSource("hero.number", "x", cast)).toEqual({ src: "hero", anchor: "number" });
    expect(resolveMorphSource("verdict-scorecard.card", "x", cast)).toEqual({ src: "hero", anchor: "card" });
  });
  it("nothing, itself, or a stranger is no source", () => {
    expect(resolveMorphSource(undefined, "x", cast)).toBeNull();
    expect(resolveMorphSource("", "x", cast)).toBeNull();
    expect(resolveMorphSource("hero", "hero", cast)).toBeNull();
    expect(resolveMorphSource("ghost.card", "x", cast)).toBeNull();
  });
});

describe("morph: every layer between the writer and the stage keeps the source", () => {
  it("the add/update component schema accepts enter.from (zod would strip an unknown key)", async () => {
    const { componentSchema, animationSchema } = await import("../src/server.js");
    const parsed = componentSchema.parse({ id: "B", type: "stat-card", data: {}, enter: { effect: "morph", from: "A.number", at: 3.1, duration: 0.6, ease: "power3.inOut" } });
    expect(parsed.enter).toEqual({ effect: "morph", from: "A.number", at: 3.1, duration: 0.6, ease: "power3.inOut" });
    // The same schema backs update's component fields and the board's cast.
    expect(animationSchema.parse({ effect: "morph", from: "A" })).toEqual({ effect: "morph", from: "A" });
  });

  it("board -> build: the authored builder keeps morph and its source on the entrance, never on an exit", async () => {
    const { normalizeAnim } = await import("../src/llm/scene-generator.js");
    expect(normalizeAnim({ effect: "morph", from: "stat-card", at: 2, duration: 0.6 })).toEqual({ effect: "morph", from: "stat-card", at: 2, duration: 0.6 });
    expect(normalizeAnim({ effect: "morph", from: "stat-card" }, "exit")).toBeUndefined();
    // A source is only carried by a morph.
    expect(normalizeAnim({ effect: "fade", from: "stat-card" })).toEqual({ effect: "fade" });
  });

  it("a recipe may name morph as an entrance only with a source (in_from)", async () => {
    const { applyRecipeMotion } = await import("../src/core/recipes.js");
    const scene: any = { components: [{ type: "sticker-prop", data: { kind: "stamp" } }, { type: "lower-third", data: {} }] };
    applyRecipeMotion(scene, { motion: { elements: { stamp: { in: "morph", in_from: "search-bar", in_s: 0.6 }, lower_third: { in: "morph", out: "morph" } } } } as any);
    expect(scene.components[0].enter).toEqual({ effect: "morph", duration: 0.6, from: "search-bar" });
    expect(scene.components[1].enter).toBeUndefined();
    expect(scene.components[1].exit).toBeUndefined();
  });

  it("the storyboard enter object can say where it comes from", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    expect(src).toMatch(/from: \{ type: "string", description: "effect morph only/);
  });
});
