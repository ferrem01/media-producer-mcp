import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Relay v2, the "develop." recreation: the open and the close are made of
// the wordmark (it squeezes into its own period, the dot becomes the black
// pill, the pill becomes an iris that opens on a photo), and scenes join on
// a black flood that contracts into the next scene's first shape. Each piece
// is checked on a square frame at the handoff geometry the pieces share:
// pill centre 0.5/0.5, 0.30 x 0.085; iris circle diameter 0.30.
// RELAY_SHOTS=<dir> keeps stills.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const S = 1080;
// A flat blue "photo" with an orange door: its pixels can't be mistaken for a graphite blade.
const PHOTO = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#2d6cdf"/><rect x="170" y="90" width="60" height="230" fill="#ff5a1f"/></svg>`);

type Comp = { type: string; dir: string; data: unknown; position?: unknown };
async function still(comps: Comp[], run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, duration = 4) {
  const sources: Array<{ type: string; source: string }> = [];
  for (const c of comps) if (!sources.some((s) => s.type === c.type)) sources.push({ type: c.type, source: await fs.readFile(path.resolve(__dirname, `../src/components/${c.dir}/${c.type}.component.html`), "utf-8") });
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: duration, background: "#efeeea", components: comps.map((c, i) => ({ id: "c" + i, type: c.type, data: c.data, position: c.position || { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 10 + i })) } as any,
    components: sources, brandKit: { colors: { primary: "#0b0b0c", background: "#efeeea", text: "#0b0b0c" }, fonts: [] } as any, canvas: { width: S, height: S } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "relay-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  // Stills fetch the real faces (Archivo, Geist) through the agent proxy when
  // there is one; the assertions are face-independent and run offline.
  const proxy = process.env.RELAY_SHOTS && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, proxy });
  try {
    const page = await browser.newPage({ viewport: { width: S, height: S }, ignoreHTTPSErrors: !!proxy });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});  // as the capture does
    // Through the proxy the faces can land after fonts.ready: wait for them so
    // two pages compared box for box measured the same face.
    if (proxy) {
      await page.evaluate(() => Promise.all(["800 32px Archivo", "400 32px Geist", "600 32px Geist"].map((f) => (document as any).fonts.load(f)))).catch(() => {});
      await page.waitForFunction(() => (document as any).fonts.check("800 32px Archivo"), undefined, { timeout: 20000 }).catch(() => {});
    }
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
const shot = async (page: Page, name: string) => { if (process.env.RELAY_SHOTS) await page.screenshot({ path: path.join(process.env.RELAY_SHOTS, name) }); };
// Boxes in FRAME fractions of the component root (the scene camera's slow
// push scales the whole stage, so pixels drift over a scene; fractions of the
// root do not).
type Box = { x: number; y: number; w: number; h: number; o: number; vis: boolean };
const boxes = (page: Page, sel: string): Promise<Box[]> => page.evaluate(([s]) => [...document.querySelectorAll(s)].map((n) => {
  const root = (n as HTMLElement).closest(".wms, .iris, .cfl") as HTMLElement;
  const R = root.getBoundingClientRect();
  const r = n.getBoundingClientRect();
  let vis = true, o = 1;
  for (let e: Element | null = n; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") vis = false; o *= +cs.opacity; }
  return { x: (r.left + r.width / 2 - R.left) / R.width, y: (r.top + r.height / 2 - R.top) / R.height, w: r.width / R.width, h: r.height / R.height, o, vis: vis && o > 0.05 };
}), [sel] as const);
const one = async (page: Page, sel: string) => (await boxes(page, sel))[0];
// Pixels [r,g,b] of one screenshot at points given in fractions of a
// component root (rootSel), or of the viewport when rootSel is null.
const pixels = async (page: Page, pts: Array<[number, number]>, rootSel: string | null) => {
  const buf = await page.screenshot({ type: "png" });
  return page.evaluate(async ([b64, P, sel]) => {
    const R = sel ? document.querySelector(sel as string)!.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    return (P as Array<[number, number]>).map(([fx, fy]) => {
      const x = Math.max(0, Math.min(img.width - 1, Math.round(R.left + fx * R.width))), y = Math.max(0, Math.min(img.height - 1, Math.round(R.top + fy * R.height)));
      return [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
    });
  }, [buf.toString("base64"), pts, rootSel] as const);
};
const near = (p: number[], q: number[], tol = 24) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol;
const grey = (p: number[]) => Math.max(...p) - Math.min(...p) < 18 && Math.max(...p) < 110;
const ring = (cx: number, cy: number, r: number, n = 12): Array<[number, number]> => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI + 0.2), cy + r * Math.sin((i / n) * 2 * Math.PI + 0.2)]);
const BLUE = [45, 108, 223];
const TC = "/tmp/claude-0/-home-user-media-producer-mcp/c32dfa79-e27a-513d-b313-5e16cec01d25/scratchpad/tc/img";

