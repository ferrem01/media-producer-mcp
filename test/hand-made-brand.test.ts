import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene, generateFontLinks } from "../src/core/scene-assembler.js";
import { assembleComposite } from "../src/core/composite-assembler.js";

// The hand-made brand pieces (the Quotient rebrand, Nov 17): a custom face
// loaded from the brand kit, the hand-drawn physics (cut, on twos, the
// wiggle), type-relay's cut reveal / tag / squiggle, the 2026 product look
// of quotient-flow, quotient-home and ai-email-rewrite, and the new motifs:
// mockup-frame, symbol-field, quotient-lockup.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, "../src/components");

async function source(type: string): Promise<string> {
  for (const cat of await fs.readdir(LIB, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    const f = path.join(LIB, cat.name, `${type}.component.html`);
    try { return await fs.readFile(f, "utf-8"); } catch { /* next */ }
  }
  throw new Error(`no component ${type}`);
}

type Comp = { id?: string; type: string; data: unknown; position?: unknown };
async function open(comps: Comp[], opts: { dur?: number; physics?: string } = {}) {
  const types = [...new Set(comps.map((c) => c.type))];
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: opts.dur || 3, background: "#FFEFDE", motion_physics: opts.physics,
      components: comps.map((c, i) => ({ id: c.id || `c${i}`, position: c.position || { x: "0%", y: "0%", width: "100%", height: "100%" }, type: c.type, data: c.data })) } as any,
    components: await Promise.all(types.map(async (type) => ({ type, source: await source(type) }))),
    brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 1920, height: 1080 } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hb-"));
  const file = path.join(dir, "s.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route(/^https?:/, (r) => r.abort());
  const warnings: string[] = [];
  page.on("pageerror", (e) => warnings.push(e.message));
  page.on("console", (m) => { if (m.type() === "warning" && !/Failed to load/.test(m.text())) warnings.push(m.text()); });
  await page.goto(`file://${file}`);
  await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
  return { page, warnings, close: async () => { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); } };
}
const seek = (page: Page, t: number) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
const vis = (page: Page, sel: string) => page.evaluate((s) => {
  const e = document.querySelector(s) as HTMLElement | null;
  return !!e && getComputedStyle(e).visibility !== "hidden" && Number(getComputedStyle(e).opacity) > 0.5;
}, sel);

describe("a custom face from the brand kit", () => {
  it("a custom font with a url becomes an @font-face; Google faces keep their link; a custom face with no url loads nothing", () => {
    const html = generateFontLinks({ colors: {}, fonts: [
      { family: "PP Museum", source: "custom", weights: [300], url: "/assets/t/brand-kit/font/PPMuseum-Light.woff2" },
      { family: "Inter", source: "google", weights: [400, 600] },
      { family: "House Sans", source: "custom" },
    ] } as any);
    expect(html).toContain('@font-face { font-family: "PP Museum"; src: url(/assets/t/brand-kit/font/PPMuseum-Light.woff2); font-weight: 300;');
    expect(html).toContain("family=Inter:wght@400;600");
    expect(html).not.toContain("House Sans");
  });
});

