import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// click-stream (relay, the Quotient Analytics film): a cursor flies through a
// stream of web content, stops on a piece, clicks one thing, and the click
// throws a purple event chip to the activity feed on the right. The film times
// its feed rows to the chip LANDINGS, so the schedule is a published formula.
// Checked in a 16:9 still (CLICK_STREAM_SHOTS=<dir> keeps frames;
// CLICK_STREAM_POOL=<dir with c01..c12.jpg + northwind-full.png> uses real content).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 1920, H = 1080;
const POOL = process.env.CLICK_STREAM_POOL && existsSync(process.env.CLICK_STREAM_POOL) ? process.env.CLICK_STREAM_POOL : "";

// A synthetic page w x h with a dark "button" where the target is.
const page_ = (hue: number, w: number, h: number, t?: number[]) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${hue},40%,92%)"/>` +
  `<rect x="${w * 0.08}" y="${h * 0.08}" width="${w * 0.84}" height="${h * 0.35}" rx="12" fill="hsl(${hue},55%,60%)"/>` +
  (t ? `<rect x="${t[0]}" y="${t[1]}" width="${t[2]}" height="${t[3]}" rx="${t[3] / 2}" fill="hsl(${hue},60%,25%)"/>` : "") + `</svg>`);

type Stop = { src: string; w: number; h: number; target: number[]; chip: string; kind?: string };
const real = (f: string) => `file://${path.join(POOL, f)}`;
const STOPS: Stop[] = POOL ? [
  { src: real("c01.jpg"), w: 1080, h: 1350, target: [64, 1144, 364, 90], chip: "Clicked · Try Flows free — Kestrel", kind: "email" },
  { src: real("c09.jpg"), w: 1080, h: 1350, target: [96, 1078, 270, 50], chip: "Clicked · Full report — Halcyon", kind: "social" },
  { src: real("c04.jpg"), w: 1080, h: 1350, target: [680, 760, 286, 82], chip: "Clicked · Claim 40% off — Brightfield", kind: "ad" },
  { src: real("c06.jpg"), w: 1080, h: 1350, target: [848, 28, 166, 52], chip: "Clicked · Get started — Parallax", kind: "blog" },
  { src: real("c02.jpg"), w: 1080, h: 1350, target: [72, 1132, 304, 90], chip: "Registered · Webinar — Tidewell", kind: "email" },
  { src: real("northwind-full.png"), w: 1920, h: 1080, target: [552, 812, 360, 92], chip: "Clicked · See the report — Northwind", kind: "email" },
] : [
  ...[0, 1, 2, 3, 4].map((i) => ({ src: page_(i * 60, 1080, 1350, [80 + i * 60, 1100, 340, 90]), w: 1080, h: 1350, target: [80 + i * 60, 1100, 340, 90], chip: `Clicked · Piece ${i + 1}` })),
  { src: page_(160, 1920, 1080, [552, 812, 360, 92]), w: 1920, h: 1080, target: [552, 812, 360, 92], chip: "Clicked · See the report — Northwind" },
];
const STREAM = POOL
  ? ["c03.jpg", "c05.jpg", "c07.jpg", "c08.jpg", "c10.jpg", "c11.jpg", "c12.jpg"].map((f) => ({ src: real(f), w: 1080, h: 1350 }))
  : Array.from({ length: 12 }, (_, i) => ({ src: page_((i * 29) % 360, i % 3 ? 1080 : 1600, i % 3 ? 1350 : 1000), w: i % 3 ? 1080 : 1600, h: i % 3 ? 1350 : 1000 }));
const REGION = { x: 0, y: 0, w: 0.62, h: 1 };
const BASE = { stops: STOPS, stream: STREAM, region: REGION, at: 0.25, chip_to: [0.8, 0.3] };

