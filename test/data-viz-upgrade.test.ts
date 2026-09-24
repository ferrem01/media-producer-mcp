import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Polish audit part 3: the data-viz family. line-chart rebuilt (series,
// legend, riding dot, end values, highlight), progress-bar ring + stars,
// bar-chart in the brand with the key bar emphasized.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (t: string) => fs.readFile(path.resolve(__dirname, `../src/components/data-viz/${t}.component.html`), "utf-8");

async function open(comps: Array<{ type: string; data: unknown; position?: unknown }>, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>) {
  const types = [...new Set(comps.map((c) => c.type))];
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 5, background: "#ffffff",
      components: comps.map((c, i) => ({ id: "c" + i, type: c.type, position: c.position || { x: "5%", y: "5%", width: "90%", height: "90%" }, data: c.data })) } as any,
    components: await Promise.all(types.map(async (t) => ({ type: t, source: await SRC(t) }))),
    brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1920, height: 1080 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dv-"));
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

describe("line-chart", () => {
  it("draws two series with a legend, a dot riding each tip, the end values, and a highlight pill", async () => {
    const data = { title: "Signups", x_labels: ["W1", "W2", "W3", "W4", "W5"], highlight: { index: 2, text: "Flows on" },
      series: [{ name: "With", points: [100, 200, 400, 700, 1140] }, { name: "Before", points: [100, 110, 120, 130, 160] }] };
    await open([{ type: "line-chart", data }, { type: "line-chart", data, position: { x: "0%", y: "0%", width: "30%", height: "30%" } }], async (page, seek) => {
      await seek(4.2);
      const m = await page.evaluate(() => {
        const c = document.querySelector('[data-cid="c0"]')!;
        const texts = [...c.querySelectorAll("svg text")].map((t) => t.textContent);
        const ids = [...document.querySelectorAll("linearGradient")].map((g) => g.id);
        const dots = [...c.querySelectorAll("svg > circle")].map((d) => +d.getAttribute("cx")!);
        const lines = [...c.querySelectorAll("svg > path[stroke]")].map((p) => parseFloat(getComputedStyle(p).strokeDashoffset));
        return { texts, ids, dots, lines, legend: [...c.querySelectorAll(".lc-key")].map((k) => k.textContent) };
      });
      expect(m.legend).toEqual(["With", "Before"]);
      expect(m.texts).toContain("1,140");
      expect(m.texts).toContain("160");
      expect(m.texts).toContain("Flows on");
      expect(Math.max(...m.lines)).toBeLessThan(1); // fully drawn
      expect(new Set(m.ids).size).toBe(m.ids.length); // two charts, no clashing gradient ids
      // The riding dots ended at the last point (the right edge of the plot).
      expect(Math.min(...m.dots)).toBeGreaterThan(Math.max(...m.dots) - 2);
    });
  }, 60000);
});

describe("progress-bar ring and stars", () => {
  it("the ring draws to its value and counts up; the stars fill to a fraction", async () => {
    await open([
      { type: "progress-bar", data: { style: "ring", value: 98, label: "Deliverability" }, position: { x: "0%", y: "0%", width: "50%", height: "100%" } },
      { type: "progress-bar", data: { style: "stars", value: 4.8, label: "on G2" }, position: { x: "50%", y: "0%", width: "50%", height: "100%" } },
    ], async (page, seek) => {
      await seek(0.2);
      expect(await page.evaluate(() => document.querySelector('[data-cid="c0"] .pb-big')!.textContent)).toBe("0%");
      await seek(3.5);
      const m = await page.evaluate(() => {
        const ring = document.querySelector('[data-cid="c0"] .pb-ring svg circle:nth-child(2)') as SVGCircleElement;
        const C = 2 * Math.PI * ring.r.baseVal.value;
        const clip = document.querySelector('[data-cid="c1"] clipPath rect')!;
        const svg = document.querySelector('[data-cid="c1"] .pb-stars svg')!;
        return { ringFrac: 1 - parseFloat(getComputedStyle(ring).strokeDashoffset) / C, big: document.querySelector('[data-cid="c0"] .pb-big')!.textContent,
          stars: document.querySelector('[data-cid="c1"] .pb-big')!.textContent, clipW: +clip.getAttribute("width")!, svgW: +svg.getAttribute("width")! };
      });
      expect(m.ringFrac).toBeCloseTo(0.98, 2);
      expect(m.big).toBe("98%");
      expect(m.stars).toBe("4.8");
      expect(m.clipW / m.svgW).toBeGreaterThan(0.9);
      expect(m.clipW / m.svgW).toBeLessThan(0.99);
    });
  }, 60000);
});

describe("bar-chart", () => {
  it("is in the brand, not a rainbow: the tallest bar full strength, the rest muted, values counted with separators", async () => {
    await open([{ type: "bar-chart", data: { bars: [{ label: "A", value: 180 }, { label: "B", value: 3200 }, { label: "C", value: 1480 }] } }], async (page, seek) => {
      await seek(3.5);
      const m = await page.evaluate(() => [...document.querySelectorAll(".bar-fill")].map((f) => (f as HTMLElement).style.background));
      const vals = await page.evaluate(() => [...document.querySelectorAll(".bar-value")].map((v) => v.textContent));
      expect(m[1]).toContain("linear-gradient");
      expect(m[0]).toContain("color-mix");
      expect(vals).toEqual(["180", "3,200", "1,480"]);
    });
  }, 60000);
});
