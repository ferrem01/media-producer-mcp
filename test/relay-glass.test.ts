import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Relay v2 ("develop." recreation), the Glass beats: a glass word melts into
// a droplet -> toolbar -> slider that relights the photo -> the knob becomes a
// lens, an orb carrying the next photo, which floods the frame; then that
// photo is a lock screen (glass clock, a home bar stretching into a glass
// player) that pulls back into a phone on a silk stage. Square 1:1 frame.
// RELAY_GLASS_SHOTS=<dir> keeps the stills; RELAY_GLASS_IMGS=<dir> uses real
// photos (arch_day.jpg, arch_golden.jpg, astronaut.jpg) instead of flat fills.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIZE = 1080;
const svg = (a: string, b: string) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="170" r="60" fill="#fff" opacity="0.5"/></svg>`);
const IMG = process.env.RELAY_GLASS_IMGS
  ? { day: `file://${process.env.RELAY_GLASS_IMGS}/arch_day.jpg`, gold: `file://${process.env.RELAY_GLASS_IMGS}/arch_golden.jpg`, next: `file://${process.env.RELAY_GLASS_IMGS}/astronaut.jpg` }
  : { day: svg("#5b8fd6", "#3f7a2c"), gold: svg("#f39a3c", "#6b3a12"), next: svg("#7fa37a", "#27401f") };

async function still(comps: Array<{ type: string; dir: string; data: unknown }>, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, duration = 6) {
  const sources: Array<{ type: string; source: string }> = [];
  for (const c of comps) if (!sources.some((s) => s.type === c.type)) sources.push({ type: c.type, source: await fs.readFile(path.resolve(__dirname, `../src/components/${c.dir}/${c.type}.component.html`), "utf-8") });
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: duration, background: "#efeeea", components: comps.map((c, i) => ({ id: "c" + i, type: c.type, data: c.data, position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 10 + i })) } as any,
    components: sources, brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any, canvas: { width: SIZE, height: SIZE } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "relay-glass-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
    // No web-font fetches in CI: the components fall back to the brand font.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    // Measure the components' own geometry: park the scene's ambient Ken Burns drift.
    await page.evaluate(() => { const g = (window as any).gsap, cam = document.querySelector(".mp-camera"); g.getTweensOf(cam).forEach((t: any) => t.kill()); g.set(cam, { clearProps: "transform" }); });
    await run(page, async (t) => { await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t); });
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
const shot = async (page: Page, name: string) => { if (process.env.RELAY_GLASS_SHOTS) await page.screenshot({ path: path.join(process.env.RELAY_GLASS_SHOTS, name) }); };
const box = (page: Page, sel: string) => page.evaluate((s) => {
  const n = document.querySelector(s) as HTMLElement | null;
  if (!n) return null;
  const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, o: +cs.opacity, vis: cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05 && r.width > 0 };
}, sel);
// A shape inside a glass SVG (mask shapes are laid out in the box's own px).
const shape = (page: Page, sel: string) => page.evaluate((s) => {
  const n = document.querySelector(s) as SVGGraphicsElement | null;
  if (!n) return null;
  const a = (k: string) => +(n.getAttribute(k) || 0);
  const svgEl = n.closest("svg") as SVGSVGElement, m = svgEl.getScreenCTM()!;
  const x = a("x") + a("width") / 2, y = a("y") + a("height") / 2;
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, w: a("width") * m.a, h: a("height") * m.d, shown: n.getAttribute("display") !== "none" && svgEl.style.display !== "none" };
}, sel);

const RELIGHT = { image: IMG.day, image_after: IMG.gold, next_image: IMG.next, word: "relight.", slider_label: "Golden hour" };

