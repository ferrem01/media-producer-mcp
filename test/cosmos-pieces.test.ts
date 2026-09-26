import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// The Cosmos promo (Zsolt Kacso, HyperFrames + Opus 5.5): a 40 s oner where
// every beat hands off through an object -- a wall of images spirals into
// the logo, the logo's dot swells into the search bar, a colour dot floods
// the frame, a control filters a grid. Marc: "do all the suggested items".
// Each piece checked in a 16:9 still (set COSMOS_SHOTS=<dir> to keep frames).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svg = (hue: number) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${hue},55%,55%)"/></svg>`);
const IMGS = Array.from({ length: 36 }, (_, i) => svg((i * 37) % 360));

async function still(comps: Array<{ type: string; dir: string; data: unknown; position?: unknown }>, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, duration = 8) {
  const sources: Array<{ type: string; source: string }> = [];
  for (const c of comps) if (!sources.some((s) => s.type === c.type)) sources.push({ type: c.type, source: await fs.readFile(path.resolve(__dirname, `../src/components/${c.dir}/${c.type}.component.html`), "utf-8") });
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: duration, background: "#f5f4f0", components: comps.map((c, i) => ({ id: "c" + i, type: c.type, data: c.data, position: c.position || { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 10 + i })) } as any,
    components: sources, brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any, canvas: { width: 1920, height: 1080 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cosmos-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
const shot = async (page: Page, name: string) => { if (process.env.COSMOS_SHOTS) await page.screenshot({ path: path.join(process.env.COSMOS_SHOTS, name) }); };
const boxes = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)].map((n) => {
  const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, o: +cs.opacity, vis: cs.visibility !== "hidden" && +cs.opacity > 0.05 };
}), sel);

describe("image-swarm: one set of images changing formation, never cutting", () => {
  it("a wall rises and fills the width, tilts, spirals into a cluster and collapses to a point", async () => {
    await still([{ type: "image-swarm", dir: "threed", data: { images: IMGS, formations: [
      { shape: "wall", at: 0.1, top: 0.33 }, { shape: "wall", at: 1.8, top: 0.33, group: { rotateX: 24, rotateZ: -22, scale: 0.92 } },
      { shape: "cluster", at: 2.8, duration: 0.8, group: { rotateZ: 160, rotateX: 0, scale: 1 } }, { shape: "point", at: 3.9, duration: 0.5 }] } }], async (page, seek) => {
      await seek(1.6);
      const wall = (await boxes(page, ".isw-item")).filter((b) => b.vis);
      await shot(page, "swarm-wall.png");
      expect(Math.max(...wall.map((b) => b.x)) - Math.min(...wall.map((b) => b.x))).toBeGreaterThan(1920 * 0.8);
      expect(Math.min(...wall.map((b) => b.y - b.h / 2))).toBeGreaterThan(1080 * 0.25);
      await seek(3.75);
      const pile = (await boxes(page, ".isw-item")).filter((b) => b.vis);
      const spread = Math.max(...pile.map((b) => Math.hypot(b.x - 960, b.y - 540)));
      expect(spread).toBeLessThan(1920 * 0.12);
      await seek(4.6);
      expect((await boxes(page, ".isw-item")).every((b) => !b.vis)).toBe(true);
    });
  }, 60000);
  it("a scatter pulls into a spinning sphere; a flythrough streams past the lens and lands on a grid", async () => {
    await still([{ type: "image-swarm", dir: "threed", data: { images: IMGS, formations: [{ shape: "scatter", at: 0.1, from: "depth" }, { shape: "sphere", at: 1.0, duration: 1.0, hold: 3 }] } }], async (page, seek) => {
      await seek(2.6);
      const a = (await boxes(page, ".isw-item")).filter((b) => b.vis);
      await shot(page, "swarm-sphere.png");
      expect(a.every((b) => Math.hypot(b.x - 960, b.y - 1080 * 0.47) < 1080 * 0.34 + 120)).toBe(true);
      await seek(3.6);
      const b = (await boxes(page, ".isw-item")).filter((x) => x.vis);
      // It turns: the same tiles are somewhere else a second later.
      expect(a.some((p, i) => b[i] && Math.abs(p.x - b[i].x) > 20)).toBe(true);
    });
    await still([{ type: "image-swarm", dir: "threed", data: { images: IMGS, formations: [{ shape: "flythrough", at: 0, duration: 4 }, { shape: "grid", at: 3.8, duration: 0.9, count: 8, cols: 4, cell: 0.1 }] } }], async (page, seek) => {
      await seek(1.5);
      const f = (await boxes(page, ".isw-item")).filter((b) => b.vis);
      // Some tiles are already close to the lens (big), others far (small).
      expect(Math.max(...f.map((b) => b.w))).toBeGreaterThan(3 * Math.min(...f.map((b) => b.w)));
      await seek(5.2);
      const g = (await boxes(page, ".isw-item")).filter((b) => b.vis);
      await shot(page, "swarm-grid.png");
      expect(g.length).toBe(8);
      expect(new Set(g.map((b) => Math.round(b.w))).size).toBe(1);
    }, 6);
  }, 90000);
});