// The published formula, re-derived here from the data alone.
function schedule(n: number, o: { at?: number; first_hold?: number; last_hold?: number; travel?: number; last_travel?: number; enter?: number; click_at?: number; chip_pop?: number; chip_travel?: number } = {}) {
  const at = o.at ?? 0, h0 = o.first_hold ?? 1.1, h1 = o.last_hold ?? 0.45, t0 = o.travel ?? 0.35, t1 = o.last_travel ?? 0.25;
  const enter = o.enter ?? 0.5, cf = o.click_at ?? 0.5, pop = o.chip_pop ?? 0.15, fly = o.chip_travel ?? 0.45;
  const geo = (a: number, b: number, i: number, m: number) => (m <= 1 ? a : a * Math.pow(b / a, i / (m - 1)));
  const arrive: number[] = [], leave: number[] = [], click: number[] = [], land: number[] = [];
  for (let i = 0; i < n; i++) {
    const hold = geo(h0, h1, i, n);
    arrive[i] = i === 0 ? at + enter : leave[i - 1] + geo(t0, t1, i - 1, n - 1);
    click[i] = arrive[i] + cf * hold;
    leave[i] = arrive[i] + hold;
    land[i] = click[i] + pop + fly;
  }
  return { arrive, leave, click, land };
}
// The last target's box in frame fractions, from the data alone (hold / zoom-cover).
function lastTarget(stop: Stop, region: typeof REGION, mode: "hold" | "zoom", W: number, H: number) {
  const RX = region.x * W, RY = region.y * H, RW = region.w * W, RH = region.h * H;
  const [tx, ty, tw, th] = stop.target;
  let k: number, left: number, top: number;
  if (mode === "hold") {
    k = Math.min(0.9 * RW / stop.w, 0.85 * RH / stop.h);
    left = RX + RW / 2 - stop.w * k / 2; top = RY + RH / 2 - stop.h * k / 2;
  } else {
    k = Math.max(RW / stop.w, RH / stop.h);
    const cl = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    left = RX + cl(RW / 2 - (tx + tw / 2) * k, RW - stop.w * k, 0);
    top = RY + cl(RH / 2 - (ty + th / 2) * k, RH - stop.h * k, 0);
  }
  return [(left + (tx + tw / 2) * k) / W, (top + (ty + th / 2) * k) / H, tw * k / W, th * k / H];
}

async function still(data: unknown, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, duration = 9) {
  const source = await fs.readFile(path.resolve(__dirname, "../src/components/media/click-stream.component.html"), "utf-8");
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: duration, background: "#efeeea", locked_camera: true,
      components: [{ id: "cs", type: "click-stream", data, position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 10 }] } as any,
    components: [{ type: "click-stream", source }],
    brandKit: { colors: { primary: "#393bf5", background: "#efeeea", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "clickstream-"));
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
const shot = async (page: Page, name: string) => { if (process.env.CLICK_STREAM_SHOTS) await page.screenshot({ path: path.join(process.env.CLICK_STREAM_SHOTS, name) }); };
const attr = (page: Page, name: string) => page.evaluate((n) => (document.querySelector('[data-cid="cs"] .cks') as HTMLElement).getAttribute(n) || "", name);
const nums = (s: string) => s.split(",").map(Number);
// The component box (a full-frame slot is the camera layer: 20px of bleed on every side).
const cbox = (page: Page) => page.evaluate(() => {
  const n = document.querySelector('[data-cid="cs"] .cks') as HTMLElement, r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, w: n.clientWidth, h: n.clientHeight };
});
const box = (page: Page, sel: string) => page.evaluate((s) => {
  const n = document.querySelector(s) as HTMLElement | null;
  if (!n) return null;
  const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom, vis: cs.visibility !== "hidden" && +cs.opacity > 0.05 };
}, sel);
const visibleStream = (page: Page) => page.evaluate(() => [...document.querySelectorAll(".cks-piece.cks-stream")].filter((n) => getComputedStyle(n).visibility !== "hidden").map((n) => {
  const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width };
}));
const tip = (page: Page) => page.evaluate(() => {
  const c = document.querySelector(".mp-cursor") as HTMLElement; const r = c.getBoundingClientRect();
  const s = c.offsetWidth; return { x: r.left + s * 5.5 / 24, y: r.top + s * 3.2 / 24, vis: getComputedStyle(c).visibility !== "hidden" };
});

