import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Relay v2 ("develop." recreation): the photo that unfolds into a library and
// zooms back to one photo, and the framed print on the wall. Square 1:1 frame.
// Handoff geometry is the contract between components (fractions of the frame):
// iris circle d=0.30 at the centre; full-frame photo = object-fit cover;
// framed print centre 0.5/0.5, outer 0.30 x 0.40.
// RELAY_SHOTS=<dir> keeps stills; RELAY_IMG_DIR=<dir> uses real photos
// (door.jpg earth.jpg ... astronaut.jpg, wall-sq.mp4) instead of flat swatches.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SZ = 1080;
const IMG_DIR = process.env.RELAY_IMG_DIR;
const swatch = (hue: number, w = 200, h = 200) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${hue},55%,45%)"/><circle cx="${w / 2}" cy="${h / 2}" r="${w / 5}" fill="hsl(${(hue + 180) % 360},60%,70%)"/></svg>`);
const NAMES = ["astronaut", "earth", "cyclist", "portrait", "door", "arch_day", "nebula", "desert", "crater"];
const GRID = IMG_DIR ? NAMES.map((n) => `file://${IMG_DIR}/${n}.jpg`) : NAMES.map((_, i) => swatch(i * 40));
const PRINT = IMG_DIR ? `file://${IMG_DIR}/astronaut.jpg` : swatch(100, 200, 300);

type Comp = { type: string; dir: string; data: unknown };
async function still(comps: Comp[], run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, duration = 6, background = "#efeeea") {
  const sources: Array<{ type: string; source: string }> = [];
  for (const c of comps) if (!sources.some((s) => s.type === c.type)) sources.push({ type: c.type, source: await fs.readFile(path.resolve(__dirname, `../src/components/${c.dir}/${c.type}.component.html`), "utf-8") });
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: duration, background, components: comps.map((c, i) => ({ id: "c" + i, type: c.type, data: c.data, position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 10 + i })) } as any,
    components: sources, brandKit: { colors: { primary: "#0b0b0c", background: "#efeeea", text: "#0b0b0c" }, fonts: [] } as any, canvas: { width: SZ, height: SZ } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "relay-gp-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--allow-file-access-from-files"] });
  try {
    const page = await browser.newPage({ viewport: { width: SZ, height: SZ } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))));
    // Seek the timeline; seek any <video> the way the capture does (data-start-at + t, or the data-mp-edl map).
    const seek = async (t: number) => {
      await page.evaluate(async (tt) => {
        (window as any).__MP_TIMELINE.time(tt);
        const vids = [...document.querySelectorAll("video")] as HTMLVideoElement[];
        await Promise.all(vids.map((v) => new Promise<void>((res) => {
          let target = Math.max(0, parseFloat(v.getAttribute("data-start-at") || "0") + tt);
          const edl = v.getAttribute("data-mp-edl");
          if (edl) {
            let acc = 0; target = -1;
            for (const s of JSON.parse(edl)) { const d = (s.src_end - s.src_start) / (s.rate || 1); if (tt < acc + d) { target = s.src_start + (tt - acc) * (s.rate || 1); break; } acc += d; }
          }
          if (target < 0 || v.readyState < 1) { res(); return; }
          const done = () => res();
          v.addEventListener("seeked", done, { once: true });
          setTimeout(done, 1500);
          v.currentTime = target;
        })));
      }, t);
    };
    await run(page, seek);
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
const shot = async (page: Page, name: string) => { if (process.env.RELAY_SHOTS) await page.screenshot({ path: path.join(process.env.RELAY_SHOTS, name) }); };
// RELAY_STRIP=1 (with RELAY_SHOTS) also writes a frame every 1/20 s across a window, for motion review.
const strip = async (page: Page, seek: (t: number) => Promise<void>, prefix: string, from: number, to: number, step = 0.05) => {
  if (!process.env.RELAY_SHOTS || !process.env.RELAY_STRIP) return;
  for (let i = 0, t = from; t <= to + 1e-9; i++, t = from + i * step) { await seek(t); await shot(page, `${prefix}-${String(i).padStart(3, "0")}.png`); }
};
// Boxes in FRACTIONS of the component's own box (the scene's ambient camera
// rig scales and pads the stage; the handoff contract is in component space).
type Box = { x: number; y: number; w: number; h: number; l: number; t: number; r: number; b: number; vis: boolean; radius: number };
const boxes = (page: Page, sel: string, rootSel: string): Promise<Box[]> => page.evaluate(([s, rs]) => {
  const R = document.querySelector(rs)!.getBoundingClientRect();
  const k = R.width / (document.querySelector(rs) as HTMLElement).offsetWidth;
  return [...document.querySelectorAll(s)].map((n) => {
    const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
    let vis = cs.visibility !== "hidden" && +cs.opacity > 0.05;
    for (let p: Element | null = n.parentElement; p && vis; p = p.parentElement) { const pc = getComputedStyle(p); if (pc.visibility === "hidden" || +pc.opacity < 0.05) vis = false; }
    const fx = (v: number) => (v - R.left) / R.width, fy = (v: number) => (v - R.top) / R.height;
    return { x: fx(r.left + r.width / 2), y: fy(r.top + r.height / 2), w: r.width / R.width, h: r.height / R.height, l: fx(r.left), t: fy(r.top), r: fx(r.right), b: fy(r.bottom), vis, radius: (parseFloat(cs.borderTopLeftRadius) || 0) * k / R.width };
  });
}, [sel, rootSel] as const);
const pu = (page: Page, sel = ".pu-tile") => boxes(page, sel, ".pu");