describe("the dot handoffs: logo -> dot -> search bar", () => {
  it("the dot ring assembles, collapses into one dot that travels, and the bar grows from where it lands", async () => {
    await still([
      { type: "dot-logo", dir: "titles", data: { wordmark: "COSMOS", tagline: "Your space for inspiration", at: 0.2, collapse_at: 2.2, move: { x: 0.5, y: 0.535, scale: 1.4 } } },
      { type: "search-bar", dir: "ui-mocks", position: { x: "30%", y: "51%", width: "40%", height: "5%" }, data: { from: "dot", at: 3.6, placeholder: "Try 'scandinavian furniture'", steps: [{ at: 5.2, type: "warm minimal interiors" }, { at: 6.8, submit: true }, { at: 7.2, chip: { color: "#BC361B" } }] } },
    ], async (page, seek) => {
      await seek(1.6);
      const ring = (await boxes(page, ".dlg-dot")).filter((b) => b.vis);
      expect(ring.length).toBe(7);
      expect(await page.evaluate(() => document.querySelector(".dlg-word")!.textContent)).toBe("COSMOS");
      await seek(3.8);
      const one = (await boxes(page, ".dlg-dot")).filter((b) => b.vis);
      expect(one.length).toBe(1);
      expect(Math.abs(one[0].x - 960)).toBeLessThan(4);
      expect(Math.abs(one[0].y - 1080 * 0.535)).toBeLessThan(4);
      const bar = async () => (await boxes(page, ".sbr-bar"))[0];
      await seek(3.9);
      const small = await bar();
      await seek(5.0);
      const full = await bar();
      expect(small.w).toBeLessThan(80);
      expect(full.w).toBeGreaterThan(700);
      // It grows in place: the dot's centre is the bar's centre.
      expect(Math.abs(small.x - full.x)).toBeLessThan(3);
      expect(Math.abs(small.y - one[0].y)).toBeLessThan(6);
      await seek(6.6);
      await shot(page, "search-typed.png");
      expect(await page.evaluate(() => document.querySelector(".sbr-val")!.textContent)).toBe("warm minimal interiors");
      await seek(7.4);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".sbr-chip")!).display)).not.toBe("none");
      // Scrubbing back past the chip takes it away again.
      await seek(7.0);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".sbr-chip")!).display)).toBe("none");
    });
  }, 60000);
});