describe("click-stream: a cursor works through the internet, each click throws an event chip", () => {
  it("publishes the accelerating schedule; stops land centred on clean canvas; chips land at chip_to at the land times", async () => {
    await still({ ...BASE, end_mode: "hold" }, async (page, seek) => {
      const want = schedule(STOPS.length, { at: 0.25 });
      const clicks = nums(await attr(page, "data-click-times")), lands = nums(await attr(page, "data-land-times"));
      clicks.forEach((c, i) => expect(c).toBeCloseTo(want.click[i], 2));
      lands.forEach((c, i) => expect(c).toBeCloseTo(want.land[i], 2));
      // Faster every time: holds shrink from ~1.1 s to ~0.45 s.
      const leaves = nums(await attr(page, "data-leave-times")), arrives = nums(await attr(page, "data-arrive-times"));
      const holds = arrives.slice(0, -1).map((a, i) => leaves[i] - a);
      expect(holds[0]).toBeCloseTo(1.1, 2);
      for (let i = 1; i < holds.length; i++) expect(holds[i]).toBeLessThan(holds[i - 1]);
      expect(leaves[STOPS.length - 1] - arrives[STOPS.length - 1]).toBeCloseTo(0.45, 2);
      const B = await cbox(page);
      const exp = lastTarget(STOPS[STOPS.length - 1], REGION, "hold", B.w, B.h);
      nums(await attr(page, "data-last-target")).forEach((v, i) => expect(Math.abs(v - exp[i])).toBeLessThan(0.0005));

      await seek(0.2);
      expect((await box(page, '[data-cid="cs"] .cks'))!.vis).toBe(false);
      await seek(0.25);
      // The first frame is the empty region: the strip starts past its right edge.
      expect((await visibleStream(page)).filter((p) => p.l < B.l + REGION.w * B.w - 1)).toEqual([]);
      await seek(0.5);
      await shot(page, "cs-enter.png");
      expect((await visibleStream(page)).length).toBeGreaterThan(0);

      // Page px: the region starts at the box's left edge (fractions are of the component box).
      const RL = B.l + REGION.x * B.w, RW = REGION.w * B.w, RCX = RL + RW / 2, RCY = B.t + REGION.y * B.h + REGION.h * B.h / 2;
      for (let i = 0; i < STOPS.length; i++) {
        await seek(clicks[i] - 0.1);
        const b = (await box(page, `.cks-piece[data-stop="${i}"]`))!;
        // Centred in the region at the readable size (90% of its width or 85% of its height).
        expect(Math.abs(b.x - RCX)).toBeLessThan(1.5);
        expect(Math.abs(b.y - RCY)).toBeLessThan(1.5);
        expect(Math.abs(b.w - 0.9 * RW) < 2 || Math.abs(b.h - 0.85 * REGION.h * B.h) < 2).toBe(true);
        // Clean canvas round it: no stream piece inside the region while it holds.
        expect((await visibleStream(page)).filter((p) => p.r > RL && p.l < RL + RW)).toEqual([]);
        // The cursor is on the target before the click.
        const s = STOPS[i], k = b.w / s.w, tc = { x: b.l + (s.target[0] + s.target[2] / 2) * k, y: b.t + (s.target[1] + s.target[3] / 2) * k };
        const cp = await tip(page);
        expect(Math.hypot(cp.x - tc.x, cp.y - tc.y)).toBeLessThan(3);
        if (i === 0) await shot(page, "cs-stop0.png");
        await seek(clicks[i] + 0.1);
        if (i === 0 || i === 3) await shot(page, `cs-click${i}.png`);
        expect((await box(page, `.cks-chip[data-chip="${i}"]`))!.vis).toBe(true);
        expect((await box(page, `[data-stop="${i}"] .cks-hl`))!.vis).toBe(true);
        await seek(clicks[i] + 0.15 + 0.2);
        if (i === 0) await shot(page, "cs-fly0.png");
        await seek(lands[i]);
        const c = (await box(page, `.cks-chip[data-chip="${i}"]`))!;
        expect(c.vis).toBe(true);
        expect(Math.abs(c.x - (B.l + 0.8 * B.w))).toBeLessThan(1.5);
        expect(Math.abs(c.y - (B.t + 0.3 * B.h))).toBeLessThan(1.5);
        await seek(lands[i] + 0.04);
        expect((await box(page, `.cks-chip[data-chip="${i}"]`))!.vis).toBe(false);
      }
      // Mid-rush: the camera has pulled back and several pieces are crossing the region.
      await seek((leaves[1] + arrives[2]) / 2);
      await shot(page, "cs-rush.png");
      const rush = (await visibleStream(page)).filter((p) => p.r > RL && p.l < RL + RW);
      expect(rush.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...rush.map((p) => p.w))).toBeLessThan(0.6 * RW);
      // A contact sheet's worth of frames (8 fps) when stills are wanted.
      if (process.env.CLICK_STREAM_SHOTS) for (let f = 0; f <= 72; f++) { await seek(f / 8); await shot(page, `seq-${String(f).padStart(3, "0")}.png`); }
      // Hold: the last stop stays where it landed.
      await seek(8.5);
      await shot(page, "cs-hold-end.png");
      const e = (await box(page, `.cks-piece[data-stop="${STOPS.length - 1}"]`))!;
      expect(Math.abs(e.x - RCX)).toBeLessThan(1.5);
    });
  }, 120000);

  it("end_mode zoom: the last stop grows to cover the region, frozen, the cursor resting on the target", async () => {
    await still({ ...BASE, end_mode: "zoom", zoom_duration: 0.5 }, async (page, seek) => {
      const settle = nums(await attr(page, "data-settle-time"))[0];
      const want = schedule(STOPS.length, { at: 0.25 });
      expect(settle).toBeCloseTo(want.leave[STOPS.length - 1] + 0.5, 2);
      const lt = nums(await attr(page, "data-last-target"));
      const B = await cbox(page);
      const exp = lastTarget(STOPS[STOPS.length - 1], REGION, "zoom", B.w, B.h);
      lt.forEach((v, i) => expect(Math.abs(v - exp[i])).toBeLessThan(0.0005));
      await seek(settle - 0.25);
      await shot(page, "cs-zoom-mid.png");
      for (const t of [settle, 8.9]) {
        await seek(t);
        const b = (await box(page, `.cks-piece[data-stop="${STOPS.length - 1}"]`))!;
        // Covers the region exactly (the region clips the rest).
        expect(b.l).toBeLessThanOrEqual(B.l + 0.5); expect(b.t).toBeLessThanOrEqual(B.t + 0.5);
        expect(b.r).toBeGreaterThanOrEqual(B.l + REGION.w * B.w - 0.5); expect(b.b).toBeGreaterThanOrEqual(B.t + B.h - 0.5);
        const cp = await tip(page);
        expect(cp.vis).toBe(true);
        expect(Math.abs(cp.x - (B.l + lt[0] * B.w))).toBeLessThan(1.5);
        expect(Math.abs(cp.y - (B.t + lt[1] * B.h))).toBeLessThan(1.5);
      }
      await shot(page, "cs-zoom-end.png");
    });
  }, 120000);

  it("an explicit times override sets the click moments; lands follow by chip_pop + chip_travel", async () => {
    const times = [1, 2.5, 3.5, 4.25, 5, 5.5];
    await still({ ...BASE, times, chip_travel: 0.5 }, async (page) => {
      expect(nums(await attr(page, "data-click-times"))).toEqual(times);
      nums(await attr(page, "data-land-times")).forEach((v, i) => expect(v).toBeCloseTo(times[i] + 0.15 + 0.5, 3));
      const arr = nums(await attr(page, "data-arrive-times")), lv = nums(await attr(page, "data-leave-times"));
      for (let i = 1; i < times.length; i++) expect(arr[i]).toBeGreaterThan(lv[i - 1]);
    });
  }, 60000);
});
