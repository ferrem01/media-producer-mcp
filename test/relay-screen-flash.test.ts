import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// screen-flash (relay, a product launch): a carousel of product screens that
// never stops moving; on each cue the front screen LIFTS out and punches up to
// fill the frame, holds, and drops back into its slot. Then the next. The film
// times its beats to the published arrivals, so the schedule is checked here.
// SCREEN_FLASH_SHOTS=<dir> keeps frames; SCREEN_FLASH_POOL=<dir of 1920x1080
// PNGs> uses real screens instead of the synthetic ones; SCREEN_FLASH_JANK=<dir>
// dumps the ring cycle at 30 fps (diff consecutive frames to find pops).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POOL = process.env.SCREEN_FLASH_POOL && existsSync(process.env.SCREEN_FLASH_POOL) ? process.env.SCREEN_FLASH_POOL : "";
const SHOTS = process.env.SCREEN_FLASH_SHOTS || "";

// A synthetic analytics screen: sidebar, a big title, KPI tiles and a chart.
const synth = (i: number, title: string) => {
  const hue = (i * 47 + 220) % 360, w = 1920, h = 1080;
  const pts = Array.from({ length: 12 }, (_, k) => `${560 + k * 110},${820 - (Math.sin(k * 0.9 + i) * 0.5 + 0.5) * 260 - k * 12}`).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="#f7f7fa"/><rect width="300" height="${h}" fill="hsl(${hue},30%,16%)"/>` +
    [0, 1, 2, 3, 4, 5].map((k) => `<rect x="40" y="${160 + k * 70}" width="${k === i % 6 ? 220 : 170}" height="26" rx="13" fill="hsl(${hue},30%,${k === i % 6 ? 60 : 32}%)"/>`).join("") +
    `<text x="380" y="170" font-family="Arial" font-weight="700" font-size="92" fill="#15151c">${title}</text>` +
    [0, 1, 2, 3].map((k) => `<rect x="${380 + k * 380}" y="230" width="350" height="170" rx="18" fill="#ffffff" stroke="#e4e4ec"/>` +
      `<text x="${410 + k * 380}" y="345" font-family="Arial" font-weight="700" font-size="64" fill="hsl(${hue},60%,45%)">${(k + 2) * 13 + i}%</text>`).join("") +
    `<rect x="380" y="440" width="1480" height="580" rx="18" fill="#ffffff" stroke="#e4e4ec"/>` +
    `<polyline points="${pts}" fill="none" stroke="hsl(${hue},70%,52%)" stroke-width="10" stroke-linejoin="round"/>` +
    `<text x="1700" y="1000" font-family="Arial" font-weight="700" font-size="120" fill="hsl(${hue},60%,45%)" text-anchor="end">${i + 1}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
};
const TITLES = ["Metrics", "Traffic by channel", "Funnels", "Retention", "Journeys", "Attribution", "Cohorts", "Revenue"];
const pngSize = (f: string) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const SCREENS = (n: number) => {
  if (POOL) {
    const files = readdirSync(POOL).filter((f) => /\.png$/i.test(f)).sort();
    return Array.from({ length: n }, (_, i) => files[i % files.length]).map((f) => ({ src: `file://${path.join(POOL, f)}`, ...pngSize(path.join(POOL, f)) }));
  }
  return Array.from({ length: n }, (_, i) => ({ src: synth(i, TITLES[i % TITLES.length]), w: 1920, h: 1080 }));
};

