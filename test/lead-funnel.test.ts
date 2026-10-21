import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// lead-funnel: the inbound engine as an object. Bands light on their cues,
// dots pour in, warm and drop a band, and one lead leaves named.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TYPE = "lead-funnel";
const SRC = path.resolve(__dirname, `../src/components/data-viz/${TYPE}.component.html`);

async function assemble(data: Record<string, unknown>) {
  return assembleScene({
    scene: {
      id: "s1", label: "a", duration_seconds: 8, background: "#fcefe0",
      components: [{ id: "f0", type: TYPE, position: { x: "4%", y: "12%", width: "92%", height: "66%" }, data }],
    } as any,
    components: [{ type: TYPE, source: await fs.readFile(SRC, "utf-8") }],
    brandKit: { colors: { primary: "#e2784e", background: "#fcefe0", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1080, height: 1920 } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withPage<T>(html: string, fn: (page: import("playwright").Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lfn-"));
  const file = path.join(dir, "scene.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.route(/^https?:/, (r) => r.abort());
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    const out = await fn(page);
    expect(errors).toEqual([]);
    return out;
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const state = (page: import("playwright").Page, t: number) =>
  page.evaluate((tt) => {
    (window as any).__MP_TIMELINE.time(tt);
    const q = (s: string) => [...document.querySelectorAll(s)] as SVGGraphicsElement[];
    const bands = q(".lfn-band").map((b) => { const y = Number(b.getAttribute("y")), h = Number(b.getAttribute("height")); return [y, y + h]; });
    const bandOf = (y: number) => bands.findIndex(([a, b]) => y >= a && y < b);
    const dots = q(".lfn-dot").map((d) => ({ y: Number(d.getAttribute("cy")), x: Number(d.getAttribute("cx")), op: Number(getComputedStyle(d).opacity), fill: getComputedStyle(d).fill }));
    const live = dots.filter((d) => d.op > 0.5);
    const boxes = q(".lfn-label, .lfn-icon").map((e) => e.getBBox && (e.classList.contains("lfn-icon")
      ? { x: Number(e.getAttribute("data-x")) - 21, y: Number(e.getAttribute("data-y")) - 21, width: 42, height: 42 }
      : e.getBBox()));
    return {
      perBand: [0, 1, 2].map((i) => live.filter((d) => bandOf(d.y) === i).length),
      bandOp: q(".lfn-band").map((b) => Number(getComputedStyle(b).opacity)),
      labels: q(".lfn-label").map((e) => e.textContent),
      hand: Number(getComputedStyle(document.querySelector(".lfn-handoff")!).opacity),
      handName: document.querySelector(".lfn-hand-name")!.textContent,
      onLabel: live.filter((d) => boxes.some((b) => d.x > b.x - 2 && d.x < b.x + b.width + 2 && d.y > b.y - 2 && d.y < b.y + b.height + 2)).length,
      anchors: q("[data-anchor]").map((e) => e.getAttribute("data-anchor")),
    };
  }, t);

describe("lead-funnel", () => {
  it("pours dots into the top band, nurtures some down, qualifies a few, then hands one off by name", async () => {
    await withPage(await assemble({}), async (page) => {
      const attract = await state(page, 2);
      expect(attract.perBand[0]).toBeGreaterThan(20);
      expect(attract.perBand[1] + attract.perBand[2]).toBe(0);
      expect(attract.bandOp[0]).toBeGreaterThan(0.1);
      expect(attract.bandOp[1]).toBeLessThan(0.05);
      const nurture = await state(page, 3.3);
      expect(nurture.perBand[1]).toBeGreaterThan(8);
      const end = await state(page, 6.5);
      expect(end.perBand[2]).toBeGreaterThan(3);
      expect(end.perBand[0] + end.perBand[1] + end.perBand[2]).toBe(27); // one left through the neck
      expect(end.hand).toBe(1);
      expect(end.handName).toBe("Sarah Chen");
      expect(end.labels).toEqual(["Attract", "Nurture", "Qualify"]);
      expect(end.onLabel).toBe(0);
      for (const a of ["funnel", "band-0", "band-2", "source-0", "handoff"]) expect(end.anchors).toContain(a);
    });
  }, 60000);

  it("bands, sources and the hand-off are data; cues move with their at", async () => {
    await withPage(await assemble({
      bands: [{ label: "Find", at: 1 }, { label: "Win", at: 4 }],
      sources: [{ label: "Podcast" }], touches: false, handoff: { name: "Ana Ruiz", at: 6 },
    }), async (page) => {
      const early = await state(page, 3);
      expect(early.labels).toEqual(["Find", "Win"]);
      expect(early.perBand[1]).toBe(0);
      expect(early.hand).toBe(0);
      const end = await state(page, 7.5);
      expect(end.perBand[1]).toBeGreaterThan(5);
      expect(end.handName).toBe("Ana Ruiz");
      expect(end.hand).toBe(1);
    });
  }, 60000);
});