describe("color-flood: a dot drops and floods the frame", () => {
  it("floods every corner in the colour, names it, and pulls back", async () => {
    await still([{ type: "color-flood", dir: "effects", data: { color: "#BC361B", from_y: 0.08, at: 0.2, label: "#BC361B", sublabel: "Search by color.", retract_at: 3.0 } }], async (page, seek) => {
      await seek(2.2);
      await shot(page, "flood.png");
      const px = await page.evaluate(() => {
        const r = (document.querySelector(".cfl-dot") as HTMLElement).getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom };
      });
      // The circle's inscribed square covers the frame: every corner is flooded.
      const cx = (px.l + px.r) / 2, cy = (px.t + px.b) / 2, rad = (px.r - px.l) / 2;
      for (const [x, y] of [[0, 0], [1920, 0], [0, 1080], [1920, 1080]]) expect(Math.hypot(x - cx, y - cy)).toBeLessThan(rad);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".cfl-text")!).opacity)).toBe("1");
      await seek(3.95);
      expect((await boxes(page, ".cfl-dot"))[0].vis).toBe(false);
    }, 4);
  }, 60000);
});

describe("filter-grid: a control drives a grid", () => {
  it("Blur flags the AI tile under a pill; Hide takes it out and the rest reflow", async () => {
    const items = IMGS.slice(0, 6).map((src, i) => (i === 1 ? { src, flag: "Likely AI" } : { src }));
    await still([{ type: "filter-grid", dir: "data-viz", data: { items, cols: 3, cell: 0.1, x: 0.25, y: 0.5, control: { title: "AI content", subtitle: "Content detected as likely generated by AI", options: ["Show", "Blur", "Hide"], x: 0.6, y: 0.36 }, steps: [{ at: 1.4, option: "Blur" }, { at: 2.8, option: "Hide" }] } }], async (page, seek) => {
      await seek(2.4);
      await shot(page, "filter-blur.png");
      const st = await page.evaluate(() => { const it = document.querySelectorAll(".fgr-item")[1]; const pill = it.querySelector(".fgr-pill") as HTMLElement; const ir = it.getBoundingClientRect(), pr = pill.getBoundingClientRect(); return { f: getComputedStyle(it.querySelector("img")!).filter, po: +getComputedStyle(pill).opacity, inside: pr.left >= ir.left && pr.right <= ir.right }; });
      expect(st.f).toMatch(/blur/);
      expect(st.po).toBe(1);
      expect(st.inside).toBe(true);
      const slot1 = (await boxes(page, ".fgr-item"))[1];
      await seek(4.2);
      const tiles = await boxes(page, ".fgr-item");
      expect(tiles.filter((b) => b.vis).length).toBe(5);
      // The tile that was third now sits where the hidden second one was
      // (within the scene's slow camera push, ~1% over the two seconds).
      expect(Math.abs(tiles[2].x - slot1.x)).toBeLessThan(12);
      expect(Math.abs(tiles[2].y - slot1.y)).toBeLessThan(12);
    }, 5);
  }, 60000);
  it("keep-only sends the rest flying and snaps the matches into a framed grid", async () => {
    const items = IMGS.slice(0, 24).map((src, i) => (i % 3 === 0 ? { src, tags: ["red"] } : { src }));
    await still([{ type: "filter-grid", dir: "data-viz", data: { items, cols: 8, cell: 0.075, x: 0.5, y: 0.55, steps: [{ at: 1.2, action: "keep", match: "red", cols: 4, cell: 0.085, x: 0.5, y: 0.45 }] } }], async (page, seek) => {
      await seek(3.4);
      await shot(page, "filter-keep.png");
      expect((await boxes(page, ".fgr-item")).filter((b) => b.vis).length).toBe(8);
      expect((await boxes(page, ".fgr-frame"))[0].vis).toBe(true);
    }, 4);
  }, 60000);
});