const OPEN = { mode: "open", wordmark: "develop.", tagline: "from screen to wall.", label: "Develop", click_at: 2.25, hide_at: 2.5 };

describe("wordmark-squeeze open: the word squeezes into its period, the dot becomes the pill", () => {
  it("stands, squeezes toward the dot with the letters touching, grows into the pill and raises the label", async () => {
    await still([{ type: "wordmark-squeeze", dir: "titles", data: OPEN }], async (page, seek) => {
      for (const t of [0, 0.75, 0.8, 0.9, 1.1, 1.2, 1.4, 1.8, 2.3]) { await seek(t); await shot(page, `wms-open-${t}.png`); }
      await seek(0);
      const w0 = await one(page, ".wms-letters:not(.wms-ghost)");
      const d0 = await one(page, ".wms-dot");
      expect(w0.vis && d0.vis).toBe(true);
      expect(w0.w).toBeGreaterThan(0.5);
      // Centred: the word plus its period straddle x = 0.5.
      expect(Math.abs((w0.x - w0.w / 2 + (d0.x + d0.w / 2)) / 2 - 0.5)).toBeLessThan(0.04);
      expect(Math.abs(d0.y - 0.5)).toBeLessThan(0.005);
      expect((await one(page, ".wms-tag")).vis).toBe(true);
      // Mid-squeeze: narrower, its right edge still at the dot (touching), dot unchanged.
      await seek(0.85);
      const w1 = await one(page, ".wms-letters:not(.wms-ghost)");
      const d1 = await one(page, ".wms-dot");
      expect(w1.w).toBeLessThan(w0.w * 0.8);
      expect(w1.w).toBeGreaterThan(0.01);
      expect(Math.abs((w1.x + w1.w / 2) - (w0.x + w0.w / 2))).toBeLessThan(0.02);
      expect(Math.abs(d1.x - d0.x) + Math.abs(d1.w - d0.w)).toBeLessThan(0.001);
      await seek(0.95);
      expect((await one(page, ".wms-tagclip")).vis).toBe(false);
      await seek(0.99);
      const w2 = await one(page, ".wms-letters:not(.wms-ghost)");
      expect(w2.w).toBeLessThan(w0.w * 0.08);
      expect(Math.abs((w2.x + w2.w / 2) - d0.x)).toBeLessThan(d0.w);
      expect((await one(page, ".wms-dot")).vis).toBe(true);
      await seek(1.0);
      expect((await one(page, ".wms-letters:not(.wms-ghost)")).vis).toBe(false);
      // The pill at the contract geometry once the spring settles.
      await seek(1.9);
      const p = await one(page, ".wms-pill:not(.wms-ghostpill)");
      expect(p.vis).toBe(true);
      expect(Math.abs(p.x - 0.5)).toBeLessThan(0.003);
      expect(Math.abs(p.y - 0.5)).toBeLessThan(0.003);
      expect(Math.abs(p.w - 0.3)).toBeLessThan(0.003);
      expect(Math.abs(p.h - 0.085)).toBeLessThan(0.003);
      expect((await one(page, ".wms-dot")).vis).toBe(false);
      // The label sits inside it.
      await seek(2.1);
      const l = await one(page, ".wms-label-t");
      expect(l.vis).toBe(true);
      expect(await page.evaluate(() => document.querySelector(".wms-label-t")!.textContent)).toBe("Develop");
      expect(Math.abs(l.x - 0.5)).toBeLessThan(0.01);
      expect(Math.abs(l.y - 0.5)).toBeLessThan(0.01);
      expect(l.w).toBeLessThan(0.3);
      // Growth overshoots (a spring), then the click dips it and hide_at clears it.
      await seek(1.3);
      const g = await one(page, ".wms-pill:not(.wms-ghostpill)");
      await seek(1.4);
      const g2 = await one(page, ".wms-pill:not(.wms-ghostpill)");
      expect(Math.max(g.w, g2.w)).toBeGreaterThan(0.3);
      await seek(2.33);
      expect((await one(page, ".wms-pill:not(.wms-ghostpill)")).w).toBeLessThan(0.295);
      await seek(2.5);
      expect((await boxes(page, ".wms-pill")).every((b) => !b.vis)).toBe(true);
    });
  }, 60000);
});

