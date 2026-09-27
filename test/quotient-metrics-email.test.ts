import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// quotient-metrics-email: the email broadcast's Metrics tab, hand-built from
// the captured screen. Every word and number is data; the tiles roll up and
// the funnel bars grow on the timeline; a script can roll a number mid-scene.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TYPE = "quotient-metrics-email";
const SRC = path.resolve(__dirname, `../src/components/mockups/${TYPE}.component.html`);
const CONTENT = { x: "4.7%", y: "8%", width: "93.7%", height: "89%" };

async function assemble(data: Record<string, unknown>) {
  return assembleScene({
    scene: {
      id: "s1", label: "a", duration_seconds: 8, background: "#f4f3ef",
      components: [{ id: "m0", type: TYPE, position: CONTENT, data }],
    } as any,
    components: [{ type: TYPE, source: await fs.readFile(SRC, "utf-8") }],
    brandKit: { colors: { background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1920, height: 1080 } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withPage<T>(html: string, fn: (page: import("playwright").Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qme-"));
  const file = path.join(dir, "scene.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
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
    const q = (s: string) => [...document.querySelectorAll(s)] as HTMLElement[];
    return {
      values: q(".qme-kpi-value").map((e) => e.textContent || ""),
      bars: q(".qme-bar").map((e) => e.getBoundingClientRect().height),
      plotH: (document.querySelector(".qme-plot") as HTMLElement).getBoundingClientRect().height,
      active: q(".qme-tab").map((e) => getComputedStyle(e).borderBottomColor),
      text: (document.querySelector(".qme") as HTMLElement).innerText,
      anchors: q("[data-anchor]").map((e) => e.getAttribute("data-anchor")),
      ticks: q(".qme-yt").map((e) => e.textContent),
      hl: q(".qme-hl").map((e) => Number(getComputedStyle(e).opacity)),
      overflow: (() => {
        const card = document.querySelector(".qme-card")!.getBoundingClientRect();
        return q(".qme-kpi, .qme-funnel, .qme-foot, .qme-actions").some((e) => e.getBoundingClientRect().right > card.right + 1 || e.getBoundingClientRect().bottom > card.bottom + 1);
      })(),
    };
  }, t);

describe("quotient-metrics-email", () => {
  it("rolls the tiles up, grows the funnel bars in sequence, and settles on the formatted defaults", async () => {
    const html = await assemble({ docked: true });
    await withPage(html, async (page) => {
      const mid = await state(page, 0.9);
      const end = await state(page, 4);
      expect(end.values).toEqual(["18,400", "99.20%", "52.40%", "11.80%"]);
      // Mid-entrance: numbers are rolling (below final) and still formatted.
      const sentMid = Number(mid.values[0].replace(/,/g, ""));
      expect(sentMid).toBeGreaterThan(0);
      expect(sentMid).toBeLessThan(18400);
      expect(mid.values[2]).toMatch(/^\d+\.\d\d%$/);
      expect(parseFloat(mid.values[2])).toBeLessThan(52.4);
      // Bars grow from the baseline: at 1.2s the first is up, the last hasn't started.
      const early = await state(page, 1.2);
      expect(early.bars[0]).toBeGreaterThan(early.bars[3]);
      expect(early.bars[3]).toBeLessThan(1);
      // Settled: auto axis 0..20000, Clicked is a real bar (> 8% of the plot).
      expect(end.ticks).toEqual(["0", "5000", "10000", "15000", "20000"]);
      expect(end.bars[3] / end.plotH).toBeGreaterThan(0.08);
      expect(end.bars[0]).toBeGreaterThan(end.bars[1] - 1);
      expect(end.bars[1]).toBeGreaterThan(end.bars[2]);
      expect(end.bars[2]).toBeGreaterThan(end.bars[3]);
      // The screen's words, generic launch world, none of the captured account.
      for (const s of ["Metrics", "Recipients", "Details", "Editor", "Q3 Flows Launch", "Threads (3)", "Sent 3 days ago",
        "Total Emails Sent", "Delivery Rate", "Open Rate", "Click Rate", "Broadcast Engagement Funnel", "1. Sent", "4. Clicked",
        "Want to dig deeper?", "Open reports", "Ask the agent"]) expect(end.text).toContain(s);
      for (const bad of ["Changelog", "Marc", "Ferrentino", "Max Davish", "Claude Design", "Weekly AI", "2,906"]) expect(end.text).not.toContain(bad);
      for (const a of ["header", "tabs", "kpis", "kpi-0", "kpi-3", "funnel", "chart", "footer"]) expect(end.anchors).toContain(a);
      expect(end.overflow).toBe(false);
    });
  }, 60000);

  it("entrance:'none' is settled at frame 0", async () => {
    const html = await assemble({ entrance: "none" });
    await withPage(html, async (page) => {
      const s = await state(page, 0);
      expect(s.values).toEqual(["18,400", "99.20%", "52.40%", "11.80%"]);
      expect(s.bars[3]).toBeGreaterThan(5);
    });
  }, 60000);

  it("script: count rolls a tile and grows a bar mid-scene, highlight rings it, switch-tab moves the active tab; data drives the words", async () => {
    const html = await assemble({
      docked: true,
      campaign: "Northwind Q3",
      status: "Sent 1 hour ago",
      kpis: [
        { label: "Revenue", value: 48200, format: "currency", icon: "dollar" },
        { label: "Open Rate", value: "44.1%" },
        { label: "Replies", value: 1200, format: "compact" },
      ],
      script: [
        { action: "count", target: "Open Rate", to: 61.5, at: 4, duration: 1 },
        { action: "highlight", target: "Open Rate", at: 4, duration: 1 },
        { action: "count", target: "Clicked", to: 4000, at: 4, duration: 1 },
        { action: "switch-tab", to: "Recipients", at: 5.5 },
        { action: "click", target: "Ask the agent", at: 6 },
      ],
    });
    await withPage(html, async (page) => {
      const before = await state(page, 3.9);
      expect(before.values).toEqual(["$48,200", "44.1%", "1.2K"]);
      expect(before.text).toContain("Northwind Q3");
      expect(before.text).toContain("Sent 1 hour ago");
      const during = await state(page, 4.4);
      const v = parseFloat(during.values[1]);
      expect(v).toBeGreaterThan(44.1);
      expect(v).toBeLessThan(61.5);
      expect(during.hl[0]).toBeGreaterThan(0.5);
      const after = await state(page, 6.8);
      expect(after.values[1]).toBe("61.5%");
      expect(after.bars[3]).toBeGreaterThan(before.bars[3] * 1.5);
      // Recipients (index 1) now carries the dark underline, Metrics does not.
      expect(after.active[1]).toBe("rgb(23, 23, 28)");
      expect(after.active[0]).not.toBe("rgb(23, 23, 28)");
      // Scrub back: the value returns to its pre-count state.
      const back = await state(page, 3.9);
      expect(back.values[1]).toBe("44.1%");
    });
  }, 60000);
});
