import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// quotient-analytics-report: the Quotient saved-report screen (Query panel,
// chart, table) in three chart kinds -- bars, treemap, lines -- with an
// entrance that draws/grows/pops and rolls its numbers, and a script that can
// roll a number, light a row/tile/bar and press Save.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TYPE = "quotient-analytics-report";
const SRC = path.resolve(__dirname, `../src/components/mockups/${TYPE}.component.html`);
// The standard shell content-region placement (show_panel false).
const WELL = { x: "4.7%", y: "8%", width: "93.7%", height: "89%" };
// Real account content the captures carried: none of it may ship as a default.
const REAL = ["Claude Design", "Marc Ferrentino", "Max Davish", "Weekly AI", "AI Kaiju", "ChatGPT Images",
  "Quotient Changelog", "Odyssey", "Jacob", "Cal ID", "Ageism", "Claude for Marketing", "French Bulldog"];

async function assemble(data: Record<string, unknown>, position: Record<string, string> = WELL) {
  return assembleScene({
    scene: { id: "s1", label: "a", duration_seconds: 8, background: "#efeeea",
      components: [{ id: "rep", type: TYPE, position, data }] } as any,
    components: [{ type: TYPE, source: await fs.readFile(SRC, "utf-8") }],
    brandKit: { colors: { background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1920, height: 1080 } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function probe<T>(html: string, times: number[], fn: () => T): Promise<Awaited<T>[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qar-"));
  const file = path.join(dir, "scene.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && /createTimeline crashed/.test(m.text())) errors.push(m.text()); });
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    const out: Awaited<T>[] = [];
    for (const t of times) {
      await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
      out.push(await page.evaluate(fn));
    }
    expect(errors).toEqual([]);
    return out;
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const nums = (s: string) => Number(String(s).replace(/[^\d.]/g, ""));

describe("quotient-analytics-report", () => {
  it("traffic (default): lines draw left to right, table numbers roll, anchors and the query panel are there, no real names", async () => {
    const html = await assemble({});
    const [mid, end] = await probe(html, [1.1, 5], () => {
      const q = (s: string) => document.querySelector(s) as HTMLElement;
      const paths = [...document.querySelectorAll(".qar-lines path")].map((p) => Number(getComputedStyle(p).strokeDashoffset.replace("px", "")) || 0);
      const firstRow = [...document.querySelectorAll(".qar-tbody .qar-tr")][0];
      const cells = firstRow ? [...firstRow.querySelectorAll(".qar-td > span:last-child")].map((c) => c.textContent || "") : [];
      const card = q(".qar-card").getBoundingClientRect(), comp = q(".mp-component").getBoundingClientRect();
      return {
        chart: q(".qar").getAttribute("data-chart"), preset: q(".qar").getAttribute("data-preset"),
        paths, cells, title: q(".qar-title").textContent,
        anchors: [...document.querySelectorAll("[data-anchor]")].map((a) => a.getAttribute("data-anchor")),
        metrics: [...document.querySelectorAll(".qar-sec-metrics .qar-row-name")].map((e) => e.textContent),
        dimSelect: (document.querySelector(".qar-sec-dims .qar-select") || { textContent: "" }).textContent,
        filters: [...document.querySelectorAll(".qar-pill")].map((e) => e.textContent),
        legend: [...document.querySelectorAll(".qar-leg")].map((e) => e.textContent),
        ticks: [...document.querySelectorAll(".qar-ytick")].map((e) => e.textContent),
        thread: getComputedStyle(q(".qar-thread")).display,
        text: q(".qar").textContent || "",
        inside: card.left >= comp.left - 1 && card.right <= comp.right + 1,
        font: parseFloat(getComputedStyle(q(".qar")).fontSize),
      };
    });
    expect(end.chart).toBe("lines");
    expect(end.preset).toBe("traffic");
    expect(end.title).toBe("Website Traffic — Last 90 Days");
    expect(end.anchors).toEqual(expect.arrayContaining(["header", "query", "chart", "table"]));
    expect(end.metrics).toEqual(["Page Views", "Sessions", "Visitors"]);
    expect(end.dimSelect).toBe("Day");
    expect(end.filters[0]).toContain("in last");
    expect(end.legend).toEqual(["Page views", "Sessions", "Visitors"]);
    expect(end.ticks[0]).toBe("0");
    expect(end.thread).toBe("none");           // the traffic screen has no Go to thread
    expect(end.inside).toBe(true);
    expect(end.font).toBeGreaterThan(18);      // 1em = 16 design px at 1.4x
    // Three lines: mid-draw (0 < offset < 1), then fully drawn.
    expect(mid.paths).toHaveLength(3);
    expect(mid.paths[0]).toBeGreaterThan(0.05);
    expect(mid.paths[0]).toBeLessThan(0.95);
    for (const o of end.paths) expect(o).toBeCloseTo(0, 3);
    // The newest day sits on top and its numbers roll up to a formatted final.
    expect(end.cells[0]).toBe("2026-09-27");
    expect(nums(mid.cells[1])).toBeLessThan(nums(end.cells[1]));
    expect(nums(end.cells[1])).toBeGreaterThan(nums(end.cells[2]));   // page views > sessions
    for (const n of REAL) expect(end.text).not.toContain(n);
  }, 60000);

  it("traffic data climbs strongly (last month vs first month)", async () => {
    const html = await assemble({ entrance: "none", table: { max_rows: 90 } });
    const [r] = await probe(html, [0.1], () => [...document.querySelectorAll(".qar-tbody .qar-tr")].map((tr) => Number((tr.children[1].textContent || "").replace(/,/g, ""))));
    // rows are newest first, all 90 days: the last month against the first
    expect(r).toHaveLength(90);
    const recent = r.slice(0, 30).reduce((a, b) => a + b, 0), older = r.slice(-30).reduce((a, b) => a + b, 0);
    expect(recent).toBeGreaterThan(older * 2.5);
  }, 60000);

  it("deliverables: bars grow from the baseline, script count rolls a row's number and grows its bar, highlight lights the row", async () => {
    const html = await assemble({ preset: "deliverables", script: [
      { action: "highlight", target: "LinkedIn: Meet Flows", at: 3.0, duration: 2 },
      { action: "count", target: "LinkedIn: Meet Flows", to: 5120, at: 3.2, duration: 1.2 },
      { action: "count", target: "2,917", to: 3400, at: 3.2 },
    ] });
    const [early, before, mid, end] = await probe(html, [0.6, 2.9, 3.7, 6.5], () => {
      const rows = [...document.querySelectorAll(".qar-tbody .qar-tr")];
      const row = rows.find((r) => /Meet Flows/.test(r.textContent || ""))!;
      const bars = [...document.querySelectorAll(".qar-bar")] as HTMLElement[];
      const m = new DOMMatrix(getComputedStyle(bars[0]).transform);
      return {
        cols: [...document.querySelectorAll(".qar-th")].map((t) => t.textContent),
        pv: row.children[2].textContent, pv3: rows[2].children[2].textContent,
        ring: Number(getComputedStyle(row.querySelector(".qar-ring")!).opacity),
        bar0Scale: m.d, bar1H: bars[1].getBoundingClientRect().height, nBars: bars.length,
        legend: [...document.querySelectorAll(".qar-leg")].map((e) => e.textContent),
        icons: rows.slice(0, 4).map((r) => !!r.querySelector(".qar-ico svg")),
        text: (document.querySelector(".qar") as HTMLElement).textContent || "",
      };
    });
    expect(end.cols).toEqual(["Source Content", "Source Content Type", "Page Views", "Sessions", "Visitors"]);
    expect(end.legend).toEqual(["Email broadcast", "Social post", "Flow"]);
    expect(end.nBars).toBe(14);
    expect(end.icons.every(Boolean)).toBe(true);
    expect(early.bar0Scale).toBeLessThan(0.9);         // growing from the baseline
    expect(before.bar0Scale).toBeCloseTo(1, 2);
    expect(before.pv).toBe("3,246");
    expect(nums(mid.pv)).toBeGreaterThan(3246);
    expect(nums(mid.pv)).toBeLessThan(5120);
    expect(end.pv).toBe("5,120");
    expect(end.pv3).toBe("3,400");                      // a bare number on screen is a target too
    expect(end.bar1H).toBeGreaterThan(before.bar1H * 1.4);
    expect(before.ring).toBe(0);
    expect(mid.ring).toBeGreaterThan(0.9);
    expect(end.ring).toBe(0);
    for (const n of REAL) expect(end.text).not.toContain(n);
  }, 60000);

  it("social: treemap tiles pop in largest-first with rolling numbers; click 'Save' lands on the button and save flips it to Saved", async () => {
    const html = await assemble({ preset: "social", script: [
      { action: "highlight", target: "Meet Flows", at: 3.0, duration: 1 },
      { action: "click", target: "Save", at: 4.4 },
      { action: "save", at: 4.75 },
      { action: "count", target: "LinkedIn: Meet Flows", to: 21300, at: 5.2, duration: 1 },
    ] });
    const [mid, before, end] = await probe(html, [0.75, 4.72, 7.5], () => {
      const tiles = [...document.querySelectorAll(".qar-tile")] as HTMLElement[];
      const save = document.querySelector(".qar-save") as HTMLElement;
      const cur = document.querySelector(".mp-cursor") as HTMLElement | null;
      const sr = save.getBoundingClientRect();
      const cr = cur ? cur.getBoundingClientRect() : null;
      return {
        n: tiles.length, first: tiles[0].querySelector(".qar-tile-t")!.textContent, firstN: tiles[0].querySelector(".qar-tile-n")!.textContent,
        op0: Number(getComputedStyle(tiles[0]).opacity), opLast: Number(getComputedStyle(tiles[tiles.length - 1]).opacity),
        areas: tiles.slice(0, 3).map((t) => t.offsetWidth * t.offsetHeight),
        saveOp: Number(getComputedStyle(save).opacity),
        savedOp: Number(getComputedStyle(save.querySelector(".qar-save-b")!).opacity),
        saveText: save.textContent,
        cursorOnSave: cr ? (cr.left >= sr.left - 4 && cr.left <= sr.right + 4 && cr.top >= sr.top - 4 && cr.top <= sr.bottom + 4) : false,
        rowImpr: [...document.querySelectorAll(".qar-tbody .qar-tr")][0].children[2].textContent,
        text: (document.querySelector(".qar") as HTMLElement).textContent || "",
      };
    });
    expect(end.n).toBe(18);
    expect(end.first).toBe("LinkedIn: Meet Flows");
    expect(end.areas[0]).toBeGreaterThan(end.areas[1]);
    expect(end.areas[1]).toBeGreaterThan(end.areas[2]);
    // mid-entrance: the big tile is in and rolling, the smallest not yet
    expect(mid.op0).toBeGreaterThan(0.5);
    expect(mid.opLast).toBeLessThan(0.1);
    expect(nums(mid.firstN)).toBeLessThan(18420);
    expect(before.firstN).toBe("18,420");
    expect(before.saveOp).toBeCloseTo(0.5, 2);          // disabled until something changes
    expect(before.savedOp).toBe(0);
    expect(end.saveOp).toBe(1);
    expect(end.savedOp).toBe(1);
    expect(end.saveText).toContain("Saved");
    expect(before.cursorOnSave).toBe(true);
    expect(end.firstN).toBe("21,300");
    expect(end.rowImpr).toBe("21,300");
    for (const n of REAL) expect(end.text).not.toContain(n);
  }, 60000);

  it("entrance none shows the settled screen from frame 0; custom data replaces every word", async () => {
    const html = await assemble({ entrance: "none", title: "Q3 Launch — Pipeline by Channel", last_run: "Last run 2 minutes ago",
      metrics: ["Pipeline"], dimensions: ["Channel"], filters: [{ field: "Time", op: "in last", values: ["30 days"] }],
      chart: { type: "bars", items: [{ label: "Email", value: 412000, display: "$412K" }, { label: "LinkedIn", value: 268000, display: "$268K" }] },
      docked: true });
    const [r] = await probe(html, [0], () => ({
      title: document.querySelector(".qar-title")!.textContent,
      run: document.querySelector(".qar-status-txt")!.textContent,
      cells: [...document.querySelectorAll(".qar-tbody .qar-tr")].map((tr) => tr.textContent),
      cols: [...document.querySelectorAll(".qar-th")].map((t) => t.textContent),
      barScale: new DOMMatrix(getComputedStyle(document.querySelector(".qar-bar")!).transform).d,
      border: getComputedStyle(document.querySelector(".qar-card")!).borderTopWidth,
      xlabels: [...document.querySelectorAll(".qar-xtick")].map((t) => t.textContent),
    }));
    expect(r.title).toBe("Q3 Launch — Pipeline by Channel");
    expect(r.run).toBe("Last run 2 minutes ago");
    expect(r.cols).toEqual(["Channel", "Pipeline"]);
    expect(r.cells[0]).toContain("$412K");
    expect(r.barScale).toBe(1);
    expect(r.border).toBe("0px");                       // docked: flush in the shell's well
    expect(r.xlabels).toEqual(["Email", "LinkedIn"]);
  }, 60000);
});