// Beats (defaults relative to at): square at+0.05, shrink at+0.45, unfold at+0.7,
// corners at+0.95, bento at+1.9, zoom at+2.7 landing at+3.05.
const AT = 0.5;
const E = 0.002; // tolerance, fraction of the frame (~2px at 1080)
describe("photo-unfold: circle -> square -> tile -> 3x3 map -> bento -> full-frame zoom", () => {
  it("starts on the iris circle, unfolds a plus then the full grid, reflows a 2x bento and lands full frame", async () => {
    await still([{ type: "photo-unfold", dir: "media", data: { images: GRID, hero: 4, zoom_index: 5, at: AT } }], async (page, seek) => {
      await strip(page, seek, "strip-pu", AT, AT + 3.1);
      await seek(AT - 0.1);
      expect((await pu(page)).filter((b) => b.vis).length).toBe(0);
      // Start: the hero as a circle at the iris geometry (centre, d = 0.30) -- where the iris leaves it.
      await seek(AT + 0.01);
      let t = (await pu(page)).filter((b) => b.vis);
      await shot(page, "pu-0-circle.png");
      expect(t.length).toBe(1);
      expect(Math.abs(t[0].x - 0.5)).toBeLessThan(E);
      expect(Math.abs(t[0].y - 0.5)).toBeLessThan(E);
      expect(Math.abs(t[0].w - 0.3)).toBeLessThan(E);
      expect(Math.abs(t[0].radius - t[0].w / 2)).toBeLessThan(E);
      // The spring: a rounded square that overshoots the settled hero, then settles.
      await seek(AT + 0.05 + 0.17);
      const peak = (await pu(page)).filter((b) => b.vis)[0];
      await shot(page, "pu-1-spring.png");
      await seek(AT + 0.44);
      const hero = (await pu(page)).filter((b) => b.vis)[0];
      await shot(page, "pu-2-hero.png");
      expect(peak.w).toBeGreaterThan(hero.w * 1.05);
      expect(hero.radius).toBeLessThan(hero.w * 0.12);
      expect(Math.abs(hero.w - 0.67)).toBeLessThan(0.02);
      // Plus: centre + the 4 edge neighbours, corners still folded under.
      await seek(AT + 0.7 + 0.24);
      t = (await pu(page)).filter((b) => b.vis);
      await shot(page, "pu-3-plus.png");
      expect(t.length).toBe(5);
      // The full 3x3: nine equal tiles spanning 0.644 of the frame, centred, none overlapping.
      await seek(AT + 1.6);
      t = (await pu(page)).filter((b) => b.vis);
      await shot(page, "pu-4-grid.png");
      expect(t.length).toBe(9);
      const tw = t[0].w;
      expect(t.every((b) => Math.abs(b.w - tw) < E && Math.abs(b.h - tw) < E)).toBe(true);
      const L = Math.min(...t.map((b) => b.l)), Rr = Math.max(...t.map((b) => b.r));
      expect(Math.abs(Rr - L - 0.644)).toBeLessThan(E * 2);
      expect(Math.abs((Rr + L) / 2 - 0.5)).toBeLessThan(E);
      for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) {
        const ox = Math.min(t[i].r, t[j].r) - Math.max(t[i].l, t[j].l), oy = Math.min(t[i].b, t[j].b) - Math.max(t[i].t, t[j].t);
        expect(ox > E && oy > E).toBe(false);
      }
      // Bento: the zoom tile (cell 5) is 2x2 at the top-right; the other eight are equal small tiles.
      await seek(AT + 2.6);
      const all = await pu(page);
      await shot(page, "pu-5-bento.png");
      const z = all[5], small = all.filter((_, i) => i !== 5);
      const sw = small[0].w;
      expect(small.every((b) => Math.abs(b.w - sw) < E)).toBe(true);
      expect(z.w / sw).toBeGreaterThan(1.9);
      expect(z.w / sw).toBeLessThan(2.2);
      expect(Math.abs(z.r - Math.max(...all.map((b) => b.r)))).toBeLessThan(E);
      expect(Math.abs(z.t - Math.min(...all.map((b) => b.t)))).toBeLessThan(E);
      // Mid-zoom the camera carries the whole bento with it.
      await seek(AT + 2.7 + 0.2);
      await shot(page, "pu-6-zoom.png");
      // A hair before landing, the tile itself already all but covers the frame.
      await seek(AT + 2.7 + 0.34);
      const zt = (await pu(page))[5];
      expect(zt.l).toBeLessThan(0.02); expect(zt.r).toBeGreaterThan(0.98);
      expect(zt.t).toBeLessThan(0.02); expect(zt.b).toBeGreaterThan(0.98);
      // Landing (zoom_at + 0.35): that photo, full frame, object-fit cover, no radius -- the last frame.
      await seek(AT + 2.7 + 0.35);
      const fin = (await pu(page, ".pu-final"))[0];
      await shot(page, "pu-7-landed.png");
      expect(fin.vis).toBe(true);
      expect(fin.l).toBeLessThan(E); expect(fin.t).toBeLessThan(E);
      expect(fin.r).toBeGreaterThan(1 - E); expect(fin.b).toBeGreaterThan(1 - E);
      expect((await pu(page)).every((b) => !b.vis)).toBe(true);
      expect(await page.evaluate(() => (document.querySelector(".pu-final img") as HTMLImageElement).src)).toBe(await page.evaluate(() => (document.querySelectorAll(".pu-tile img")[5] as HTMLImageElement).src));
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".pu-final img")!).objectFit)).toBe("cover");
      // Scrubbing back is exact (a pure function of time).
      await seek(AT + 1.6);
      const again = (await pu(page)).filter((b) => b.vis);
      expect(again.length).toBe(9);
      expect(Math.abs(again[0].w - tw)).toBeLessThan(E / 4);
    });
  }, 90000);
});

