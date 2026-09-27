import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// The "develop." relay recreation, 13.5-21.5 s of the reference: the lock
// screen's phone steps aside and its island grows into a Mac window
// (desktop-stage), the dropped wallpaper becomes a framed print that is
// ordered (print-shop), and the order button's one black shape morphs
// through its states (status-morph). Square 1:1 frame, like the film.
// Set RELAY_SHOTS=<dir> to keep a still at every beat.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const S = 1080;
const px = (color: string, w = 300, h = 400) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#c46a2a"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.6}" cy="${h * 0.25}" r="${w * 0.12}" fill="#f4e7b0"/></svg>`);
const IMG = process.env.RELAY_IMG || px("#5f7a52");

type Comp = { type: string; dir: string; data: unknown; position?: unknown };
async function still(comps: Comp[], run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, duration = 6) {
  const sources: Array<{ type: string; source: string }> = [];
  for (const c of comps) if (!sources.some((s) => s.type === c.type)) sources.push({ type: c.type, source: await fs.readFile(path.resolve(__dirname, `../src/components/${c.dir}/${c.type}.component.html`), "utf-8") });
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: duration, background: "#efeeea", components: comps.map((c, i) => ({ id: "c" + i, type: c.type, data: c.data, position: c.position || { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 10 + i })) } as any,
    components: sources, brandKit: { colors: { primary: "#0b0b0c", background: "#efeeea", text: "#0b0b0c" }, fonts: [] } as any, canvas: { width: S, height: S } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "relay-shop-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  // RELAY_PROXY=1 routes the stills through the sandbox's egress proxy so
  // the Google Fonts faces load (a still harness nicety; CI never sets it).
  const proxy = process.env.RELAY_PROXY && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, proxy });
  try {
    const page = await browser.newPage({ viewport: { width: S, height: S }, ignoreHTTPSErrors: !!proxy });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && /createTimeline crashed/.test(m.text())) errors.push(m.text()); });
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    // The scene's own Ken Burns drift would move every measured box a few
    // pixels; the handoff geometry is the component's, so hold the camera still.
    await page.evaluate(() => {
      const cam = document.querySelector(".mp-camera");
      (window as any).__MP_TIMELINE.getTweensOf(cam).forEach((t: any) => t.kill());
      (window as any).gsap.set(cam, { scale: 1, x: 0, y: 0 });
    });
    await run(page, async (t) => { await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t); });
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
const shot = async (page: Page, name: string) => { if (process.env.RELAY_SHOTS) await page.screenshot({ path: path.join(process.env.RELAY_SHOTS, name) }); };
type Box = { x: number; y: number; w: number; h: number; l: number; t: number; o: number; vis: boolean };
const boxes = (page: Page, sel: string): Promise<Box[]> => page.evaluate((s) => [...document.querySelectorAll(s)].map((n) => {
  const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
  let vis = cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05;
  for (let p = n.parentElement; p && vis; p = p.parentElement) { const ps = getComputedStyle(p); if (ps.display === "none" || +ps.opacity < 0.05) vis = false; }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, o: +cs.opacity, vis };
}), sel);
const box = async (page: Page, sel: string) => (await boxes(page, sel))[0];
const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);
// Fractions of the component's own box (the scene camera bleeds 20 px past
// the viewport, so a full-frame component box is a little larger than it).
const inFrame = async (page: Page, rootSel: string, sel: string) => {
  const f = await box(page, rootSel), b = await box(page, sel);
  return { ...b, x: (b.x - f.l) / f.w, y: (b.y - f.t) / f.h, w: b.w / f.w, h: b.h / f.h, l: (b.l - f.l) / f.w, t: (b.t - f.t) / f.h };
};