async function still(data: any, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, o: { duration?: number; w?: number; h?: number } = {}) {
  const W = o.w ?? 1920, H = o.h ?? 1080, duration = o.duration ?? 14;
  const source = await fs.readFile(path.resolve(__dirname, "../src/components/media/screen-flash.component.html"), "utf-8");
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: duration, background: "#efeeea", locked_camera: true,
      components: [{ id: "sf", type: "screen-flash", data, position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 10 }] } as any,
    components: [{ type: "screen-flash", source }],
    brandKit: { colors: { primary: "#393bf5", background: "#efeeea", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "screenflash-"));
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
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
const attr = (page: Page, name: string) => page.evaluate((n) => (document.querySelector('[data-cid="sf"] .sfl') as HTMLElement).getAttribute(n) || "", name);
const nums = (s: string) => (s ? s.split(",").map(Number) : []);
// The component box (a full-frame slot is the camera layer: 20px of bleed on every side).
const cbox = (page: Page) => page.evaluate(() => {
  const n = document.querySelector('[data-cid="sf"] .sfl') as HTMLElement, r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: n.clientWidth, h: n.clientHeight };
});
type Card = { item: number; screen: number; l: number; t: number; r: number; b: number; w: number; h: number; z: number; vis: boolean };
const cards = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-cid="sf"] .sfl-card')].map((n) => {
  const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
  return { item: +(n.getAttribute("data-item") || 0), screen: +(n.getAttribute("data-screen") || 0), l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height,
    z: +cs.zIndex || 0, vis: cs.visibility !== "hidden" && +cs.opacity > 0.05 && r.width > 1 };
})) as Promise<Card[]>;
const top = (cs: Card[]) => cs.filter((c) => c.vis).sort((a, b) => b.z - a.z)[0];

