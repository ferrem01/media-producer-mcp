import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// quotient-metrics-event: the Quotient marketing event page on its Metrics
// tab, rebuilt as a library component. Every word and number is data, the
// defaults are a fictional launch webinar, the numbers roll up on the
// timeline and the script can move them.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCKS = path.resolve(__dirname, "../src/components/mockups");
const TYPE = "quotient-metrics-event";
const read = (f: string) => fs.readFile(path.join(MOCKS, f), "utf-8");
const WELL = { x: "4.7%", y: "8%", width: "93.7%", height: "89%" };

async function assemble(data: Record<string, unknown>, duration = 8) {
  return assembleScene({
    scene: {
      id: "s1", label: "a", duration_seconds: duration, background: "#ecebe7",
      components: [{ id: "ev", type: TYPE, position: WELL, data }],
    } as any,
    components: [{ type: TYPE, source: await read(`${TYPE}.component.html`) }],
    brandKit: { colors: { background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1920, height: 1080 } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withPage<T>(html: string, fn: (page: import("playwright").Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qmv-"));
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

const seek = (page: import("playwright").Page, t: number) =>
  page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);

const snapshot = (page: import("playwright").Page) => page.evaluate(() => {
  const txt = (s: string) => [...document.querySelectorAll(s)].map((e) => (e.textContent || "").trim());
  return {
    title: txt(".qmv-title")[0],
    kpis: txt(".qmv-kpi-value"),
    labels: txt(".qmv-kpi-label"),
    rates: txt(".qmv-rate-big"),
    rows: txt(".qmv-row-val"),
    brows: txt(".qmv-brow-val"),
    fills: [...document.querySelectorAll(".qmv-fill")].map((e) => parseFloat((e as HTMLElement).style.width)),
    active: txt(".qmv-tab.is-active span"),
    owner: txt(".qmv-mval")[1],
    body: document.querySelector(".qmv")!.textContent || "",
    anchors: [...document.querySelectorAll(".qmv [data-anchor]")].map((e) => e.getAttribute("data-anchor")),
    font: parseFloat(getComputedStyle(document.querySelector(".qmv") as Element).fontSize),
    card: (() => { const r = document.querySelector(".qmv-card")!.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })(),
    rateBottom: document.querySelector(".qmv-rate-reg")!.getBoundingClientRect().bottom,
    breakTop: document.querySelector(".qmv-break")!.getBoundingClientRect().top,
    rings: [...document.querySelectorAll(".qmv-hl")].map((e) => Number(getComputedStyle(e).opacity)),
  };
});

describe("quotient-metrics-event", () => {
  it("ships generic defaults: none of the captured account's real names", async () => {
    const src = await read(`${TYPE}.component.html`);
    for (const real of ["Claude Design", "Marc Ferrentino", "Max Davish", "Quotient Changelog", "Weekly AI", "Not assigned", "cm7ncepht"]) {
      expect(src, `still contains ${real}`).not.toContain(real);
    }
    const schema = JSON.parse(await read(`${TYPE}.schema.json`));
    expect(schema.type).toBe(TYPE);
    expect(schema.category).toBe("mockups");
    for (const k of ["title", "campaign", "owner", "kpis", "attendance", "registration", "breakdown", "script", "docked", "at", "entrance"]) {
      expect(schema.data[k], k).toBeTruthy();
      expect(schema.data[k].optional).toBe(true);
    }
  });

  it("rolls the numbers up on the timeline and settles on coherent, formatted defaults", async () => {
    const html = await assemble({ docked: true });
    await withPage(html, async (page) => {
      await seek(page, 0);
      const s0 = await snapshot(page);
      expect(s0.kpis).toEqual(["0", "0", "0", "0"]);
      await seek(page, 0.9);
      const mid = await snapshot(page);
      const total = Number(mid.kpis[0].replace(/,/g, ""));
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThan(1240);
      await seek(page, 7.5);
      const s = await snapshot(page);
      expect(s.title).toBe("Flows launch webinar");
      expect(s.owner).toBe("Jordan Lee");
      expect(s.labels).toEqual(["Total Participants", "Registered", "Attended", "No Shows"]);
      expect(s.kpis).toEqual(["1,240", "1,180", "742", "438"]);
      expect(s.rates).toEqual(["63%", "95%"]);
      expect(s.rows).toEqual(["742", "438", "1,180", "1,180", "1,240", "18", "1,240"]);
      expect(s.brows).toEqual(["1,240 (100%)", "1,180 (95%)", "742 (60%)", "438 (35%)", "18 (1%)"]);
      expect(s.fills[0]).toBeCloseTo(100, 0);
      expect(s.fills[2]).toBeCloseTo(59.8, 0);
      expect(s.active).toEqual(["Metrics"]);
      expect(s.anchors).toEqual(expect.arrayContaining(["header", "tabs", "kpis", "attendance", "registration", "breakdown"]));
      // Fitted to the content well: type sized from the box, the page down to
      // the rate cards stands inside the card, the breakdown waits below it.
      expect(s.font).toBeGreaterThan(12);
      expect(s.rateBottom).toBeLessThanOrEqual(s.card[3] + 1);
      expect(s.breakTop).toBeGreaterThan(s.card[3]);
    });
  }, 60000);

  it("entrance none shows the settled page from frame 0", async () => {
    const html = await assemble({ entrance: "none", kpis: [{ label: "Signups", value: 5320, display: "5.3K" }, { label: "Pipeline", value: 1.2e6, format: "compact", prefix: "$" }] });
    await withPage(html, async (page) => {
      await seek(page, 0);
      const s = await snapshot(page);
      expect(s.kpis).toEqual(["5.3K", "$1.2M"]);
      expect(s.rates).toEqual(["63%", "95%"]);
    });
  }, 60000);

  it("script: count rolls a tile mid-scene, highlight rings, switch-tab, scroll, set-text -- scrub-safe both ways", async () => {
    const html = await assemble({
      docked: true,
      script: [
        { action: "count", target: "Attended", to: 812, at: 3.2, duration: 1 },
        { action: "count", target: "Attendance Rate", to: 69, at: 3.2, duration: 1 },
        { action: "count", target: "breakdown.Attended", to: 812, at: 3.2, duration: 1 },
        { action: "highlight", target: "Attendance Rate", at: 3.2, duration: 1.2 },
        { action: "switch-tab", to: "Participants", at: 5 },
        { action: "set-text", target: "Jordan Lee", to: "Sarah Chen", at: 5 },
        { action: "click", target: "Threads", at: 5.2 },
        { action: "scroll", to: "breakdown", at: 6, duration: 0.8 },
      ],
    }, 9);
    await withPage(html, async (page) => {
      await seek(page, 3.0);
      const before = await snapshot(page);
      expect(before.kpis[2]).toBe("742");
      expect(before.rates[0]).toBe("63%");
      expect(before.rings[0]).toBe(0);
      await seek(page, 3.6);
      const mid = await snapshot(page);
      const v = Number(mid.kpis[2].replace(/,/g, ""));
      expect(v).toBeGreaterThan(742);
      expect(v).toBeLessThan(812);
      expect(mid.rings[0]).toBeGreaterThan(0.5);
      // Scoping: the tile moved, the attendance card's own "Attended" row did not.
      expect(mid.rows[0]).toBe("742");
      await seek(page, 5.5);
      const after = await snapshot(page);
      expect(after.kpis[2]).toBe("812");
      expect(after.rates[0]).toBe("69%");
      expect(after.brows[2]).toBe("812 (65%)");
      expect(after.active).toEqual(["Participants"]);
      expect(after.owner).toBe("Sarah Chen");
      expect(after.rings[0]).toBe(0);
      await seek(page, 8.5);
      const scrolled = await snapshot(page);
      expect(scrolled.breakTop).toBeLessThan(scrolled.card[3] - 200);
      // Scrub back: everything returns.
      await seek(page, 2.9);
      const back = await snapshot(page);
      expect(back.kpis[2]).toBe("742");
      expect(back.active).toEqual(["Metrics"]);
      expect(back.owner).toBe("Jordan Lee");
      expect(back.breakTop).toBeGreaterThan(back.card[3]);
    });
  }, 60000);
});
