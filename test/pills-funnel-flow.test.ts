import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Polish audit part 5: floating-pills (18 films), funnel-chart (13) and
// flowchart (5) rebuilt, measured on the real films' data.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOLDER: Record<string, string> = { "floating-pills": "props", "funnel-chart": "data-viz", flowchart: "data-viz", "kinetic-text": "titles" };
const SRC = (t: string) => fs.readFile(path.resolve(__dirname, `../src/components/${FOLDER[t]}/${t}.component.html`), "utf-8");
const BRAND = { colors: { primary: "#393bf5", secondary: "#d48c34", accent: "#17171c", background: "#ffffff", text: "#17171c", text_muted: "#8f8f9f" }, fonts: [] };

type Comp = { type: string; data: unknown; position?: unknown };
async function open(comps: Comp[], run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>) {
  const types = [...new Set(comps.map((c) => c.type))];
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 6, background: "#fafaf8",
      components: comps.map((c, i) => ({ id: "c" + i, type: c.type, position: c.position || { x: "center", y: "center" }, data: c.data })) } as any,
    components: await Promise.all(types.map(async (t) => ({ type: t, source: await SRC(t) }))),
    brandKit: BRAND as any, canvas: { width: 1920, height: 1080 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pff-"));
  await fs.writeFile(path.join(dir, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(dir, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

type R = { l: number; t: number; r: number; b: number };
const rects = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }), sel);
const overlap = (a: R, b: R) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const inFrame = (a: R) => a.l >= 0 && a.t >= 0 && a.r <= 1920 && a.b <= 1080;

describe("floating-pills", () => {
  it("orbit: chips clear the headline (built AFTER them), each other and the frame, at video size", async () => {
    await open([
      { type: "floating-pills", data: { items: ["Strategist", "Copywriter", "Designer", "Scheduler", "Analyst"], color: "#6366f9", seed: 2, at: 0.05 }, position: { x: 0, y: 0, width: "100%", height: "100%" } },
      { type: "kinetic-text", data: { text: "Five people. One conversation.", font_size: 72 }, position: { x: "15%", y: "40%", width: "70%", height: "20%" } },
    ], async (page, seek) => {
      for (const t of [1.5, 3.5, 5.5]) {
        await seek(t);
        const pills = await rects(page, ".flpl-pill");
        const words = await page.evaluate(() => [...document.querySelectorAll(".kinetic-text *")].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim())).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
        expect(pills.length).toBe(5);
        expect(words.length).toBeGreaterThan(0); // the headline was measured
        for (const p of pills) {
          expect(inFrame(p)).toBe(true);
          for (const w of words) if (w.r - w.l > 2) expect(overlap(p, w)).toBe(false);
        }
        for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) expect(overlap(pills[i], pills[j])).toBe(false);
      }
      const h = Math.min(...(await rects(page, ".flpl-pill")).map((r) => r.b - r.t));
      expect(h).toBeGreaterThan(50); // the audit measured 12-24px chips
    });
  }, 60000);

  it("strip: twelve chips in a short band all show whole, none overlapping", async () => {
    const items = ["Email", "Ads", "Analytics", "Alerts", "Chat", "Calendar", "Settings", "Tasks", "Dashboard", "App", "Targeting", "Reports"];
    await open([{ type: "floating-pills", data: { items, color: "#9096a8", font_size: "20px", seed: 7, at: 0, scale: 1.8 }, position: { x: "0%", y: "52%", width: "100%", height: "30%" } }], async (page, seek) => {
      await seek(4);
      const pills = await rects(page, ".flpl-pill");
      expect(pills.length).toBe(12);
      for (const p of pills) { expect(inFrame(p)).toBe(true); expect(p.t).toBeGreaterThanOrEqual(1080 * 0.52 - 1); expect(p.b).toBeLessThanOrEqual(1080 * 0.82 + 1); }
      for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) expect(overlap(pills[i], pills[j])).toBe(false);
    });
  }, 60000);
});

