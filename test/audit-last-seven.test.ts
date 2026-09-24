import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// The last seven HyperFrames-audit gaps: media-grid, video fill:'blur',
// feature-map, donut-chart, speech-bubble, device-dive, page-scroll.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOLDER: Record<string, string> = { "media-grid": "media", video: "media", "feature-map": "data-viz", "donut-chart": "data-viz", "speech-bubble": "props", "device-dive": "media", "page-scroll": "media" };
const SRC = (t: string) => fs.readFile(path.resolve(__dirname, `../src/components/${FOLDER[t]}/${t}.component.html`), "utf-8");
const svg = (w: number, h: number, c = "#8fa3ff") => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${c}"/><rect y="${h / 2}" width="100%" height="${h / 2}" fill="#23285f"/></svg>`);

async function open(type: string, data: unknown, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, opts: { w?: number; h?: number; position?: unknown; background?: string; duration?: number } = {}) {
  const W = opts.w || 1920, H = opts.h || 1080;
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: opts.duration || 7, background: opts.background || "#fafaf8", components: [{ id: "c0", type, position: opts.position || { x: "center", y: "center" }, data }] } as any,
    components: [{ type, source: await SRC(type) }],
    brandKit: { colors: { primary: "#393bf5", secondary: "#d48c34", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "l7-"));
  await fs.writeFile(path.join(dir, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(dir, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), undefined, { timeout: 10000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
type R = { l: number; t: number; r: number; b: number };
const box = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }), sel);
const overlap = (a: R, b: R) => a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1;

describe("media-grid", () => {
  it("lays three out as a hero and two, inside the frame, and rings the highlight", async () => {
    const items = [1, 2, 3].map((i) => ({ src: svg(1200, 700), caption: "Shot " + i }));
    await open("media-grid", { items, highlight: 1, highlight_at: 2 }, async (page, seek) => {
      await seek(4);
      const t = await box(page, ".mg-tile");
      expect(t.length).toBe(3);
      expect(t[0].r - t[0].l).toBeGreaterThan((t[1].r - t[1].l) * 1.3); // the hero
      for (let i = 0; i < 3; i++) { expect(t[i].l).toBeGreaterThan(0); expect(t[i].r).toBeLessThan(1920); for (let j = i + 1; j < 3; j++) expect(overlap(t[i], t[j])).toBe(false); }
      const o = await page.evaluate(() => [...document.querySelectorAll(".mg-tile")].map((e) => +getComputedStyle(e).opacity));
      expect(o[1]).toBe(1);
      expect(o[0]).toBeLessThan(0.5);
    });
  }, 60000);
});

describe("video fill:'blur'", () => {
  it("adds a blurred cover copy under a contained copy of the same clip", async () => {
    await open("video", { src: "clip.webm", fill: "blur" }, async (page) => {
      const v = await page.evaluate(() => [...document.querySelectorAll("video")].map((e) => ({ src: e.getAttribute("src"), filter: (e as HTMLElement).style.filter, fit: getComputedStyle(e).objectFit })));
      expect(v.length).toBe(2);
      expect(v[0].filter).toMatch(/blur/);
      expect(v[0].fit).toBe("cover");
      expect(v[1].fit).toBe("contain");
      expect(v[0].src).toBe(v[1].src);
    }, { w: 1080, h: 1920 });
  }, 60000);
});

describe("feature-map", () => {
  it("places every node clear of the others and the hub, and draws every connector", async () => {
    const nodes = ["HubSpot", "Salesforce", "Slack", "LinkedIn", "Gmail", "Stripe", "Zapier"].map((l) => ({ label: l, sub: "Sync" }));
    await open("feature-map", { hub: "Quotient", nodes }, async (page, seek) => {
      await seek(6.5);
      const n = await box(page, ".fm-node"), hub = (await box(page, ".fm-hub"))[0];
      expect(n.length).toBe(7);
      for (let i = 0; i < n.length; i++) {
        expect(overlap(n[i], hub)).toBe(false);
        expect(n[i].l).toBeGreaterThanOrEqual(0); expect(n[i].r).toBeLessThanOrEqual(1920); expect(n[i].t).toBeGreaterThanOrEqual(0); expect(n[i].b).toBeLessThanOrEqual(1080);
        for (let j = i + 1; j < n.length; j++) expect(overlap(n[i], n[j])).toBe(false);
      }
      const off = await page.evaluate(() => [...document.querySelectorAll(".fm-lines path")].map((p) => parseFloat(getComputedStyle(p).strokeDashoffset)));
      expect(off.length).toBe(7);
      expect(Math.max(...off)).toBeLessThan(1);
    });
  }, 60000);
});