describe("hand-drawn physics", () => {
  it("a fade lands in one frame, motion holds each pose for two frames, small pieces wiggle every four frames", async () => {
    const s = await open([
      { id: "label", type: "kinetic-text", position: { x: "0%", y: "80%", width: "100%", height: "10%" }, data: { text: "SATURDAY, 9:14 PM", at: 0.2 } },
      { id: "big", type: "type-relay", data: { lines: [{ text: "Hello there." }], at: 0.1, reveal: "cut", word_stagger: 0.2 } },
    ], { physics: "hand-drawn", dur: 2 });
    try {
      // Cut: the label is fully there on its first frame, never half-faded.
      const op = async (t: number) => { await seek(s.page, t); return s.page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-cid="label"]')!).opacity)); };
      await seek(s.page, 0);
      const ops = [];
      for (const t of [0.25, 0.3, 0.4, 0.6]) ops.push(await op(t));
      expect(ops.every((o) => o === 0 || o === 1)).toBe(true);
      // The cut reveal: "Hello" at 0.1, "there." at 0.3 -- nothing in between.
      const words = async (t: number) => { await seek(s.page, t); return s.page.evaluate(() => [...document.querySelectorAll(".trl-word")].map((w) => getComputedStyle(w).visibility)); };
      expect(await words(0.15)).toEqual(["visible", "hidden"]);
      expect(await words(0.45)).toEqual(["visible", "visible"]);
      // The wiggle: words and the small label move by the CSS translate
      // property, a new pose every 4 frames, the same pose within one.
      const pose = async (t: number) => { await seek(s.page, t); return s.page.evaluate(() => [getComputedStyle(document.querySelector(".trl-word")!).translate, getComputedStyle(document.querySelector('[data-cid="label"]')!).translate]); };
      const a = await pose(1.0), b = await pose(1.03), c = await pose(1.2);
      expect(a[0]).not.toBe("none");
      expect(a).toEqual(b);
      expect(c).not.toEqual(a);
      const px = Math.max(...a.flatMap((v) => v.split(" ").map((n) => Math.abs(parseFloat(n)))));
      expect(px).toBeLessThanOrEqual(3);
      // The big full-frame word card wrapper itself stays put (only its words move).
      expect(await s.page.evaluate(() => getComputedStyle(document.querySelector('[data-cid="big"]')!).translate)).toBe("none");
      expect(s.warnings).toEqual([]);
    } finally { await s.close(); }
  }, 60000);
});

describe("hand-drawn physics keeps a from() entrance", () => {
  it("a from({autoAlpha:0}) entrance still lands: the cut never re-reads the start state as the end", async () => {
    const s = await open([{ id: "ai", type: "ai-email-rewrite", data: { at: 0.2, from: "Lumen AI", fixed: "Happy to help.",
      // More than one person: the first lands with the panel, so the
      // panel's from() has already rendered when the physics runs.
      leads: ["Daniel", "Tom", "Sarah"].map((name) => ({ name, company: "Meridian", did: "Viewed pricing", subject: `Hi ${name}`, line: "You compared plans." })) } }],
    { physics: "hand-drawn", dur: 3 });
    try {
      const op = async (t: number) => { await seek(s.page, t); return s.page.evaluate(() => [".ar-left", ".ar-mail"].map((q) => Number(getComputedStyle(document.querySelector(q)!).opacity))); };
      expect(await op(2)).toEqual([1, 1]);
      expect(await op(1)).toEqual([1, 1]);
    } finally { await s.close(); }
  }, 60000);
});