describe("wordmark-squeeze return: pill -> dot -> the letters spring back out", () => {
  it("starts as the pill, lands in the dot, springs the word out, and ends on the open's first frame box for box", async () => {
    const SEL = [".wms-letters:not(.wms-ghost)", ".wms-dot", ".wms-tag", ".wms-tagclip"];
    const grab = async (page: Page) => { const out: Record<string, Box> = {}; for (const s of SEL) out[s] = await one(page, s); out.pill = await one(page, ".wms-pill:not(.wms-ghostpill)"); return out; };
    let first: Record<string, Box> = {};
    await still([{ type: "wordmark-squeeze", dir: "titles", data: OPEN }], async (page, seek) => { await seek(0); first = await grab(page); });
    await still([{ type: "wordmark-squeeze", dir: "titles", data: { mode: "return", wordmark: "develop.", tagline: "from screen to wall.", at: 0.5 } }], async (page, seek) => {
      for (const t of [0.5, 0.65, 0.8, 1.05, 1.2, 1.5, 2.0, 3.0]) { await seek(t); await shot(page, `wms-return-${t}.png`); }
      await seek(0.3);
      expect((await boxes(page, ".wms-pill, .wms-dot, .wms-letters, .wms-tag")).every((b) => !b.vis)).toBe(true);
      // The pill, at the contract geometry, no label.
      await seek(0.55);
      const p = await one(page, ".wms-pill:not(.wms-ghostpill)");
      expect(p.vis).toBe(true);
      expect(Math.abs(p.x - 0.5) + Math.abs(p.y - 0.5)).toBeLessThan(0.004);
      expect(Math.abs(p.w - 0.3) + Math.abs(p.h - 0.085)).toBeLessThan(0.004);
      expect((await one(page, ".wms-label-t")).vis).toBe(false);
      // The dot, where the period is, before the letters.
      await seek(1.0);
      const d = await one(page, ".wms-dot");
      expect(d.vis).toBe(true);
      expect(Math.abs(d.x - first[".wms-dot"].x) + Math.abs(d.y - first[".wms-dot"].y)).toBeLessThan(0.002);
      expect((await one(page, ".wms-letters:not(.wms-ghost)")).vis).toBe(false);
      // Springing out: past full width at the overshoot, the tagline not yet up.
      let peak = 0;
      for (const t of [1.1, 1.15, 1.2, 1.25, 1.3]) { await seek(t); peak = Math.max(peak, (await one(page, ".wms-letters:not(.wms-ghost)")).w); }
      expect(peak).toBeGreaterThan(first[".wms-letters:not(.wms-ghost)"].w * 1.005);
      expect((await one(page, ".wms-tagclip")).vis).toBe(false);
      // Last frame == the open's first frame.
      await seek(3.0);
      const last = await grab(page);
      for (const s of SEL) {
        expect(last[s].vis).toBe(first[s].vis);
        for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(last[s][k] - first[s][k])).toBeLessThan(0.0005);
      }
      expect(last.pill.vis).toBe(false);
      expect((await boxes(page, ".wms-ghost, .wms-ghostpill")).every((b) => !b.vis)).toBe(true);
    });
  }, 60000);
});