describe("donut-chart", () => {
  it("sweeps the whole ring, counts each share, and centres the highlighted one", async () => {
    const segments = [{ label: "Email", value: 1120 }, { label: "LinkedIn", value: 640 }, { label: "Organic", value: 410 }, { label: "Paid", value: 240 }];
    await open("donut-chart", { title: "Signups", segments, highlight: 0 }, async (page, seek) => {
      await seek(6.5);
      const m = await page.evaluate(() => {
        const C = 2 * Math.PI * 80;
        const arcs = [...document.querySelectorAll(".dn-svg circle")].slice(1).map((c) => parseFloat((c as HTMLElement).style.strokeDasharray));
        return { sum: arcs.reduce((a, b) => a + b, 0) / C, pcts: [...document.querySelectorAll(".dn-pct")].map((p) => p.textContent), big: document.querySelector(".dn-big")!.textContent };
      });
      expect(m.sum).toBeGreaterThan(0.97);
      expect(m.pcts).toEqual(["46%", "27%", "17%", "10%"]);
      expect(m.big).toBe("46%");
    }, { position: { x: "8%", y: "8%", width: "84%", height: "84%" } });
  }, 60000);
});

describe("speech-bubble", () => {
  it("shows every word by the end, stays in its box, tail on the named side", async () => {
    await open("speech-bubble", { text: "We shipped the whole launch in an afternoon.", tail: "bottom-right" }, async (page, seek) => {
      await seek(4.5);
      const m = await page.evaluate(() => {
        const b = document.querySelector(".sb-bubble")!.getBoundingClientRect(), t = document.querySelector(".sb-tail")!.getBoundingClientRect();
        const host = document.querySelector('[data-cid="c0"]')!.getBoundingClientRect();
        return { words: [...document.querySelectorAll(".sb-text span")].map((s) => +getComputedStyle(s).opacity), inside: b.left >= host.left - 1 && b.right <= host.right + 1 && b.top >= host.top - 1,
          tailRight: t.left > b.left + b.width / 2, tailBelow: t.top >= b.bottom - 4 };
      });
      expect(m.words.every((o) => o === 1)).toBe(true);
      expect(m.inside).toBe(true);
      expect(m.tailRight).toBe(true);
      expect(m.tailBelow).toBe(true);
    }, { position: { x: "45%", y: "15%", width: "45%", height: "30%" }, duration: 5 });
  }, 60000);
});

describe("device-dive", () => {
  it("pushes through the screen until it covers the frame, then the full UI takes over", async () => {
    await open("device-dive", { src: svg(390, 844), after_src: svg(1600, 900, "#c9d2ff"), dive_at: 2 }, async (page, seek) => {
      await seek(1.5);
      const before = (await box(page, ".dd-screen"))[0];
      expect(before.r - before.l).toBeLessThan(700); // a phone in the frame
      await seek(6.5);
      const s = (await box(page, ".dd-screen"))[0];
      expect(s.l).toBeLessThanOrEqual(0); expect(s.t).toBeLessThanOrEqual(0); expect(s.r).toBeGreaterThanOrEqual(1920); expect(s.b).toBeGreaterThanOrEqual(1080);
      expect(await page.evaluate(() => +getComputedStyle(document.querySelector(".dd-after")!).opacity)).toBe(1);
    });
  }, 60000);
});

describe("page-scroll", () => {
  it("starts at the top and settles with the page's bottom at the window's bottom", async () => {
    await open("page-scroll", { src: svg(1200, 4000), stops: [{ to: 0.5, caption: "Half" }, { to: 1, caption: "End" }] }, async (page, seek) => {
      const at = async (t: number) => { await seek(t); return page.evaluate(() => { const v = document.querySelector(".ps-view")!.getBoundingClientRect(), p = document.querySelector(".ps-page")!.getBoundingClientRect(); return { top: p.top - v.top, bottomGap: p.bottom - v.bottom }; }); };
      expect(Math.abs((await at(0.5)).top)).toBeLessThan(1);
      expect(Math.abs((await at(6.8)).bottomGap)).toBeLessThan(2);
      const cap = await page.evaluate(() => [...document.querySelectorAll(".ps-cap")].map((c) => +getComputedStyle(c).opacity));
      expect(cap).toEqual([0, 1]);
    });
  }, 60000);
});