describe("hand-drawn physics in Studio", () => {
  it("the composite (Studio's preview) cuts, steps and wiggles each hand-drawn scene the way the render does; a plain scene stays still", async () => {
    const big = { type: "type-relay", data: { lines: [{ text: "Hello there." }], at: 0.1, reveal: "cut", word_stagger: 0.2 } };
    const trl = await source("type-relay");
    const mk = (id: string, physics?: string) => ({
      scene: { id, label: id, duration_seconds: 2, background: "#FFEFDE", motion_physics: physics,
        components: [{ id: "big", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, ...big }] } as any,
      components: [{ type: "type-relay", source: trl }],
    });
    const html = await assembleComposite({
      scenes: [mk("a", "hand-drawn"), mk("b")],
      brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 1920, height: 1080 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hb-"));
    await fs.writeFile(path.join(dir, "c.html"), html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.route(/^https?:/, (r) => r.abort());
      await page.goto(`file://${path.join(dir, "c.html")}`);
      await page.waitForFunction(() => !!(window as any).__MP_TIMELINE, undefined, { timeout: 30000 });
      const pose = async (t: number, sid: string) => {
        await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
        return page.evaluate((s) => getComputedStyle(document.querySelector(`.mp-scene[data-scene-id="${s}"] .trl-word`)!).translate, sid);
      };
      const a = await pose(1.0, "a"), b = await pose(1.03, "a"), c = await pose(1.2, "a");
      expect(a).not.toBe("none");
      expect(a).toBe(b);
      expect(c).not.toBe(a);
      // The plain scene after it is untouched: physics is per scene.
      expect(await pose(3.0, "b")).toBe("none");
    } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }, 60000);
});

describe("type-relay: the hand-made title", () => {
  it("names a face, puts a mono tag over the words and draws the squiggle under them in three poses", async () => {
    const s = await open([{ type: "type-relay", data: {
      font: "PP Museum", weight: 300, reveal: "cut", at: 0.3, align: "center", lines: [{ text: "Welcome every new signup." }],
      tag: { text: "Use case 01", at: 0.1, bar: "#EE80B7" }, squiggle: { at: 1.0, color: "#FFEFDE" },
    } }]);
    try {
      expect(await s.page.evaluate(() => getComputedStyle(document.querySelector(".trl-block")!).fontFamily)).toMatch(/^"PP Museum"/);
      await seek(s.page, 0.05);
      expect(await vis(s.page, ".trl-tag")).toBe(false);
      await seek(s.page, 0.2);
      expect(await vis(s.page, ".trl-tag")).toBe(true);
      expect(await s.page.evaluate(() => getComputedStyle(document.querySelector(".trl-tag")!).borderLeftColor)).toBe("rgb(238, 128, 183)");
      const geo = await s.page.evaluate(() => {
        const t = document.querySelector(".trl-tag")!.getBoundingClientRect(), b = document.querySelector(".trl-block")!.getBoundingClientRect();
        const q = document.querySelector(".trl-squig")!.getBoundingClientRect();
        return { tagAbove: t.bottom <= b.top + 2, squigBelow: q.top >= b.bottom - 40 };
      });
      expect(geo).toEqual({ tagAbove: true, squigBelow: true });
      const dash = async (t: number) => { await seek(s.page, t); return s.page.evaluate(() => parseFloat((document.querySelector(".trl-squig path") as SVGPathElement).style.strokeDashoffset)); };
      const d1 = await dash(1.02), d2 = await dash(1.12), d3 = await dash(1.25);
      expect(d1).toBeGreaterThan(d2);
      expect(d3).toBe(0);
    } finally { await s.close(); }
  }, 60000);
});

describe("type-relay: the highlight block", () => {
  it("one flat crooked block per row of accent words, behind them, cutting in after they land", async () => {
    const s = await open([{ type: "type-relay", data: {
      reveal: "cut", at: 0.1, word_stagger: 0.1, align: "center", highlight: { color: "#EFD800" },
      lines: [{ text: "Most leads never get" }, { text: "a real follow-up.", accent: "real follow-up." }],
    } }], { physics: "hand-drawn" });
    try {
      const st = async (t: number) => { await seek(s.page, t); return s.page.evaluate(() => [...document.querySelectorAll(".trl-hl")].map((h) => {
        const e = h as HTMLElement, cs = getComputedStyle(e);
        return { vis: cs.visibility, bg: cs.backgroundColor, radius: cs.borderRadius, tilt: e.style.transform, behind: !!(e.compareDocumentPosition(document.querySelector(".trl-block")!) & Node.DOCUMENT_POSITION_FOLLOWING) };
      })); };
      // Words: 4 on line one, then "a" "real" "follow-up." at 0.5, 0.6, 0.7.
      const before = await st(0.75);
      expect(before.length).toBe(1);
      expect(before[0].vis).toBe("hidden");
      const after = await st(1.2);
      expect(after[0]).toMatchObject({ vis: "visible", bg: "rgb(239, 216, 0)", radius: "0px", behind: true });
      expect(after[0].tilt).toMatch(/^rotate\(-?\d/);
      const box = await s.page.evaluate(() => {
        const h = document.querySelector(".trl-hl")!.getBoundingClientRect();
        const ws = [...document.querySelectorAll(".trl-word")].slice(-2).map((w) => w.getBoundingClientRect());
        return { coversL: h.left <= ws[0].left + 2, coversR: h.right >= ws[1].right - 2 };
      });
      expect(box).toEqual({ coversL: true, coversR: true });
    } finally { await s.close(); }
  }, 60000);
});

describe("the 2026 product look", () => {
  it("quotient-flow: two-layer nodes, family colours, the new mark, no shadows -- and the old look is untouched", async () => {
    const steps = [{ id: "a", kind: "event", title: "Viewed /pricing", subtitle: "3 times in 7 days" }, { id: "b", kind: "ai-email", subtitle: "Questions?" }, { id: "c", kind: "email", subtitle: "Thanks" }];
    const s = await open([{ type: "quotient-flow", data: { look: "2026", steps, unfurl: false } }]);
    try {
      await seek(s.page, 1);
      const r = await s.page.evaluate(() => {
        const cards = [...document.querySelectorAll(".qf-card")] as HTMLElement[];
        return {
          bg: getComputedStyle(document.querySelector(".qf-root")!).backgroundColor,
          inner: cards.map((c) => !!c.querySelector(".qf-in")),
          head: cards.map((c) => c.querySelector(".qf-hd span")!.textContent),
          shadows: cards.map((c) => getComputedStyle(c).boxShadow),
          markIcon: !!cards[1].querySelector(".qf-hd svg[viewBox='0 0 166.32 166.32']"),
          mailStroke: cards[2].querySelector(".qf-hd svg")!.getAttribute("stroke"),
        };
      });
      expect(r.bg).toBe("rgb(247, 245, 242)");
      expect(r.inner).toEqual([true, true, true]);
      expect(r.head).toEqual(["Trigger", "AI Email", "Send Email"]);
      expect(r.shadows.every((x) => x === "none")).toBe(true);
      expect(r.markIcon).toBe(true);
      expect(r.mailStroke).toBe("#F27141");
    } finally { await s.close(); }
    const old = await open([{ type: "quotient-flow", data: { steps, unfurl: false } }]);
    try {
      await seek(old.page, 1);
      const o = await old.page.evaluate(() => ({
        y26: !!document.querySelector(".qf-y26"), inner: !!document.querySelector(".qf-in"),
        shadow: getComputedStyle(document.querySelector(".qf-card")!).boxShadow,
      }));
      expect(o.y26).toBe(false);
      expect(o.inner).toBe(false);
      expect(o.shadow).not.toBe("none");
    } finally { await old.close(); }
  }, 90000);

  it("quotient-home and ai-email-rewrite: the warm look, the mark, symbol fields round the composer, no shadows", async () => {
    const s = await open([{ type: "quotient-home", data: { look: "2026", hide_chips: true } }]);
    try {
      await seek(s.page, 1.5);
      const r = await s.page.evaluate(() => ({
        bg: getComputedStyle(document.querySelector(".qhome")!).backgroundColor,
        h1: getComputedStyle(document.querySelector(".qhome-h1")!).fontFamily,
        mark: !!document.querySelector(".qhome-orb svg[viewBox='0 0 166.32 166.32']"),
        fields: document.querySelectorAll(".qhome-sym svg g").length,
        shadow: getComputedStyle(document.querySelector(".qhome-card")!).boxShadow,
      }));
      expect(r.bg).toBe("rgb(253, 251, 248)");
      expect(r.h1).toMatch(/^"PP Museum"/);
      expect(r.mark).toBe(true);
      expect(r.fields).toBeGreaterThan(50);
      expect(r.shadow).toBe("none");
    } finally { await s.close(); }
    const a = await open([{ type: "ai-email-rewrite", data: { look: "2026" } }], { dur: 5 });
    try {
      await seek(a.page, 2);
      const r = await a.page.evaluate(() => ({
        y26: !!document.querySelector(".ar-y26"),
        chip: getComputedStyle(document.querySelector(".ar-chip")!).display,
        acc: getComputedStyle(document.querySelector(".ar-root")!).getPropertyValue("--ar-acc").trim(),
        shadow: getComputedStyle(document.querySelector(".ar-mail")!).boxShadow,
      }));
      expect(r).toEqual({ y26: true, chip: "none", acc: "#F27141", shadow: "none" });
    } finally { await a.close(); }
  }, 90000);
});

describe("the motifs", () => {
  it("mockup-frame pads the window with a brick panel, worn at the edge, symbols at two corners; symbol-field builds in handfuls", async () => {
    const s = await open([
      { id: "f", type: "mockup-frame", data: { window: { x: 0.5, y: 0.5, w: 0.74, h: 0.66 } } },
      { id: "sf", type: "symbol-field", data: { shape: "cluster", reveal: "handfuls", at: 0.5, handfuls: 4, step: 0.2, flips: false } },
    ], { dur: 3 });
    try {
      await seek(s.page, 0.2);
      const r = await s.page.evaluate(() => {
        const root = document.querySelector(".mkf")!, panel = document.querySelector(".mkf-panel") as HTMLElement;
        return { win: root.getAttribute("data-window-box"), bg: panel.style.background, worn: panel.style.filter, tr: document.querySelectorAll(".mkf-tr g").length, bl: document.querySelectorAll(".mkf-bl g").length };
      });
      expect(r.win).toBe("0.5,0.5,0.74,0.66");
      expect(r.bg).toBe("rgb(163, 71, 53)");
      expect(r.worn).toMatch(/^url\("?#mkf-worn-/);
      expect(r.tr).toBeGreaterThan(20);
      expect(r.bl).toBeGreaterThan(10);
      const shown = async (t: number) => { await seek(s.page, t); return s.page.evaluate(() => [...document.querySelectorAll(".sfx-box g")].filter((g) => getComputedStyle(g).visibility !== "hidden").length); };
      const n0 = await shown(0.4), n1 = await shown(0.75), n2 = await shown(1.2), total = await s.page.evaluate(() => document.querySelectorAll(".sfx-box g").length);
      expect(n0).toBe(0);
      expect(n1).toBeGreaterThan(0);
      expect(n1).toBeLessThan(total);
      expect(n2).toBe(total);
    } finally { await s.close(); }
  }, 60000);

  it("symbol-gather: the word in symbols flies into the mark, ripples, turns solid and takes its tag", async () => {
    const s = await open([{ type: "symbol-gather", data: { speed: 0.5, end: "mark", solid_at: 2.6, tag: "getquotient.ai" } }], { dur: 4 });
    try {
      const st = async (t: number) => { await seek(s.page, t); return s.page.evaluate(() => {
        const gs = [...document.querySelectorAll(".sg-svg g")] as SVGGElement[];
        const ys = gs.filter((g) => g.style.opacity !== "0").map((g) => g.getBoundingClientRect()).map((r) => r.top + r.height / 2);
        return { n: gs.length, ySpread: Math.max(...ys) - Math.min(...ys), svg: getComputedStyle(document.querySelector(".sg-svg")!).visibility,
          solid: getComputedStyle(document.querySelector(".sg-solid")!).visibility, tag: getComputedStyle(document.querySelector(".sg-tag")!).visibility };
      }); };
      const word = await st(0.05), mark = await st(2.3), done = await st(3.6);
      // Mid-fill: the solid mark is clipped to a circle growing from the dot, symbols still showing outside it.
      await seek(s.page, 2.9);
      const mid = await s.page.evaluate(() => ({ clip: (document.querySelector(".sg-solid") as SVGElement).style.clipPath,
        live: [...document.querySelectorAll(".sg-svg g")].filter((g) => (g as SVGGElement).style.opacity !== "0").length }));
      expect(mid.clip).toMatch(/^circle\(/);
      expect(mid.live).toBeGreaterThan(0);
      expect(word.n).toBeGreaterThan(300);
      expect(word.svg).toBe("visible");
      // The word is wide and short; the mark is tall.
      expect(mark.ySpread).toBeGreaterThan(word.ySpread * 1.5);
      expect(done).toMatchObject({ svg: "hidden", solid: "visible", tag: "visible" });
    } finally { await s.close(); }
  }, 60000);

  it("quotient-lockup: a plus becomes the mark, then the wordmark cuts in a letter at a time", async () => {
    const s = await open([{ type: "quotient-lockup", data: { at: 0, build: 2, letter_step: 0.1, tag: "getquotient.ai" } }], { dur: 5 });
    try {
      const st = async (t: number) => { await seek(s.page, t); return s.page.evaluate(() => ({
        sym: Number((document.querySelector(".ql-symbol") as SVGElement).style.opacity),
        mark: (document.querySelector(".ql-mark") as SVGElement).style.opacity,
        letters: [...document.querySelectorAll(".ql-letter")].filter((l) => (l as SVGElement).style.visibility !== "hidden").length,
        tag: getComputedStyle(document.querySelector(".ql-tag")!).visibility,
      })); };
      expect(await st(0.1)).toEqual({ sym: 1, mark: "0", letters: 0, tag: "hidden" });
      const done = await st(2.1);
      expect(done.mark).toBe("1");
      expect(done.sym).toBe(0);
      expect((await st(2.45)).letters).toBe(3);   // letters from 2.25, one every 0.1
      expect(await st(4)).toEqual({ sym: 0, mark: "1", letters: 8, tag: "visible" });
    } finally { await s.close(); }
  }, 60000);
});