// Beats: at (black rect), reveal_at at+0.5, push_at at+2.5 (photo fills by +0.8), flood_at.
const FP_AT = 0.4;
// (Open-source Chromium has no H.264: RELAY_WALL can point stills at a VP9 copy of the clip.)
const WALL = IMG_DIR ? { wall: "footage", wall_src: `file://${process.env.RELAY_WALL || `${IMG_DIR}/wall-sq.mp4`}`, wall_duration: 7.37 } : { wall: "plaster" };
const fp = (page: Page, sel: string) => boxes(page, sel, ".fp");
describe("framed-print: black rect -> print on the wall -> push-in -> molding flood", () => {
  for (const reveal of ["instant", "grow"] as const) {
    it(`starts as the black rectangle at the frame geometry, shows the print (${reveal}), pushes in and floods`, async () => {
      await still([{ type: "framed-print", dir: "media", data: { image: PRINT, ...(reveal === "grow" ? { wall: "plaster" } : WALL), reveal, at: FP_AT, flood_at: FP_AT + 3.6 } }], async (page, seek) => {
        if (reveal === "instant") await strip(page, seek, "strip-fp", FP_AT, FP_AT + 4.0, 0.1);
        // Start: a solid rectangle of the molding colour at centre 0.5/0.5, 0.30 x 0.40; nothing inside shows.
        await seek(FP_AT);
        const f0 = (await fp(page, ".fp-frame"))[0];
        await shot(page, `fp-${reveal}-0-black.png`);
        expect(Math.abs(f0.x - 0.5)).toBeLessThan(E); expect(Math.abs(f0.y - 0.5)).toBeLessThan(E);
        expect(Math.abs(f0.w - 0.3)).toBeLessThan(E); expect(Math.abs(f0.h - 0.4)).toBeLessThan(E);
        expect((await fp(page, ".fp-photo"))[0].vis).toBe(false);
        expect(await page.evaluate(() => getComputedStyle(document.querySelector(".fp-frame")!).backgroundColor)).toBe("rgb(20, 20, 20)");
        expect(await page.evaluate(() => getComputedStyle(document.querySelector(".fp-frame")!).boxShadow)).toBe("none");
        // After the reveal: the photo sits inside the frame, inside the mat and the molding.
        await seek(FP_AT + 1.5);
        const f1 = (await fp(page, ".fp-frame"))[0], ph = (await fp(page, ".fp-photo"))[0], mat = (await fp(page, ".fp-mat"))[0];
        await shot(page, `fp-${reveal}-1-print.png`);
        expect(ph.vis).toBe(true);
        expect(ph.l).toBeGreaterThan(mat.l + 0.01); expect(ph.r).toBeLessThan(mat.r - 0.01);
        expect(mat.l).toBeGreaterThan(f1.l + 0.002); expect(mat.r).toBeLessThan(f1.r - 0.002);
        expect(Math.abs(ph.x - 0.5)).toBeLessThan(E); expect(Math.abs(ph.y - 0.5)).toBeLessThan(E);
        expect(Math.abs(f1.w - 0.3)).toBeLessThan(E);
        if (reveal === "grow") {
          // Mid-grow the photo is bigger than its final window: the mat and molding grow out of its edge.
          await seek(FP_AT + 0.5 + 0.08);
          const g = (await fp(page, ".fp-photo"))[0];
          await shot(page, "fp-grow-mid.png");
          expect(g.vis).toBe(true);
          expect(g.w).toBeGreaterThan(ph.w * 1.1);
        }
        // Mid-push.
        await seek(FP_AT + 2.5 + 0.45);
        await shot(page, `fp-${reveal}-2-push.png`);
        // After the push: the photo alone covers the frame.
        await seek(FP_AT + 2.5 + 0.8);
        const p2 = (await fp(page, ".fp-photo"))[0];
        await shot(page, `fp-${reveal}-3-filled.png`);
        expect(p2.l).toBeLessThanOrEqual(E); expect(p2.t).toBeLessThanOrEqual(E);
        expect(p2.r).toBeGreaterThanOrEqual(1 - E); expect(p2.b).toBeGreaterThanOrEqual(1 - E);
        // Flood: mid-way the black is on screen but has not taken everything; at the end it covers the frame.
        await seek(FP_AT + 3.6 + 0.2);
        await shot(page, `fp-${reveal}-4-flooding.png`);
        const mid = (await fp(page, ".fp-flood"))[0];
        expect(mid.vis).toBe(true);
        await seek(FP_AT + 3.6 + 0.3);
        await shot(page, `fp-${reveal}-5-flooded.png`);
        const fl = await page.evaluate(() => {
          const n = document.querySelector(".fp-flood") as HTMLElement, cs = getComputedStyle(n);
          const R = document.querySelector(".fp")!.getBoundingClientRect(), r = n.getBoundingClientRect(), k = r.width / n.offsetWidth;
          const bl = parseFloat(cs.borderLeftWidth) * k, br = parseFloat(cs.borderRightWidth) * k, bt = parseFloat(cs.borderTopWidth) * k, bb = parseFloat(cs.borderBottomWidth) * k;
          return { l: r.left - R.left, t: r.top - R.top, r: r.right - R.left, b: r.bottom - R.top, W: R.width, H: R.height, hole: cs.backgroundColor === cs.borderTopColor ? 0 : Math.max(0, r.width - bl - br) * Math.max(0, r.height - bt - bb), color: cs.borderTopColor };
        });
        expect(fl.l).toBeLessThanOrEqual(0); expect(fl.t).toBeLessThanOrEqual(0);
        expect(fl.r).toBeGreaterThanOrEqual(fl.W); expect(fl.b).toBeGreaterThanOrEqual(fl.H);
        expect(fl.hole).toBeLessThan(1);
        expect(fl.color).toBe("rgb(20, 20, 20)");
      }, 5);
    }, 90000);
  }
});