describe("the small pieces", () => {
  it("kinetic-text focus: each word comes into focus in place on its beat", async () => {
    await still([{ type: "kinetic-text", dir: "titles", position: { x: "10%", y: "40%", width: "80%", height: "20%" }, data: { text: "Every search opens a new world.", entrance: "focus", at: 0.3, word_interval: 0.3, font_size: "72px" } }], async (page, seek) => {
      await seek(0.95);
      const f = await page.evaluate(() => [...document.querySelectorAll(".kinetic-text span")].map((s) => ({ f: getComputedStyle(s).filter, o: +getComputedStyle(s).opacity })));
      expect(f[0].f).toBe("blur(0px)");
      expect(f[0].o).toBe(1);
      expect(f[5].o).toBe(0);
    }, 3);
  }, 60000);
  it("image-graph draws its lines out to the related images; collect-board counts as they land; image-scan brackets, chips and swaps", async () => {
    await still([
      { type: "image-graph", dir: "data-viz", data: { center: IMGS[0], nodes: IMGS.slice(1, 7), at: 0.2 } },
    ], async (page, seek) => {
      await seek(3.5);
      const lines = await page.evaluate(() => [...document.querySelectorAll(".igr-lines line")].map((l) => +l.getAttribute("stroke-dashoffset")!));
      expect(lines.length).toBe(6);
      expect(lines.every((v) => v < 1)).toBe(true);
    }, 5);
    await still([
      { type: "collect-board", dir: "ui-mocks", position: { x: "50%", y: "18%", width: "42%", height: "64%" }, data: { title: "future home", count_from: 47, items: IMGS.slice(0, 12), cols: 4, every: 0.3 } },
      { type: "image-scan", dir: "media", position: { x: "4%", y: "12%", width: "30%", height: "76%" }, data: { images: IMGS.slice(20, 23), every: 1.3 } },
    ], async (page, seek) => {
      await seek(1.3);
      const mid = Number(await page.evaluate(() => document.querySelector(".cbd-count b")!.textContent));
      expect(mid).toBeGreaterThan(47);
      expect(mid).toBeLessThan(59);
      await seek(5.0);
      await shot(page, "board-scan.png");
      expect(await page.evaluate(() => document.querySelector(".cbd-count b")!.textContent)).toBe("59");
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".isc-chip")!).opacity)).toBe("1");
      const shown = await page.evaluate(() => [...document.querySelectorAll(".isc-imgs img")].map((i) => +getComputedStyle(i).opacity));
      expect(shown[2]).toBe(1);
    }, 6);
  }, 90000);
});

describe("the close: the button's label never clips, and the link can stack under it", () => {
  it("cta-card actions:'stack' keeps 'Sign up for Cosmos' whole in a narrow box, the link below it", async () => {
    await still([{ type: "cta-card", dir: "cta", position: { x: "30%", y: "25%", width: "40%", height: "45%" },
      data: { description: "Dream with us.", button_text: "Sign up for Cosmos", button_color: "#111111", secondary_text: "Download the app", url: "cosmos.so", arrow: false, surface: "none", actions: "stack", at: 0.1 } }], async (page, seek) => {
      await seek(2.5);
      const m = await page.evaluate(() => {
        const b = document.querySelector(".cta-button") as HTMLElement, l = document.querySelector(".cta-label") as HTMLElement, s = document.querySelector(".cta-secondary") as HTMLElement;
        const rb = b.getBoundingClientRect(), rl = l.getBoundingClientRect(), rs = s.getBoundingClientRect();
        return { labelIn: rl.right <= rb.right + 0.5 && rl.left >= rb.left - 0.5, below: rs.top >= rb.bottom - 0.5 };
      });
      expect(m).toEqual({ labelIn: true, below: true });
    });
  });

  it("dot-logo: the tagline has landed before the collapse, so nothing lingers under the travelling dot", async () => {
    await still([{ type: "dot-logo", dir: "titles", data: { at: 0.2, wordmark: "COSMOS", tagline: "Your space for inspiration", tagline_at: 1.4, collapse_at: 1.4, move: { x: 0.5, y: 0.6, at: 2.1, fade: false } } }], async (page, seek) => {
      // Played forward, as the render does: each frame renders the tweens in order.
      for (const t of [0.8, 1.3, 1.5, 1.8, 2.2, 3]) await seek(t);
      expect(await page.evaluate(() => +getComputedStyle(document.querySelector(".dlg-tag")!).opacity)).toBeLessThan(0.05);
    });
  });
});