describe("funnel-chart", () => {
  it("keeps small stages readable on a log scale, counts up, and states each step and the end-to-end rate", async () => {
    const stages = [{ label: "Impressions", value: 48200 }, { label: "Clicks", value: 3184 }, { label: "Site Sessions", value: 2412 }, { label: "Conversions", value: 187 }];
    await open([{ type: "funnel-chart", data: { title: "Q3 Launch", stages, show_retention: true }, position: { x: "8%", y: "6.5%", width: "84%", height: "87%" } }], async (page, seek) => {
      await seek(5.5);
      const m = await page.evaluate(() => ({
        bands: [...document.querySelectorAll(".fn-band")].map((b) => ({ text: b.textContent, frac: (b as HTMLElement).offsetWidth / (b.parentElement as HTMLElement).clientWidth })),
        rates: [...document.querySelectorAll(".fn-rate")].map((r) => r.textContent), total: document.querySelector(".fn-total b")!.textContent,
      }));
      expect(m.bands.map((b) => b.text)).toEqual(["48,200", "3,184", "2,412", "187"]);
      expect(m.bands[0].frac).toBeGreaterThan(0.99);
      expect(m.bands[1].frac).toBeGreaterThan(0.5); // linear drew 6.6%
      expect(Math.min(...m.bands.map((b) => b.frac))).toBeGreaterThanOrEqual(0.35);
      expect(m.rates).toEqual(["", "6.6%", "76%", "7.8%"]);
      expect(m.total).toBe("0.39%");
    });
  }, 60000);
});

describe("flowchart", () => {
  it("lays a chain out inside the frame on one line each, arrowheads landing with their lines", async () => {
    const nodes = ["Welcome Email", "Wait 2 Days", "Follow-up", "Wait 3 Days", "Offer"].map((label, i) => ({ id: String(i + 1), label }));
    const edges = [0, 1, 2, 3].map((i) => ({ from: String(i + 1), to: String(i + 2) }));
    await open([{ type: "flowchart", data: { direction: "LR", nodes, edges }, position: { x: 0, y: 0, width: "100%", height: "100%" } }], async (page, seek) => {
      await seek(0.3);
      const early = await page.evaluate(() => [...document.querySelectorAll(".fc-edges path:not([stroke-width])")].map((h) => +getComputedStyle(h).opacity));
      expect(early.every((o) => o === 0)).toBe(true);
      await seek(5.5);
      const m = await page.evaluate(() => ({
        heads: [...document.querySelectorAll(".fc-edges path:not([stroke-width])")].map((h) => +getComputedStyle(h).opacity),
        lines: [...document.querySelectorAll(".fc-node")].map((n) => Math.round((n as HTMLElement).clientHeight / parseFloat(getComputedStyle(n).lineHeight))),
        nodes: [...document.querySelectorAll(".fc-node")].map((n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height }; }),
      }));
      expect(m.heads.length).toBe(4);
      expect(m.heads.every((o) => o === 1)).toBe(true);
      for (const n of m.nodes) { expect(n.l).toBeGreaterThan(20); expect(n.r).toBeLessThan(1900); }
      // One line each: every node the same height as the one-word "Offer".
      expect(new Set(m.nodes.map((n) => Math.round(n.h))).size).toBe(1);
    });
  }, 60000);

  it("fans a branch out, each child on its own row", async () => {
    const nodes = [{ id: "agent", label: "Agent" }, ...["Email", "LinkedIn", "X", "Blog", "Web"].map((l) => ({ id: l, label: l }))];
    const edges = nodes.slice(1).map((n) => ({ from: "agent", to: n.id }));
    await open([{ type: "flowchart", data: { direction: "horizontal", nodes, edges }, position: { x: "3%", y: "8%", width: "58%", height: "84%" } }], async (page, seek) => {
      await seek(5.5);
      const r = await rects(page, ".fc-node");
      expect(r.length).toBe(6);
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(overlap(r[i], r[j])).toBe(false);
      const kids = r.slice(1);
      expect(new Set(kids.map((k) => Math.round(k.l))).size).toBe(1); // one column
    });
  }, 60000);
});