describe("desktop-stage: phone -> island -> Mac window -> Safari -> the drop", () => {
  it("starts on the phone geometry, grows the window, drags the wallpaper into the drop zone and lands it as the hero", async () => {
    await still([{ type: "desktop-stage", dir: "ui-mocks", data: { wallpaper: IMG } }], async (page, seek) => {
      const at = (sel: string) => inFrame(page, ".dst", sel);
      await seek(0);
      await shot(page, "dst-0.00.png");
      const phone = await at(".dst-phone");
      near(phone.x, 0.5, 0.002); near(phone.y, 0.5, 0.002);
      near(phone.h, 0.52, 0.002); near(phone.w, 0.52 * 0.485, 0.002);
      expect((await at(".dst-win")).vis).toBe(false);
      expect((await at(".dst-hero")).vis).toBe(false);
      const times = process.env.RELAY_SHOTS ? [0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 0.95, 1.1, 1.25, 1.45, 1.65, 1.85, 1.95, 2.05, 2.2, 2.35, 2.5, 2.65, 3.0] : [];
      for (const t of times) { await seek(t); await shot(page, `dst-${t.toFixed(2)}.png`); }
      // The phone stepped aside; the window is up and the blind has rolled away.
      await seek(1.3);
      const win = await at(".dst-win");
      expect(win.vis).toBe(true);
      near(win.w, 0.57, 0.003);
      expect((await at(".dst-blind")).vis).toBe(false);
      expect(await page.evaluate(() => document.querySelector(".dst-start")!.textContent)).toContain("Favorites");
      expect((await boxes(page, ".dst-fav")).length).toBe(6);
      expect((await at(".dst-phone")).x).toBeLessThan(0.25);
      // The thumbnail sits inside the drop zone just before the drop.
      await seek(2.2);
      const th = await at(".dst-hero"), dz = await at(".dst-drop");
      expect(th.vis && dz.vis).toBe(true);
      expect(Math.abs(th.x - dz.x)).toBeLessThan(dz.w / 2);
      expect(Math.abs(th.y - dz.y)).toBeLessThan(dz.h / 2);
      expect(th.w).toBeLessThan(dz.w);
      expect((await at(".dst-badge")).w).toBeGreaterThan(0.015);
      // After the drop: the hero sits in the landing page, the window fills the frame.
      await seek(3.2);
      await shot(page, "dst-end.png");
      const hero = await at(".dst-hero");
      const hb = (await page.evaluate(() => document.querySelector(".dst")!.getAttribute("data-hero-box")))!.split(",").map(Number);
      expect(hero.vis).toBe(true);
      // the contract print-shop is built on (see desktop-stage.schema.json)
      [0.5489, 0.2912, 0.3915, 0.4525].forEach((v, i) => near(hb[i], v, 0.0015));
      near(hero.l, hb[0], 0.003); near(hero.t, hb[1], 0.003); near(hero.w, hb[2], 0.003); near(hero.h, hb[3], 0.003);
      const w2 = await at(".dst-win");
      expect(w2.w).toBeGreaterThan(0.95);
      near(w2.l, 0.015, 0.003);
      expect((await at(".dst-drop")).vis).toBe(false);
      const p2 = await at(".dst-phone");
      expect(p2.l + p2.w).toBeLessThan(0);
    }, 4);
  }, 90000);
});

const visibleText = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)]
  .filter((l) => getComputedStyle(l).visibility !== "hidden" && +getComputedStyle(l).opacity > 0.05)
  .map((l) => {
    const words: string[] = [], w = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = (n.textContent || "").trim(); if (t) words.push(t); }
    return words.join(" ");
  }).join("|"), sel);
// Scrub through [from, to] and check the shape's visible text passes through
// `want` in order (the percentage is normalised to "%").
async function statesInOrder(page: Page, seek: (t: number) => Promise<void>, sel: string, from: number, to: number, want: string[]) {
  const seen: string[] = [];
  for (let t = from; t <= to; t += 0.05) {
    await seek(t);
    const s = (await visibleText(page, sel)).replace(/\d+%/, "%");
    if (s && seen[seen.length - 1] !== s) seen.push(s);
  }
  let k = 0;
  for (const s of seen) if (k < want.length && s.includes(want[k])) k++;
  expect(k, `seen: ${seen.join(" -> ")}`).toBe(want.length);
}