describe("glass-relight: a glass word -> droplet -> toolbar -> slider -> lens -> orb -> the next photo", () => {
  it("pops the letters in order, melts them into one droplet that becomes a toolbar at the bottom", async () => {
    await still([{ type: "glass-relight", dir: "media", data: RELIGHT }], async (page, seek) => {
      await seek(0);
      // the photo covers the frame (a full-frame slot overhangs it: the camera layer)
      const day = await box(page, ".grl-day");
      expect(day!.l).toBeLessThanOrEqual(0); expect(day!.t).toBeLessThanOrEqual(0);
      expect(day!.l + day!.w).toBeGreaterThanOrEqual(SIZE); expect(day!.t + day!.h).toBeGreaterThanOrEqual(SIZE);
      expect((await box(page, ".grl-next"))!.vis).toBe(false);
      expect(await page.evaluate(() => (document.querySelector(".grl-glass-a") as SVGElement).style.display)).toBe("none");
      const letters = () => page.evaluate(() => [...document.querySelectorAll(".grl-glass-a mask text")].map((n) => ({ ch: n.textContent, on: n.getAttribute("display") !== "none" })));
      // letter i pops at word_at + 0.05 i: three letters at 0.36, all of them by 0.7
      await seek(0.36);
      const a = await letters();
      expect(a.map((l) => l.ch).join("")).toBe("relight.");
      expect(a.map((l) => l.on)).toEqual([true, true, true, false, false, false, false, false]);
      await seek(0.75);
      await shot(page, "relight-word.png");
      expect((await letters()).every((l) => l.on)).toBe(true);
      // one droplet, falling
      await seek(1.24);
      await shot(page, "relight-droplet.png");
      expect((await letters()).every((l) => !l.on)).toBe(true);
      const drop = await shape(page, ".grl-glass-a mask rect");
      expect(drop!.shown).toBe(true);
      expect(drop!.w).toBeLessThan(SIZE * 0.1);
      expect(drop!.h).toBeLessThan(SIZE * 0.12);
      // a toolbar at the bottom centre with its four icons
      await seek(1.95);
      await shot(page, "relight-toolbar.png");
      const bar = await box(page, ".grl-ui");
      expect(bar!.vis).toBe(true);
      expect(Math.abs(bar!.x - SIZE / 2)).toBeLessThan(4);
      expect(bar!.y).toBeGreaterThan(SIZE * 0.85);
      expect(bar!.w / bar!.h).toBeGreaterThan(6);
      expect(bar!.w).toBeGreaterThan(SIZE * 0.6);
      expect(bar!.w).toBeLessThan(SIZE * 0.8);
      const icons = await page.evaluate(() => [...document.querySelectorAll(".grl-ico")].map((n) => +getComputedStyle(n).opacity));
      expect(icons).toEqual([1, 1, 1, 1]);
    });
  }, 90000);

  it("drags the slider 0 -> 100 and the photo relights with it; the knob lifts into an orb with the next photo; it floods the frame", async () => {
    await still([{ type: "glass-relight", dir: "media", data: RELIGHT }], async (page, seek) => {
      const read = () => page.evaluate(() => ({
        val: document.querySelector(".grl-value")!.textContent, fill: (document.querySelector(".grl-fill") as HTMLElement).offsetWidth,
        track: (document.querySelector(".grl-track") as HTMLElement).offsetWidth, after: +getComputedStyle(document.querySelector(".grl-after")!).opacity,
        label: document.querySelector(".grl-label-t")!.textContent,
      }));
      await seek(0);
      const day0 = await box(page, ".grl-day");
      await seek(2.72);
      await shot(page, "relight-slider0.png");
      const s0 = await read();
      expect(s0.label).toBe("Golden hour");
      expect(s0.val).toBe("0");
      expect(s0.after).toBe(0);
      const knob0 = await shape(page, ".grl-glass-b mask rect");
      expect(knob0!.shown).toBe(true);
      await seek(3.4);
      const mid = await read();
      expect(+mid.val!).toBeGreaterThan(20); expect(+mid.val!).toBeLessThan(80);
      expect(Math.abs(mid.after - +mid.val! / 100)).toBeLessThan(0.011);
      await seek(4.1);
      await shot(page, "relight-slider100.png");
      const s1 = await read();
      expect(s1.val).toBe("100");
      expect(s1.after).toBe(1);
      expect(s1.fill).toBeGreaterThan(s1.track * 0.9);
      const knob1 = await shape(page, ".grl-glass-b mask rect");
      expect(knob1!.x - knob0!.x).toBeGreaterThan(SIZE * 0.5);
      // the lens, then the orb at the upper middle carrying the next photo (camera back at 1 by now)
      await seek(4.35);
      await shot(page, "relight-lens.png");
      const lens = await shape(page, ".grl-glass-b mask rect");
      expect(Math.abs(lens!.w - lens!.h)).toBeLessThan(SIZE * 0.03);
      await seek(4.88);
      await shot(page, "relight-orb.png");
      const orb = await shape(page, ".grl-glass-b mask rect");
      expect(Math.abs(orb!.x - SIZE * 0.5)).toBeLessThan(SIZE * 0.01);
      expect(Math.abs(orb!.y - SIZE * 0.36)).toBeLessThan(SIZE * 0.01);
      expect(Math.abs(orb!.w - SIZE * 0.28)).toBeLessThan(SIZE * 0.01);
      const iris = await page.evaluate(() => {
        const c = document.querySelector(".grl-glass-b clipPath circle")!;
        const img = document.querySelector(".grl-glass-b g[clip-path] image")!;
        return { r: +c.getAttribute("r")!, shown: (img.parentNode as Element).getAttribute("display") !== "none", href: img.getAttribute("href") };
      });
      expect(iris.shown).toBe(true);
      expect(iris.href).toBe(IMG.next);
      expect(iris.r).toBeGreaterThan(SIZE * 0.13);
      // the last frame: the next photo, full frame, nothing else
      await seek(5.3);
      await shot(page, "relight-end.png");
      const nx = await box(page, ".grl-next");
      expect(nx!.vis).toBe(true);
      expect(nx!.l).toBeLessThanOrEqual(0); expect(nx!.t).toBeLessThanOrEqual(0);
      expect(nx!.l + nx!.w).toBeGreaterThanOrEqual(SIZE); expect(nx!.t + nx!.h).toBeGreaterThanOrEqual(SIZE);
      // ...exactly where the day photo sat: the same box, so the next scene's full-frame photo matches it
      expect(nx!.w).toBeCloseTo(day0!.w, 1); expect(nx!.l).toBeCloseTo(day0!.l, 1); expect(nx!.t).toBeCloseTo(day0!.t, 1);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".grl-next")!).objectFit)).toBe("cover");
      expect(await page.evaluate(() => [(document.querySelector(".grl-glass-a") as SVGElement).style.display, (document.querySelector(".grl-glass-b") as SVGElement).style.display])).toEqual(["none", "none"]);
      // Scrubbing back undoes it: pure function of time.
      await seek(2.72);
      expect((await read()).val).toBe("0");
      expect((await box(page, ".grl-next"))!.vis).toBe(false);
    });
  }, 90000);
});

