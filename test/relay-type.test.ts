import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// type-relay (relay): the words of a relay film. They come FROM an object (a
// shape morphs onto the accent word and the line comes out of it) and turn
// back INTO one (squeeze into a pill, flood the frame, lift, scatter). The
// hand-offs are coordinates, so frame 0 of a `from` card must BE the shape and
// the last frame of a squeeze must BE the target box, pixel for pixel.
// TYPE_RELAY_SHOTS=<dir> keeps frames (and fetches the real faces through the
// agent proxy when there is one; every assertion is face-independent).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BG = "#efeeea", BGC = [0xef, 0xee, 0xea];
const PURPLE = "#393bf5", PURPLEC = [0x39, 0x3b, 0xf5];
const BLACKC = [0x0b, 0x0b, 0x0c];
const SHOTS = process.env.TYPE_RELAY_SHOTS || "";

async function still(data: unknown, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, o: { w?: number; h?: number; duration?: number } = {}) {
  const W = o.w ?? 1920, H = o.h ?? 1080;
  const source = await fs.readFile(path.resolve(__dirname, "../src/components/titles/type-relay.component.html"), "utf-8");
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: o.duration ?? 5, background: BG, locked_camera: true,
      components: [{ id: "tr", type: "type-relay", data, position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 10 }] } as any,
    components: [{ type: "type-relay", source }],
    brandKit: { colors: { primary: PURPLE, background: BG, text: "#0b0b0c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "type-relay-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const proxy = SHOTS && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, proxy });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, ignoreHTTPSErrors: !!proxy });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
    if (proxy) {
      await page.evaluate(() => Promise.all(["600 32px Geist", "italic 400 32px 'Instrument Serif'"].map((f) => (document as any).fonts.load(f)))).catch(() => {});
      await page.waitForFunction(() => (document as any).fonts.check("600 32px Geist"), undefined, { timeout: 20000 }).catch(() => {});
    }
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
const attr = (page: Page, name: string) => page.evaluate((n) => (document.querySelector('[data-cid="tr"] .trl') as HTMLElement).getAttribute(n) || "", name);
const nums = (s: string) => s.split(",").map(Number);
// Boxes in fractions of the component root (a full-frame slot is the camera layer: 40px larger than the frame).
type Box = { x: number; y: number; w: number; h: number; l: number; t: number; r: number; b: number; vis: boolean };
const boxes = (page: Page, sel: string): Promise<Box[]> => page.evaluate((s) => {
  const root = document.querySelector('[data-cid="tr"] .trl') as HTMLElement, R = root.getBoundingClientRect();
  return [...document.querySelectorAll(s)].map((n) => {
    const r = n.getBoundingClientRect();
    let vis = true, o = 1;
    for (let e: Element | null = n; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") vis = false; o *= +cs.opacity; }
    return { x: (r.left + r.width / 2 - R.left) / R.width, y: (r.top + r.height / 2 - R.top) / R.height, w: r.width / R.width, h: r.height / R.height,
      l: r.left, t: r.top, r: r.right, b: r.bottom, vis: vis && o > 0.98 };
  });
}, sel);
// Pixels [r,g,b] at points given in fractions of the component root (or the viewport when root is false).
const pixels = async (page: Page, pts: Array<[number, number]>, root = true) => {
  const buf = await page.screenshot({ type: "png" });
  return page.evaluate(async ([b64, P, useRoot]) => {
    const R = useRoot ? document.querySelector('[data-cid="tr"] .trl')!.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    return (P as Array<[number, number]>).map(([fx, fy]) => {
      const x = Math.max(0, Math.min(img.width - 1, Math.round(R.left + fx * R.width))), y = Math.max(0, Math.min(img.height - 1, Math.round(R.top + fy * R.height)));
      return [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
    });
  }, [buf.toString("base64"), pts, root] as const);
};
const near = (p: number[], q: number[], tol = 10) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol;
const CORNERS: Array<[number, number]> = [[0.004, 0.004], [0.996, 0.004], [0.004, 0.996], [0.996, 0.996]];

const LINES = [{ text: "Every click, counted.", accent: "counted." }, { text: "Every account, known." }];

describe("type-relay: words that come from an object and turn back into one", () => {
  it("from: frame 0 IS the shape; it morphs onto the accent word and the words come out of it", async () => {
    const shape = { x: 0.3, y: 0.28, w: 0.22, h: 0.075, radius: 0.012 };
    await still({ lines: LINES, from: { shape, color: PURPLE, at: 0, duration: 0.45 }, to: { mode: "hold" } }, async (page, seek) => {
      await seek(0);
      await shot(page, "from-0.png");
      const f = (await boxes(page, ".trl-from"))[0];
      expect(f.vis).toBe(true);
      expect(Math.abs(f.x - shape.x)).toBeLessThan(0.001); expect(Math.abs(f.y - shape.y)).toBeLessThan(0.001);
      expect(Math.abs(f.w - shape.w)).toBeLessThan(0.001); expect(Math.abs(f.h - shape.h)).toBeLessThan(0.001);
      // The frame is the shape and nothing else: purple at its centre and just inside, canvas just outside, no words.
      const px = await pixels(page, [[shape.x, shape.y], [shape.x - shape.w * 0.45, shape.y], [shape.x + shape.w / 2 + 0.01, shape.y], [shape.x, shape.y - shape.h / 2 - 0.01], [0.5, 0.5], [0.7, 0.6]]);
      expect(near(px[0], PURPLEC) && near(px[1], PURPLEC)).toBe(true);
      px.slice(2).forEach((p) => expect(near(p, BGC)).toBe(true));
      expect((await boxes(page, ".trl-word")).some((w) => w.vis)).toBe(false);

      // Published geometry.
      const wb = JSON.parse(await attr(page, "data-word-boxes")) as Array<{ text: string; cx: number; cy: number; w: number; h: number }>;
      expect(wb.map((w) => w.text)).toEqual(["Every", "click,", "counted.", "Every", "account,", "known."]);
      wb.forEach((w) => { expect(w.cx - w.w / 2).toBeGreaterThan(0); expect(w.cx + w.w / 2).toBeLessThan(1); expect(w.h).toBeGreaterThan(0.05); });
      expect(wb[1].cx).toBeGreaterThan(wb[0].cx);
      // "counted." follows on the same row (Geist) or wraps under it (a wider fallback face).
      expect(wb[2].cx > wb[1].cx || wb[2].cy > wb[1].cy + 0.05).toBe(true);
      expect(wb[3].cy).toBeGreaterThan(wb[0].cy);
      expect(Math.abs(wb[0].cy - wb[1].cy)).toBeLessThan(0.002);
      // Left-aligned at x = 0.08, vertically centred.
      const tb = nums(await attr(page, "data-text-box"));
      expect(Math.abs(tb[0] - tb[2] / 2 - 0.08)).toBeLessThan(0.004);
      expect(Math.abs(tb[1] - 0.5)).toBeLessThan(0.01);
      const acc = nums(await attr(page, "data-accent-box"));
      expect(Math.abs(acc[0] - wb[2].cx)).toBeLessThan(0.01);
      const settle = Number(await attr(page, "data-settle-time"));
      expect(settle).toBeGreaterThan(0.45); expect(settle).toBeLessThan(1.6);

      // Mid-morph and on the accent word at at + duration.
      await seek(0.25); await shot(page, "from-mid.png");
      await seek(0.45);
      await shot(page, "from-land.png");
      const f2 = (await boxes(page, ".trl-from"))[0];
      expect(Math.abs(f2.x - acc[0])).toBeLessThan(0.001); expect(Math.abs(f2.y - acc[1])).toBeLessThan(0.001);
      expect(Math.abs(f2.w - acc[2])).toBeLessThan(0.001); expect(Math.abs(f2.h - acc[3])).toBeLessThan(0.001);
      await seek(0.6); await shot(page, "from-out.png");
      // Settled: every word standing at its published box, the shape gone.
      await seek(settle + 0.05);
      await shot(page, "from-settled.png");
      expect((await boxes(page, ".trl-from"))[0].vis).toBe(false);
      const ws = await boxes(page, ".trl-word");
      expect(ws.every((w) => w.vis)).toBe(true);
      ws.forEach((w, i) => { expect(Math.abs(w.x - wb[i].cx)).toBeLessThan(0.002); expect(Math.abs(w.y - wb[i].cy)).toBeLessThan(0.002); });
      // The accent is purple ink, the rest near-black: there is dark ink inside the first word's box.
      const ink = await pixels(page, Array.from({ length: 40 }, (_, i) => [wb[0].cx - wb[0].w / 2 + (i / 39) * wb[0].w, wb[0].cy + 0.004] as [number, number]));
      expect(ink.some((p) => near(p, BLACKC, 40))).toBe(true);
    });
  }, 90000);

  it("to squeeze: the block condenses into the shape and ends EXACTLY on its box", async () => {
    const shape = { x: 0.5, y: 0.62, w: 0.1, h: 0.1 * 1960 / 1120 };   // a circle in a 16:9 box
    const to = { mode: "squeeze", at: 2, duration: 0.5, shape, color: "#0b0b0c" };
    // A whole relay card: a feed row becomes the accent word, the line comes out of it, the block squeezes into a dot.
    const from = { shape: { x: 0.78, y: 0.3, w: 0.3, h: 0.07, radius: 0.012 }, color: PURPLE, at: 0.1 };
    await still({ lines: LINES, from, to }, async (page, seek) => {
      await seek(0.1);
      expect(near((await pixels(page, [[0.78, 0.3]]))[0], PURPLEC)).toBe(true);
      if (SHOTS) for (let f = 0; f <= 60; f++) { await seek(f / 20); await shot(page, `seq-sq-${String(f).padStart(3, "0")}.png`); }
      expect(nums(await attr(page, "data-to-box")).map((v) => +v.toFixed(3))).toEqual([0.5, 0.62, 0.1, +(0.1 * 1960 / 1120).toFixed(3)]);
      expect(Number(await attr(page, "data-end-time"))).toBeCloseTo(2.5, 3);
      await seek(1.9); await shot(page, "sq-before.png");
      expect((await boxes(page, ".trl-word")).every((w) => w.vis)).toBe(true);
      for (const t of [2.1, 2.25, 2.35, 2.42]) { await seek(t); await shot(page, `sq-${t}.png`); }
      for (const t of [2.5, 3.5]) {
        await seek(t);
        const b = (await boxes(page, ".trl-to"))[0];
        expect(b.vis).toBe(true);
        expect(Math.abs(b.x - shape.x)).toBeLessThan(0.0006); expect(Math.abs(b.y - shape.y)).toBeLessThan(0.0006);
        expect(Math.abs(b.w - shape.w)).toBeLessThan(0.0006); expect(Math.abs(b.h - shape.h)).toBeLessThan(0.0006);
        expect((await boxes(page, ".trl-word")).some((w) => w.vis)).toBe(false);
        const r = shape.w / 2;
        const px = await pixels(page, [[shape.x, shape.y], [shape.x - r * 0.8, shape.y], [shape.x + r + 0.006, shape.y], [shape.x, shape.y + shape.h / 2 + 0.01], [0.2, 0.5], [0.05, 0.05]]);
        expect(near(px[0], BLACKC) && near(px[1], BLACKC)).toBe(true);
        px.slice(2).forEach((p) => expect(near(p, BGC)).toBe(true));
      }
      await shot(page, "sq-end.png");
    });
  }, 90000);

  it("to flood: the accent word's box floods the frame in the colour by at + duration", async () => {
    const to = { mode: "flood", at: 2, duration: 0.45, color: PURPLE };
    await still({ lines: [{ text: "Then it floods.", accent: "floods.", italic_accent: true }], to, align: "center" }, async (page, seek) => {
      const acc = nums(await attr(page, "data-accent-box"));
      if (SHOTS) for (let f = 0; f <= 52; f++) { await seek(f / 20); await shot(page, `seq-fl-${String(f).padStart(3, "0")}.png`); }
      await seek(1.9); await shot(page, "fl-before.png");
      expect((await pixels(page, CORNERS, false)).every((p) => near(p, BGC))).toBe(true);
      await seek(2.2); await shot(page, "fl-mid.png");
      const mid = (await boxes(page, ".trl-to"))[0];
      expect(mid.vis).toBe(true);
      expect(mid.w).toBeGreaterThan(acc[2]); expect(mid.w).toBeLessThan(1);
      for (const t of [2.45, 4]) {
        await seek(t);
        const px = await pixels(page, [...CORNERS, [0.5, 0.5], [0.2, 0.7], [0.8, 0.3]], false);
        px.forEach((p) => expect(near(p, PURPLEC, 4)).toBe(true));
      }
      await shot(page, "fl-end.png");
    });
  }, 90000);

  it("lift and scatter leave the frame empty; type reveals character by character with a caret", async () => {
    await still({ lines: LINES, to: { mode: "lift", at: 2, duration: 0.5 } }, async (page, seek) => {
      await seek(2.3); await shot(page, "lift-mid.png");
      await seek(2.7);
      const ws = await boxes(page, ".trl-word");
      expect(ws.every((w) => !w.vis || w.b <= 0)).toBe(true);
    });
    await still({ lines: LINES, to: { mode: "scatter", at: 2, duration: 0.6 } }, async (page, seek) => {
      await seek(2.3); await shot(page, "scatter-mid.png");
      await seek(2.8);
      expect((await boxes(page, ".trl-word")).some((w) => w.vis)).toBe(false);
    });
    await still({ lines: LINES, reveal: "type", at: 0.2, type_speed: 20 }, async (page, seek) => {
      await seek(0.2 + 7.5 / 20);
      await shot(page, "type-mid.png");
      const vis = await page.evaluate(() => [...document.querySelectorAll(".trl-ch")].filter((n) => getComputedStyle(n).visibility !== "hidden").map((n) => n.textContent).join(""));
      expect(vis).toBe("Everycl");   // positions 0..7 of "Every click,"
      expect((await boxes(page, ".trl-caret"))[0].vis).toBe(true);
    });
  }, 120000);

  it("9:16: sized to the box, wraps inside it, and a from/squeeze card still lands on its coordinates", async () => {
    const shape = { x: 0.5, y: 0.5, w: 0.6, h: 0.05 };
    await still({ lines: [{ text: "Every click, counted.", accent: "counted." }, { text: "Every account, known.", size: "m" }],
      from: { shape: { x: 0.5, y: 0.5, w: 1, h: 1, radius: 0 }, color: "#0b0b0c", at: 0 }, to: { mode: "squeeze", at: 2.5, duration: 0.5, shape } }, async (page, seek) => {
      await seek(0);
      await shot(page, "916-0.png");
      expect((await pixels(page, [...CORNERS, [0.5, 0.5]], false)).every((p) => near(p, BLACKC))).toBe(true);
      const wb = JSON.parse(await attr(page, "data-word-boxes")) as Array<{ cx: number; cy: number; w: number; h: number }>;
      wb.forEach((w) => { expect(w.cx - w.w / 2).toBeGreaterThan(0.03); expect(w.cx + w.w / 2).toBeLessThan(0.97); });
      // The first line wraps: its words sit on more than one row.
      expect(new Set(wb.slice(0, 3).map((w) => Math.round(w.cy * 200))).size).toBeGreaterThan(1);
      await seek(1.5); await shot(page, "916-settled.png");
      expect((await boxes(page, ".trl-word")).every((w) => w.vis)).toBe(true);
      await seek(3);
      await shot(page, "916-end.png");
      const b = (await boxes(page, ".trl-to"))[0];
      expect(Math.abs(b.x - 0.5)).toBeLessThan(0.001); expect(Math.abs(b.w - 0.6)).toBeLessThan(0.001); expect(Math.abs(b.h - 0.05)).toBeLessThan(0.001);
    }, { w: 1080, h: 1920 });
  }, 90000);
});