describe("iris: six blades close over the pill and snap open onto a photo", () => {
  it("grows from the pill into the circle, the blades cover the aperture, the photo fills the circle", async () => {
    const PILL = { x: 0.5, y: 0.5, w: 0.3, h: 0.085 };
    await still([{ type: "iris", dir: "effects", data: { from: PILL, image: PHOTO, label: "Develop", at: 0.2 } }], async (page, seek) => {
      for (const t of [0.2, 0.3, 0.4, 0.45, 0.5, 0.6, 0.7, 0.9]) { await seek(t); await shot(page, `iris-${t}.png`); }
      await seek(0.1);
      expect((await one(page, ".iris-box")).vis).toBe(false);
      // At `at` it IS the pill: same box, same label, no blades yet.
      await seek(0.2);
      const b0 = await one(page, ".iris-box");
      expect(b0.vis).toBe(true);
      for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(b0[k] - PILL[k])).toBeLessThan(0.002);
      expect((await one(page, ".iris-label-t")).vis).toBe(true);
      expect((await one(page, ".iris-blades")).vis).toBe(false);
      // Closed: the circle, and blades (graphite) over every part of the aperture.
      await seek(0.5);
      const b1 = await one(page, ".iris-box");
      expect(Math.abs(b1.w - 0.3) + Math.abs(b1.h - 0.3)).toBeLessThan(0.002);
      expect((await one(page, ".iris-blades")).vis).toBe(true);
      const cover = await pixels(page, [...ring(0.5, 0.5, 0.03), ...ring(0.5, 0.5, 0.08), ...ring(0.5, 0.5, 0.135)], ".iris");
      expect(cover.every(grey)).toBe(true);
      // Open: no blades, the photo at the circle geometry, the canvas outside it.
      await seek(0.9);
      expect((await one(page, ".iris-blades")).vis).toBe(false);
      const im = await one(page, ".iris-img");
      expect(im.vis).toBe(true);
      for (const [k, v] of [["x", 0.5], ["y", 0.5], ["w", 0.3], ["h", 0.3]] as const) expect(Math.abs(im[k] - v)).toBeLessThan(0.002);
      const ph = await pixels(page, [[0.4, 0.5], [0.6, 0.44], [0.5, 0.39], [0.5, 0.5], [0.5, 0.33], [0.2, 0.5]], ".iris");
      expect(ph.slice(0, 3).every((p) => near(p, BLUE))).toBe(true);
      expect(near(ph[3], [255, 90, 31], 40)).toBe(true);
      expect(near(ph[4], BLUE)).toBe(false);
      expect(near(ph[5], [239, 238, 234], 16)).toBe(true);
    });
  }, 60000);
  it("closes and opens inside a rounded rect too (the framed print on the wall)", async () => {
    await still([{ type: "iris", dir: "effects", data: { shape: "rect", w: 0.3, h: 0.4, radius: 0.004, image: PHOTO, backdrop: "#0b0b0c", at: 0, close_at: 0.1, open_at: 0.45 } }], async (page, seek) => {
      await seek(0.3);
      await shot(page, "iris-rect-closed.png");
      const b = await one(page, ".iris-box");
      expect(Math.abs(b.w - 0.3) + Math.abs(b.h - 0.4)).toBeLessThan(0.002);
      expect((await pixels(page, [[0.37, 0.32], [0.63, 0.68], [0.5, 0.42], [0.36, 0.5]], ".iris")).every(grey)).toBe(true);
      await seek(0.9);
      await shot(page, "iris-rect-open.png");
      expect((await pixels(page, [[0.37, 0.32], [0.63, 0.68]], ".iris")).every((p) => near(p, BLUE))).toBe(true);
    });
  }, 60000);
});

const CORNERS: Array<[number, number]> = [[0.002, 0.002], [0.998, 0.002], [0.002, 0.998], [0.998, 0.998]];
const BLACK = [11, 11, 12];
const CANVAS = [239, 238, 234];

describe("color-flood shape modes: the relay scene joins", () => {
  it("flood: the done circle overscales past every corner in ~0.3 s and holds the colour", async () => {
    await still([{ type: "color-flood", dir: "effects", data: { mode: "flood", color: "#0b0b0c", from_shape: { x: 0.5, y: 0.62, w: 0.12, h: 0.12 }, at: 0.5 } }], async (page, seek) => {
      for (const t of [0.5, 0.65, 0.75, 0.8]) { await seek(t); await shot(page, `flood-${t}.png`); }
      await seek(0.4);
      expect((await one(page, ".cfl-shape")).vis).toBe(false);
      await seek(0.5);
      const c = await one(page, ".cfl-shape");
      expect(c.vis).toBe(true);
      for (const [k, v] of [["x", 0.5], ["y", 0.62], ["w", 0.12], ["h", 0.12]] as const) expect(Math.abs(c[k] - v)).toBeLessThan(0.002);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".cfl-shape")!).borderTopLeftRadius)).not.toBe("0px");
      expect((await one(page, ".cfl-dot")).vis).toBe(false);
      // Mid-flood the corners are still the canvas: it grows, it does not cut.
      await seek(0.65);
      expect((await pixels(page, CORNERS, null)).some((p) => near(p, CANVAS, 16))).toBe(true);
      await seek(0.8);
      expect((await pixels(page, CORNERS, null)).every((p) => near(p, BLACK, 10))).toBe(true);
      await seek(3.5);
      expect((await pixels(page, [...CORNERS, [0.5, 0.5]], null)).every((p) => near(p, BLACK, 10))).toBe(true);
    });
    // A square-cornered print floods as well (radius 0).
    await still([{ type: "color-flood", dir: "effects", data: { mode: "flood", from_shape: { x: 0.5, y: 0.5, w: 0.3, h: 0.4, radius: 0 }, at: 0.2, flood_at: 0.5 } }], async (page, seek) => {
      await seek(0.45);
      expect((await pixels(page, [[0.5, 0.5], [0.36, 0.32]], null)).every((p) => near(p, BLACK, 10))).toBe(true);
      expect((await pixels(page, CORNERS, null)).every((p) => near(p, CANVAS, 16))).toBe(true);
      await seek(0.8);
      expect((await pixels(page, CORNERS, null)).every((p) => near(p, BLACK, 10))).toBe(true);
    });
  }, 60000);
  it("contract: solid at t=0, contracts into the pill (radius 0 -> round) and hands it on at hide_at", async () => {
    await still([{ type: "color-flood", dir: "effects", data: { mode: "contract", color: "#0b0b0c", to_shape: { x: 0.5, y: 0.5, w: 0.3, h: 0.085 }, at: 0.25, hide_at: 1.0 } }], async (page, seek) => {
      for (const t of [0, 0.3, 0.4, 0.55]) { await seek(t); await shot(page, `contract-${t}.png`); }
      await seek(0);
      expect((await pixels(page, [...CORNERS, [0.5, 0.5], [0.2, 0.7]], null)).every((p) => near(p, BLACK, 10))).toBe(true);
      await seek(0.25);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".cfl-shape")!).borderTopLeftRadius)).toBe("0px");
      await seek(0.6);
      const b = await one(page, ".cfl-shape");
      for (const [k, v] of [["x", 0.5], ["y", 0.5], ["w", 0.3], ["h", 0.085]] as const) expect(Math.abs(b[k] - v)).toBeLessThan(0.002);
      const rad = await page.evaluate(() => { const n = document.querySelector(".cfl-shape") as HTMLElement; return parseFloat(getComputedStyle(n).borderTopLeftRadius) / n.getBoundingClientRect().height; });
      expect(Math.abs(rad - 0.5)).toBeLessThan(0.02);
      expect((await pixels(page, CORNERS, null)).every((p) => near(p, CANVAS, 16))).toBe(true);
      await seek(1.0);
      expect((await one(page, ".cfl-shape")).vis).toBe(false);
    });
  }, 60000);
});