describe("glass-lockscreen: a lock screen that pulls back into a phone", () => {
  const LOCK = { wallpaper: IMG.next, date: "Friday, September 25", time: "9:41", track: "motion study 04", artist: "made in code" };
  it("shows the glass clock and the player, presses play, and lands on the phone geometry", async () => {
    await still([{ type: "glass-lockscreen", dir: "mockups", data: LOCK }], async (page, seek) => {
      await seek(0);
      // the wallpaper starts as a full-frame photo: the screen covers the frame, no bezel, no corners
      const full = await box(page, ".gls-wall");
      expect(full!.l).toBeLessThanOrEqual(0); expect(full!.t).toBeLessThanOrEqual(0);
      expect(full!.l + full!.w).toBeGreaterThanOrEqual(SIZE); expect(full!.t + full!.h).toBeGreaterThanOrEqual(SIZE);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".gls-screen")!).borderTopLeftRadius)).toBe("0px");
      expect((await box(page, ".gls-island"))!.vis).toBe(false);
      await seek(1.0);
      await shot(page, "lock-clock.png");
      expect(await page.evaluate(() => [...document.querySelectorAll(".gls-glass-d mask text")].map((n) => n.getAttribute("display") !== "none"))).toEqual([true, true, true, true]);
      const date = await box(page, ".gls-date");
      expect(date!.vis).toBe(true);
      expect(date!.y).toBeLessThan(SIZE * 0.2);
      expect(await page.evaluate(() => document.querySelector(".gls-date")!.textContent)).toBe("Friday, September 25");
      await seek(1.5);
      await shot(page, "lock-player.png");
      const pl = await box(page, ".gls-player");
      expect(pl!.vis).toBe(true);
      expect(Math.abs(pl!.x - SIZE / 2)).toBeLessThan(3);
      expect(pl!.y).toBeGreaterThan(SIZE * 0.75);
      expect(pl!.w).toBeGreaterThan(SIZE * 0.55);
      expect((await box(page, ".gls-home"))!.vis).toBe(true);
      expect(await page.evaluate(() => document.querySelector(".gls-track")!.textContent)).toBe("motion study 04");
      const icon = () => page.evaluate(() => [getComputedStyle(document.querySelector(".gls-i-play")!).display, getComputedStyle(document.querySelector(".gls-i-pause")!).display]);
      expect(await icon()).toEqual(["block", "none"]);
      await seek(1.8);
      expect(await icon()).toEqual(["none", "block"]);
      // after the pull-back: the phone contract
      await seek(2.75);
      await shot(page, "lock-phone.png");
      const ph = await box(page, ".gls-phone");
      const H = SIZE * 0.52, Wd = H * 0.485;
      expect(Math.abs(ph!.x - SIZE * 0.5)).toBeLessThan(SIZE * 0.01);
      expect(Math.abs(ph!.y - SIZE * 0.5)).toBeLessThan(SIZE * 0.01);
      expect(Math.abs(ph!.h - H)).toBeLessThan(H * 0.01);
      expect(Math.abs(ph!.w - Wd)).toBeLessThan(Wd * 0.01);
      const rad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".gls-phone")!).borderTopLeftRadius));
      expect(Math.abs(rad - Wd * 0.11)).toBeLessThan(Wd * 0.01);
      const sc = await box(page, ".gls-screen");
      expect(Math.abs(sc!.l - ph!.l - SIZE * 0.012)).toBeLessThan(1);
      expect(Math.abs(sc!.w - (Wd - 2 * SIZE * 0.012))).toBeLessThan(Wd * 0.01);
      const isl = await box(page, ".gls-island");
      expect(isl!.vis).toBe(true);
      expect(Math.abs(isl!.x - SIZE * 0.5)).toBeLessThan(2);
      expect(isl!.t).toBeGreaterThan(sc!.t);
      expect(isl!.t - sc!.t).toBeLessThan(sc!.h * 0.05);
      // the lock screen is still on it, scaled down
      expect((await box(page, ".gls-player"))!.w).toBeLessThan(sc!.w);
      expect(await page.evaluate(() => [...document.querySelectorAll(".gls-glass-d mask text")].every((n) => n.getAttribute("display") !== "none"))).toBe(true);
    }, 4);
  }, 90000);
});
