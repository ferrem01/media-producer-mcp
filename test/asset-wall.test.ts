import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { measureTextContrast } from "../src/core/text-contrast.js";

// The Moda launch film (Oct 9, Marc: "the color and design makes any video
// pop"): designed sample work drifting past (asset-wall), AI agents as named
// cursors (agent-cursor), and our own email editor building a beautiful
// sample brand's email under them.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, "../src/components");
const src = (cat: string, type: string) => fs.readFile(path.join(LIB, cat, `${type}.component.html`), "utf-8");

async function write(components: any[], W = 1920, H = 1080, dur = 6) {
  const scene = { id: "s", label: "s", duration_seconds: dur, background: "#ffffff", components };
  const html = await assembleScene({ scene: scene as any,
    components: [
      { type: "asset-wall", source: await src("media", "asset-wall") },
      { type: "agent-cursor", source: await src("effects", "agent-cursor") },
      { type: "quotient-email-editor", source: await src("mockups", "quotient-email-editor") },
    ],
    brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H, fps: 30 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap") } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "awall-"));
  const htmlPath = path.join(tmp, "s.html");
  await fs.writeFile(htmlPath, html);
  return { htmlPath, tmp };
}
async function boot(components: any[], W = 1920, H = 1080) {
  const { htmlPath, tmp } = await write(components, W, H);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`file://${htmlPath}`, { waitUntil: "commit" });
  await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000, polling: 100 });
  const at = (t: number) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
  return { page, at, done: async () => { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }); } };
}
const FULL = { x: 0, y: 0, width: "100%", height: "100%" };

describe("designed sample work (shared/samples.js)", () => {
  it("every brand draws every kind, and a pick never puts the same card next to itself", async () => {
    const code = await fs.readFile(path.join(LIB, "shared", "samples.js"), "utf-8");
    const win: any = {};
    new Function("window", code)(win);
    const S = win.mpSamples;
    expect(S.brands.length).toBe(8);
    for (const b of S.brands) for (const k of S.kinds) {
      const html = S.asset(k, b.id);
      expect(html).toContain(`mps-${k}`);
      expect(html.length).toBeGreaterThan(400);
    }
    const picks = S.pick(60, { seed: 3 });
    for (let i = 1; i < picks.length; i++) expect(`${picks[i].kind}/${picks[i].brand}`).not.toBe(`${picks[i - 1].kind}/${picks[i - 1].brand}`);
    expect(new Set(picks.slice(0, 48).map((p: any) => `${p.kind}/${p.brand}`)).size).toBe(48);
    const em = S.emailBlocks("oliva");
    expect(em.brand.name).toBe("Oliva Terra");
    expect(em.blocks.map((b: any) => b.kind)).toEqual(["logo", "hero", "eyebrow", "headline", "text", "button", "footer"]);
  });
});

describe("asset wall", () => {
  it("wall: cards drift across a gradient, an open band carries the headline", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { headline: "1,000 brands for FREE" } }]);
    try {
      await at(1);
      const a = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".aw-card"));
        const h = document.querySelector(".aw-head")!;
        // The words themselves (the block spans the slot, which the ambient
        // camera overscans past the frame).
        const rg = document.createRange(); rg.selectNodeContents(h); const hr = rg.getBoundingClientRect();
        return { n: cards.length, first: cards[0].getBoundingClientRect().left, head: { l: hr.left, r: hr.right, op: Number(getComputedStyle(h).opacity) },
          ground: getComputedStyle(document.querySelector(".aw-ground")!).backgroundImage };
      });
      await at(5);
      const b = await page.evaluate(() => document.querySelectorAll(".aw-card")[0].getBoundingClientRect().left);
      expect(a.n).toBeGreaterThan(12);
      expect(a.ground).toContain("linear-gradient");
      expect(a.head.op).toBe(1);
      expect(a.head.l).toBeGreaterThan(0);
      expect(a.head.r).toBeLessThan(1920);
      expect(b).toBeLessThan(a.first - 20); // drifting
    } finally { await done(); }
  }, 60000);

  it("grid: the same piece for many brands, every card inside the frame, landing in a wave", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { layout: "grid", count: 9, headline: "50 personalized sales decks" } }]);
    try {
      await at(3);
      const r = await page.evaluate(() => Array.from(document.querySelectorAll(".aw-card")).map((c) => { const b = c.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, slide: !!c.querySelector(".mps-slide") }; }));
      expect(r.length).toBe(9);
      for (const c of r) { expect(c.slide).toBe(true); expect(c.l).toBeGreaterThanOrEqual(0); expect(c.t).toBeGreaterThan(80); expect(c.r).toBeLessThanOrEqual(1920); expect(c.b).toBeLessThanOrEqual(1080); }
    } finally { await done(); }
  }, 60000);

  it("orbit: cards stay in the side columns, clear of the face", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { layout: "orbit", count: 6 } }]);
    try {
      await at(3);
      const r = await page.evaluate(() => Array.from(document.querySelectorAll(".aw-card")).map((c) => { const b = c.getBoundingClientRect(); return { l: b.left, r: b.right }; }));
      expect(r.length).toBe(6);
      for (const c of r) expect(c.r < 1920 * 0.36 || c.l > 1920 * 0.64).toBe(true);
    } finally { await done(); }
  }, 60000);

  it("grey tone drains the colour (the enemy's work)", async () => {
    const { page, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { tone: "grey" } }]);
    try {
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".aw-plane")!).filter)).toContain("grayscale(1)");
    } finally { await done(); }
  }, 60000);

  it("the drawn cards are a picture to the gates: cropped at the frame on purpose, never flagged as clipped copy", async () => {
    const { htmlPath, tmp } = await write([{ id: "wall", type: "asset-wall", position: FULL, data: { headline: "1,000 brands for FREE" } }]);
    try {
      const defects = await measureTextContrast({ htmlPath, width: 1920, height: 1080, atTimes: [3, 5] });
      expect(defects).toEqual([]);
    } finally { await fs.rm(tmp, { recursive: true, force: true }); }
  }, 90000);
});

