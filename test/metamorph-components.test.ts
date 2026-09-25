import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// SPEC-metamorph.md phase 1: the three performing components from the
// Runneth reference -- grid-cull, review-deck, verdict-scorecard. Each must
// perform deterministically, stay in frame at 16x9, 9x16 and 4x5, and seek
// anywhere (a seek lands on the same frame however it was reached).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOLDER: Record<string, string> = { "grid-cull": "data-viz", "review-deck": "ui-mocks", "verdict-scorecard": "ui-mocks" };
const SRC = (t: string) => fs.readFile(path.resolve(__dirname, `../src/components/${FOLDER[t]}/${t}.component.html`), "utf-8");
const FRAMES: Array<[number, number]> = [[1920, 1080], [1080, 1920], [1080, 1350]];

async function open(type: string, data: unknown, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, opts: { w?: number; h?: number; duration?: number; position?: unknown } = {}) {
  const W = opts.w || 1920, H = opts.h || 1080;
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: opts.duration || 8, background: "#f4f2ee", components: [{ id: "c0", type, position: opts.position || { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
    components: [{ type, source: await SRC(type) }],
    brandKit: { colors: { primary: "#393bf5", secondary: "#d48c34", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mm1-"));
  await fs.writeFile(path.join(dir, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(dir, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/** Every visible element (opacity > 0.05, painted) inside the viewport. */
const outOfFrame = (page: Page, sel: string) => page.evaluate((s) => {
  const W = innerWidth, H = innerHeight, bad: string[] = [];
  document.querySelectorAll(s).forEach((e) => {
    let op = 1, n: Element | null = e;
    while (n && n !== document.body) { const cs = getComputedStyle(n); op *= Number(cs.opacity); if (cs.visibility === "hidden" || cs.display === "none") op = 0; n = n.parentElement; }
    if (op < 0.05) return;
    const r = e.getBoundingClientRect();
    if (r.width && (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)) bad.push(`${(e as HTMLElement).className}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
  });
  return bad;
}, sel);

/** A fingerprint of every element's box and opacity -- equal fingerprints = the same frame. */
const frame = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => {
  const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(Number(getComputedStyle(e).opacity) * 100)].join(",");
}).join("|"), sel);

const PEOPLE = [
  { name: "Amara Osei", role: "Senior strategist", score: "Top 5%", keep: true },
  { name: "Devin Shaw", role: "Creative lead", score: "Top 5%", keep: true },
  { name: "Lena Silva", role: "Creative strategist", score: "Top 5%", keep: true },
  { name: "Elise Rowan", role: "Creative director", score: "Top 5%", keep: true },
  { name: "Theo Brandt", role: "Head of creative", score: "Top 5%", keep: true },
];
const GC = { column_title: "Your JD · Creative strategist", rows: PEOPLE, count: 120 };
const RD = { counter: { label: "Application", from: 127, total: 480 }, cards: [
  { name: "Amara O.", role: "Senior strategist · DTC", rows: ["Senior strategist, DTC supplements · 2020–now", "Built the UGC engine behind a $40M brand", "Writes hooks that survive the first 3 seconds"], thumbs: ["", "", "", ""], quote: "I want to own the whole creative loop." },
  { name: "Ryan T.", role: "Social media manager", rows: ["Social media manager, agency · 2023–now", "No paid social experience yet"], keep: false },
  { name: "Lena S.", role: "Creative strategist", rows: ["Creative strategist, DTC skincare · 2021–now", "Scaled two brands past $1M/mo"], thumbs: ["", ""] },
] };
const VS = { title: "Assessment · Lena S.", criteria: ["Lives in the feeds", "Direct response judgment", { label: "Paid social budget", pass: false }], verdict: "Top 5%", verdict_sub: "of 480 applicants" };

describe("grid-cull: a crowd culled to a shortlist", () => {
  it("rings the survivors, blurs the rest away, lands them ranked in a column", async () => {
    await open("grid-cull", GC, async (page, seek) => {
      await seek(2.0);
      const scan = await page.evaluate(() => ({ cards: document.querySelectorAll(".gc-card").length, rings: [...document.querySelectorAll(".gc-ring")].map((r) => +getComputedStyle(r).opacity) }));
      expect(scan.cards).toBe(120);
      expect(scan.rings.length).toBe(5);
      await seek(7.8);
      const end = await page.evaluate(() => {
        const vis = [...document.querySelectorAll(".gc-card")].filter((c) => +getComputedStyle(c).opacity > 0.5);
        return { n: vis.length, names: vis.map((c) => c.querySelector(".gc-nm")!.textContent), boxes: vis.map((c) => { const r = c.getBoundingClientRect(); return { l: r.left, t: r.top, b: r.bottom, w: r.width }; }),
          score: [...document.querySelectorAll(".gc-score")].map((s) => +getComputedStyle(s).opacity), title: +getComputedStyle(document.querySelector(".gc-title")!).opacity };
      });
      expect(end.n).toBe(5);
      expect(end.names).toEqual(expect.arrayContaining(PEOPLE.map((p) => p.name)));
      // Ranked: in keep order, top to bottom, not overlapping, all one width.
      const sorted = end.boxes.slice().sort((a, b) => a.t - b.t);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].t).toBeGreaterThanOrEqual(sorted[i - 1].b - 1);
      expect(new Set(end.boxes.map((b) => Math.round(b.w))).size).toBe(1);
      expect(Math.min(...end.score)).toBe(1);
      expect(end.title).toBe(1);
    });
  }, 60000);

  it("is the same crowd on every load (seeded, no Math.random)", async () => {
    const src = await SRC("grid-cull");
    expect(src).not.toMatch(/Math\.random/);
    const names: string[] = [];
    for (let k = 0; k < 2; k++) await open("grid-cull", GC, async (page) => { names.push(await page.evaluate(() => [...document.querySelectorAll(".gc-nm")].map((n) => n.textContent).join(","))); });
    expect(names[0]).toBe(names[1]);
  }, 60000);
});

describe("review-deck: every record read, stamped, dealt", () => {
  it("ticks each row as the scan passes, stamps the verdict, deals the card away", async () => {
    await open("review-deck", RD, async (page, seek) => {
      const per = (8 - 0.3 - 0.6) / 3;
      await seek(0.3 + per * 0.8);
      const first = await page.evaluate(() => {
        const c = document.querySelectorAll(".rd-card")[0];
        return { ticks: [...c.querySelectorAll(".rd-tick svg")].map((s) => +getComputedStyle(s).opacity), stamp: +getComputedStyle(c.querySelector(".rd-stamp")!).opacity, stampText: c.querySelector(".rd-stamp")!.textContent, counter: [...document.querySelectorAll(".rd-counter span")].filter((s) => +getComputedStyle(s).opacity > 0.5).map((s) => s.textContent) };
      });
      expect(first.ticks).toEqual([1, 1, 1]);
      expect(first.stamp).toBe(1);
      expect(first.stampText).toContain("Shortlisted");
      expect(first.counter).toEqual(["Application 127 of 480"]);
      // The pass gets the grey stamp and no ticks.
      await seek(0.3 + per * 1.8);
      const second = await page.evaluate(() => { const c = document.querySelectorAll(".rd-card")[1]; return { cls: c.querySelector(".rd-stamp")!.className, svgs: c.querySelectorAll(".rd-tick svg").length, op: +getComputedStyle(c).opacity }; });
      expect(second.cls).toContain("no");
      expect(second.svgs).toBe(0);
      expect(second.op).toBe(1);
      await seek(7.9);
      const end = await page.evaluate(() => ({ ops: [...document.querySelectorAll(".rd-card")].map((c) => +getComputedStyle(c).opacity), counter: [...document.querySelectorAll(".rd-counter span")].filter((s) => +getComputedStyle(s).opacity > 0.5).map((s) => s.textContent) }));
      expect(end.ops).toEqual([0, 0, 1]);
      expect(end.counter).toEqual(["Application 129 of 480"]);
    });
  }, 60000);
});

describe("verdict-scorecard: evidence, then the verdict", () => {
  it("fills each passing tick, rings a miss, lands the verdict last", async () => {
    await open("verdict-scorecard", VS, async (page, seek) => {
      await seek(0.9);
      expect(await page.evaluate(() => +getComputedStyle(document.querySelector(".vs-verdict")!).opacity)).toBe(0);
      await seek(5.8);
      const m = await page.evaluate(() => ({
        dots: [...document.querySelectorAll(".vs-dot")].map((d) => getComputedStyle(d).backgroundColor),
        svgShown: [...document.querySelectorAll(".vs-dot svg")].map((s) => getComputedStyle(s).display !== "none"),
        verdict: document.querySelector(".vs-verdict")!.textContent, vop: +getComputedStyle(document.querySelector(".vs-verdict")!).opacity,
      }));
      expect(m.dots[0]).toBe("rgb(34, 197, 94)");
      expect(m.dots[1]).toBe("rgb(34, 197, 94)");
      expect(m.svgShown).toEqual([true, true, false]);
      expect(m.verdict).toBe("Top 5%");
      expect(m.vop).toBe(1);
    }, { duration: 6 });
  }, 60000);
});

describe("all three: in frame at 16x9, 9x16 and 4x5, and seek anywhere", () => {
  const CASES: Array<[string, unknown, string, number[]]> = [
    ["grid-cull", GC, ".gc-card, .gc-title", [1.4, 3.4, 7.8]],
    ["review-deck", RD, ".rd-card, .rd-stamp, .rd-counter span", [1.2, 3.6, 7.9]],
    ["verdict-scorecard", VS, ".vs-panel, .vs-tile, .vs-row", [1.0, 5.8]],
  ];
  for (const [type, data, sel, times] of CASES) {
    it(`${type}: nothing leaves the frame, and a seek lands on the same frame however it was reached`, async () => {
      for (const [w, h] of FRAMES) {
        await open(type, data, async (page, seek) => {
          for (const t of times) {
            await seek(t);
            expect(await outOfFrame(page, sel), `${type} ${w}x${h} at ${t}s`).toEqual([]);
          }
          // Forward to the middle, versus the end and back to the middle.
          const mid = times[1];
          await seek(mid); const a = await frame(page, sel);
          await seek(times[times.length - 1]); await seek(0); await seek(mid); const b = await frame(page, sel);
          expect(b).toBe(a);
        }, { w, h, duration: 8 });
      }
    }, 120000);
  }
});