describe("the close as the film plays it: flood -> contract into the pill -> the word returns", () => {
  it("the contracted pill and the returning pill are the same box at the handoff", async () => {
    await still([
      { type: "color-flood", dir: "effects", data: { mode: "contract", to_shape: { x: 0.5, y: 0.5, w: 0.3, h: 0.085 }, at: 0.25, hide_at: 0.6 } },
      { type: "wordmark-squeeze", dir: "titles", data: { mode: "return", wordmark: "develop.", tagline: "from screen to wall.", at: 0.6 } },
    ], async (page, seek) => {
      for (const t of [0, 0.4, 0.6, 0.8, 0.95, 1.2, 1.5, 2.1, 3.0]) { await seek(t); await shot(page, `close-${t}.png`); }
      await seek(0.59);
      const a = await one(page, ".cfl-shape");
      await seek(0.6);
      const b = await one(page, ".wms-pill:not(.wms-ghostpill)");
      expect((await one(page, ".cfl-shape")).vis).toBe(false);
      for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.002);
    });
  }, 60000);
});

describe("the open as the film plays it: wordmark -> dot -> pill -> iris -> photo", () => {
  it("hands the pill to the iris on the same box, and matches the reference beats", async () => {
    const real = !!process.env.RELAY_SHOTS;
    const image = real ? `file://${TC}/door.jpg` : PHOTO;
    await still([
      { type: "wordmark-squeeze", dir: "titles", data: { ...OPEN, squeeze_at: 0.6, pill_at: 1.05, label_at: 1.6, click_at: 2.05, hide_at: 2.3 } },
      { type: "iris", dir: "effects", data: { from: { x: 0.5, y: 0.5, w: 0.3, h: 0.085 }, label: "Develop", image, at: 2.3, close_at: 2.35, open_at: 2.55 } },
    ], async (page, seek) => {
      for (const t of [0, 0.8, 1.2, 1.8, 2.4, 2.5, 2.6, 2.7, 2.9]) { await seek(t); await shot(page, `open-${t}.png`); }
      await seek(2.29);
      const pill = await one(page, ".wms-pill:not(.wms-ghostpill)");
      const lab0 = await one(page, ".wms-label-t");
      await seek(2.3);
      const ir = await one(page, ".iris-box");
      const lab1 = await one(page, ".iris-label-t");
      expect((await one(page, ".wms-pill:not(.wms-ghostpill)")).vis).toBe(false);
      for (const k of ["x", "y", "w", "h"] as const) { expect(Math.abs(pill[k] - ir[k])).toBeLessThan(0.002); expect(Math.abs(lab0[k] - lab1[k])).toBeLessThan(0.003); }
    });
  }, 60000);
});