describe("screen-flash: a carousel that flashes one screen at a time", () => {
  it("ring: each flash lands exactly on the component box, returns to a carousel of all N, collapses into a point", async () => {
    const N = 6;
    const screens = SCREENS(N).map((s, i) => ({ ...s, label: TITLES[i] }));
    await still({ screens, shape: "ring", enter: "point", from: [0.5, 0.5], end: "collapse", to: [0.5, 0.55], count: 5 }, async (page, seek) => {
      const B = await cbox(page);
      expect(Math.round(B.w)).toBe(1960); expect(Math.round(B.h)).toBe(1120);
      const flashes = nums(await attr(page, "data-flash-times")), lifts = nums(await attr(page, "data-lift-times"));
      const leaves = nums(await attr(page, "data-leave-times")), rets = nums(await attr(page, "data-return-times"));
      const idx = nums(await attr(page, "data-flash-indexes"));
      const settle = nums(await attr(page, "data-settle-time"))[0];
      expect(flashes.length).toBe(5);
      expect(idx).toEqual([0, 1, 2, 3, 4]);
      flashes.forEach((a, k) => {
        expect(a - lifts[k]).toBeCloseTo(0.28, 2);
        expect(leaves[k] - a).toBeCloseTo(0.7, 2);
        expect(rets[k] - leaves[k]).toBeCloseTo(0.35, 2);
        if (k) expect(lifts[k] - rets[k - 1]).toBeCloseTo(0.55, 2);
      });
      // Enter 'point': frame 0 is empty except the point -- every card is gathered at it.
      await seek(0);
      await shot(page, "sf-000-point.png");
      const px = B.l + 0.5 * B.w, py = B.t + 0.5 * B.h;
      for (const c of await cards(page)) {
        if (!c.vis) continue;
        expect(c.l).toBeGreaterThan(px - 3); expect(c.r).toBeLessThan(px + 3);
        expect(c.t).toBeGreaterThan(py - 3); expect(c.b).toBeLessThan(py + 3);
      }
      await seek(0.35); await shot(page, "sf-001-burst.png");
      await seek(lifts[0] - 0.05); await shot(page, "sf-002-carousel.png");
      // The ring shows all N before the first flash; the front card is the first flash's screen.
      let cs = await cards(page);
      expect(cs.filter((c) => c.vis).length).toBe(N);
      expect(top(cs).screen).toBe(idx[0]);
      for (let k = 0; k < flashes.length; k++) {
        await seek(lifts[k] + 0.14);
        if (k === 0) await shot(page, "sf-003-lifting.png");
        await seek(flashes[k] + 0.05);
        if (k === 0) await shot(page, "sf-004-arrived.png");
        cs = await cards(page);
        const f = top(cs);
        expect(f.screen).toBe(idx[k]);
        // flash_fit full: the flashed screen IS the component box (within 2 px).
        expect(Math.abs(f.l - B.l)).toBeLessThan(2); expect(Math.abs(f.t - B.t)).toBeLessThan(2);
        expect(Math.abs(f.r - B.r)).toBeLessThan(2); expect(Math.abs(f.b - B.b)).toBeLessThan(2);
        // Its label rises bottom-left inside the frame.
        const lab = await page.evaluate((kk) => {
          const n = document.querySelector(`.sfl-label[data-flash="${kk}"]`) as HTMLElement; if (!n) return null;
          const r = n.getBoundingClientRect(); return { l: r.left, b: r.bottom, vis: getComputedStyle(n).visibility !== "hidden", text: n.textContent };
        }, k);
        expect(lab && lab.vis).toBe(true);
        expect(lab!.text).toBe(TITLES[idx[k]]);
        await seek((flashes[k] + leaves[k]) / 2);
        if (k === 0) await shot(page, "sf-005-hold.png");
        if (k === 1) await shot(page, "sf-005-hold-label.png");
        await seek(leaves[k] + 0.17);
        if (k === 0) await shot(page, "sf-006-returning.png");
        await seek(rets[k] + 0.02);
        if (k === 0) await shot(page, "sf-007-returned.png");
        cs = await cards(page);
        const vis = cs.filter((c) => c.vis);
        expect(vis.length).toBe(N);
        // Back in the carousel: nothing is anywhere near full frame.
        expect(Math.max(...vis.map((c) => c.w))).toBeLessThan(0.5 * B.w);
      }
      await seek(settle - 0.25); await shot(page, "sf-008-collapsing.png");
      // Collapse: every card ends gathered at `to`, then gone.
      await seek(settle - 0.01);
      const tx = B.l + 0.5 * B.w, ty = B.t + 0.55 * B.h;
      for (const c of (await cards(page)).filter((c) => c.vis)) {
        expect(Math.max(Math.abs(c.l - tx), Math.abs(c.r - tx))).toBeLessThan(40);
        expect(Math.max(Math.abs(c.t - ty), Math.abs(c.b - ty))).toBeLessThan(40);
      }
      await seek(settle + 0.05);
      expect((await cards(page)).filter((c) => c.vis)).toEqual([]);
      if (SHOTS) for (let f = 0; f <= Math.ceil(settle * 8); f++) { await seek(f / 8); await shot(page, `seq-${String(f).padStart(3, "0")}.png`); }
      if (process.env.SCREEN_FLASH_JANK) for (let f = 0; f <= Math.ceil(settle * 30); f++) { await seek(f / 30); await page.screenshot({ path: path.join(process.env.SCREEN_FLASH_JANK, `j-${String(f).padStart(4, "0")}.png`) }); }
    });
  }, 180000);

  it("deterministic under seek: a frame reached out of order renders the same", async () => {
    await still({ screens: SCREENS(6), count: 3 }, async (page, seek) => {
      const t = nums(await attr(page, "data-flash-times"))[1] - 0.1;
      const grab = async () => JSON.stringify((await cards(page)).map((c) => [c.l, c.t, c.r, c.b, c.z, c.vis].map((v) => typeof v === "number" ? Math.round(v * 10) / 10 : v)));
      await seek(t); const a = await grab();
      await seek(9); await seek(0.3); await seek(t); const b = await grab();
      expect(b).toBe(a);
    });
  }, 60000);

  it("explicit flashes with an index: the ring turns so that screen is the one that lifts; end 'full' stays full", async () => {
    const flashes = [{ index: 3, at: 1.2 }, { index: 0, at: 3.0, hold: 0.5 }, { index: 5, at: 4.6 }];
    await still({ screens: SCREENS(7), flashes, end: "full" }, async (page, seek) => {
      const B = await cbox(page);
      expect(nums(await attr(page, "data-flash-times"))).toEqual([1.2, 3, 4.6]);
      expect(nums(await attr(page, "data-flash-indexes"))).toEqual([3, 0, 5]);
      expect(nums(await attr(page, "data-settle-time"))[0]).toBeCloseTo(4.6, 3);
      for (const f of flashes) {
        await seek(f.at - 0.28);
        expect(top(await cards(page)).screen).toBe(f.index);
        await seek(f.at + 0.05);
        const c = top(await cards(page));
        expect(c.screen).toBe(f.index);
        expect(Math.abs(c.l - B.l)).toBeLessThan(2); expect(Math.abs(c.r - B.r)).toBeLessThan(2);
      }
      for (const t of [5.5, 8, 13.9]) {
        await seek(t);
        const c = top(await cards(page));
        expect(c.screen).toBe(5);
        expect(Math.abs(c.l - B.l)).toBeLessThan(2); expect(Math.abs(c.t - B.t)).toBeLessThan(2);
        expect(Math.abs(c.r - B.r)).toBeLessThan(2); expect(Math.abs(c.b - B.b)).toBeLessThan(2);
      }
      await shot(page, "sf-full-end.png");
    });
  }, 60000);

  it("rail: screens slide continuously left; a fractional flash_fit lands centred with a margin", async () => {
    await still({ screens: SCREENS(5), shape: "rail", flash_fit: 0.86, flash_pop: true, count: 3, enter: "fade" }, async (page, seek) => {
      const B = await cbox(page);
      const fl = nums(await attr(page, "data-flash-times")), lifts = nums(await attr(page, "data-lift-times"));
      await seek(lifts[0] - 0.6); await shot(page, "sf-rail-a.png");
      const a = await cards(page);
      await seek(lifts[0] - 0.3); await shot(page, "sf-rail-b.png");
      const b = await cards(page);
      // Moving left: every card visible in both frames has moved left.
      const moved = a.filter((c) => c.vis).map((c) => { const d = b.find((x) => x.item === c.item && x.vis); return d ? d.l + d.w / 2 - (c.l + c.w / 2) : null; }).filter((v) => v !== null) as number[];
      expect(moved.length).toBeGreaterThan(1);
      moved.forEach((d) => expect(d).toBeLessThan(0));
      await seek(fl[0]); await shot(page, "sf-rail-pop.png");
      await seek(fl[0] + 0.3); await shot(page, "sf-rail-flash.png");
      const c = top(await cards(page));
      const VW = 1920, VH = 1080, k = Math.min(0.86 * VW / (1920 / 1080), 0.86 * VH);
      expect(Math.abs(c.w - k * 1920 / 1080)).toBeLessThan(2); expect(Math.abs(c.h - k)).toBeLessThan(2);
      expect(Math.abs((c.l + c.r) / 2 - (B.l + B.r) / 2)).toBeLessThan(1.5);
      expect(Math.abs((c.t + c.b) / 2 - (B.t + B.b) / 2)).toBeLessThan(1.5);
    });
  }, 60000);

  it("9:16: the ring renders in a tall frame and a landscape screen flashes contained (0.92 of the frame width)", async () => {
    await still({ screens: SCREENS(6), count: 2, end: "collapse" }, async (page, seek) => {
      const B = await cbox(page);
      expect(Math.round(B.w)).toBe(1120); expect(Math.round(B.h)).toBe(1960);
      const fl = nums(await attr(page, "data-flash-times")), lifts = nums(await attr(page, "data-lift-times"));
      await seek(lifts[0] - 0.05); await shot(page, "sf-916-ring.png");
      const cs = (await cards(page)).filter((c) => c.vis);
      expect(cs.length).toBe(6);
      await seek(fl[0] + 0.05); await shot(page, "sf-916-flash.png");
      const c = top(await cards(page));
      expect(Math.abs(c.w - 0.92 * 1080)).toBeLessThan(2);
      expect(Math.abs((c.t + c.b) / 2 - 960)).toBeLessThan(1.5);
    }, { w: 1080, h: 1920, duration: 8 });
  }, 60000);
});