describe("print-shop: the hero becomes a framed print, is ordered, and the button morphs to a done circle", () => {
  it("frames the photo with a mat, paints the molding black, runs the button through its states and ends on the done geometry", async () => {
    await still([{ type: "print-shop", dir: "ui-mocks", data: { image: IMG } }], async (page, seek) => {
      const at = (sel: string) => inFrame(page, ".psh", sel);
      await seek(0);
      await shot(page, "psh-0.00.png");
      // It starts exactly where desktop-stage ends: the same window, the same hero box.
      const w0 = await at(".psh-win");
      near(w0.l, 0.015, 0.003); near(w0.w, 0.969, 0.004);
      expect(await visibleText(page, ".psh-layer")).toBe("Order");
      const times = process.env.RELAY_SHOTS ? [0.35, 0.5, 0.65, 0.9, 1.1, 1.3, 1.4, 1.6, 1.85, 2.05, 2.25, 2.45, 2.7, 3.0, 3.4, 3.8, 4.1, 4.3, 4.6, 4.85, 5.0] : [];
      for (const t of times) { await seek(t); await shot(page, `psh-${t.toFixed(2)}.png`); }
      // After the scroll: a portrait print with a white mat inside a molding.
      await seek(1.1);
      const ph = await at(".psh-photo"), mat = await at(".psh-mat"), pr = await at(".psh-print");
      expect(ph.h).toBeGreaterThan(ph.w);
      expect(mat.w).toBeGreaterThan(ph.w * 1.2);
      expect(pr.w).toBeGreaterThan(mat.w);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".psh-mat")!).backgroundColor)).toMatch(/rgb\(25[0-5], 25[0-5], 24\d\)/);
      // The nav's button has flown down into the full-width "Order print".
      await seek(1.6);
      expect(await visibleText(page, ".psh-layer")).toBe("Order print");
      const btn = await at(".psh-shape"), seg = await at(".psh-seg");
      near(btn.w, seg.w, 0.004);
      expect(btn.y).toBeGreaterThan(seg.y);
      // After the frame pick the black molding is painted all the way round.
      await seek(1.8);
      const mask = await page.evaluate(() => { const m = document.querySelector(".psh-mold-new") as HTMLElement; return m.style.maskImage || m.style.webkitMaskImage; });
      expect(mask).toContain("360");
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".psh-mold-new")!).backgroundImage)).toMatch(/rgb\(\d?\d, \d?\d, \d?\d\)/);
      // The button's text changes through the states, in order.
      await statesInOrder(page, seek, ".psh-layer", 2.0, 5.2, ["Order print", "Ordered", "Printing %", "On its way today"]);
      // The done circle ends on the done geometry, in frame coordinates.
      await seek(5.4);
      await shot(page, "psh-end.png");
      const done = await at(".psh-shape");
      near(done.x, 0.5, 0.004); near(done.y, 0.62, 0.004); near(done.w, 0.12, 0.004); near(done.h, 0.12, 0.004);
    }, 6);
  }, 120000);
});

describe("status-morph: one black shape through a list of states", () => {
  it("runs label -> spinner -> label -> progress -> route -> done in order and lands the circle on its geometry", async () => {
    await still([{ type: "status-morph", dir: "ui-mocks", data: { at: 0.2 } }], async (page, seek) => {
      const at = (sel: string) => inFrame(page, ".stm", sel);
      await seek(0);
      await shot(page, "stm-0.00.png");
      const p0 = await at(".stm-shape");
      near(p0.x, 0.5, 0.003); near(p0.y, 0.62, 0.003); near(p0.w, 0.44, 0.003);
      expect(await visibleText(page, ".stm-layer")).toBe("Order print");
      if (process.env.RELAY_SHOTS) for (const t of [0.4, 0.8, 1.3, 1.7, 2.3, 2.6, 3.3]) { await seek(t); await shot(page, `stm-${t.toFixed(2)}.png`); }
      // a spinner, and no words, just after the click
      await seek(0.5);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".stm-spin")!.parentElement!).visibility)).toBe("visible");
      await statesInOrder(page, seek, ".stm-layer", 0.1, 3.2, ["Order print", "Ordered", "Printing %", "On its way today"]);
      // the percentage counts to 100 before the route
      await seek(2.05);
      expect(await visibleText(page, ".stm-layer")).toContain("100%");
      await seek(3.6);
      const d = await at(".stm-shape");
      near(d.x, 0.5, 0.003); near(d.y, 0.62, 0.003); near(d.w, 0.12, 0.003); near(d.h, 0.12, 0.003);
      expect(await page.evaluate(() => document.querySelector(".stm-check path")!.getAttribute("stroke-dashoffset"))).toBe("0");
    }, 4);
  }, 90000);
});