describe("agent cursors over the editor building a sample brand's email", () => {
  it("the email is the sample brand's, and each agent lands on the block it names", async () => {
    const { page, at, done } = await boot([
      { id: "email", type: "quotient-email-editor", position: { x: "12%", y: "9%", width: "76%", height: "82%" }, z_index: 5, data: { sample: "flowpath", at: 0.3, write_time: 3.2 } },
      { id: "agents", type: "agent-cursor", position: FULL, z_index: 20, data: { cursors: [
        { label: "Design Agent", color: "#e2187b", path: [{ at: 1.4, target: "email.headline" }, { at: 3.6, target: "email.button", click: true }] }] } },
    ]);
    try {
      await at(4.2);
      const m = await page.evaluate(() => {
        const btn = document.querySelector('[data-cid="email"] [data-anchor="button"]')!.getBoundingClientRect();
        const arrow = document.querySelector(".ac-arrow")!.getBoundingClientRect();
        const tag = document.querySelector(".ac-tag")!;
        return { btn: { l: btn.left, t: btn.top, r: btn.right, b: btn.bottom }, tip: { x: arrow.left, y: arrow.top }, tag: tag.textContent, tagW: tag.getBoundingClientRect().width,
          logo: document.querySelector('[data-cid="email"]')!.textContent!.includes("Flowpath"), headline: document.querySelector('[data-cid="email"]')!.textContent!.includes("Your Q3 plan, built in seconds") };
      });
      expect(m.logo).toBe(true);
      expect(m.headline).toBe(true);
      expect(m.tag).toBe("Design Agent");
      expect(m.tagW).toBeGreaterThan(120); // a whole name tag, not a clipped dot
      expect(m.tip.x).toBeGreaterThanOrEqual(m.btn.l - 4);
      expect(m.tip.x).toBeLessThanOrEqual(m.btn.r);
      expect(m.tip.y).toBeGreaterThanOrEqual(m.btn.t - 4);
      expect(m.tip.y).toBeLessThanOrEqual(m.btn.b);
    } finally { await done(); }
  }, 60000);
});

describe("the founder-launch recipe", () => {
  it("loads under creator-cut as a talking-head format, with quiet captions", async () => {
    const { getRecipe } = await import("../src/core/recipes.js");
    const r = getRecipe("founder-launch")!;
    expect(r.grammar).toBe("creator-cut");
    expect(r.format).toBe("talking-head");
    expect(r.spine.map((b) => b.role)).toEqual(["money", "what", "range", "problem", "agents", "difference", "scale", "range_2", "enemy", "belief", "offer"]);
    expect((r.layers as any).captions.style).toBe("quiet");
    const { captionLane } = await import("../src/core/captions.js");
    const spine = { source: "measured", duration: 3, words: [{ text: "We", start: 0, end: 0.3 }, { text: "just", start: 0.3, end: 0.6 }, { text: "raised", start: 0.6, end: 1 }, { text: "money.", start: 1, end: 1.5 }] } as any;
    const lane = captionLane(spine, [], { style: "quiet" })!;
    expect(lane.data.max_font).toBe(40);
    expect(lane.data.scrim).toBe("plate");
  });
});
