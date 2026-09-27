import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// A campaign's Metrics tab, hand-built from the product capture: every word
// and number from data, numbers that roll up, lines that draw, bars that
// grow, and a script that can roll a tile to a new number mid-scene.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TYPE = "quotient-metrics-campaign";
const FILE = path.resolve(__dirname, `../src/components/mockups/${TYPE}.component.html`);
const CONTENT = { x: "4.7%", y: "8%", width: "93.7%", height: "89%" };

async function assemble(data: Record<string, unknown>, position = CONTENT) {
  return assembleScene({
    scene: {
      id: "s1", label: "metrics", duration_seconds: 8, background: "#efeeea",
      components: [{ id: "m0", type: TYPE, position, data }],
    } as any,
    components: [{ type: TYPE, source: await fs.readFile(FILE, "utf-8") }],
    brandKit: { colors: { background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1920, height: 1080 } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withPage<T>(html: string, fn: (page: import("playwright").Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qmc-"));
  const file = path.join(dir, "scene.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // No web fonts in CI/sandbox: fail the font request fast instead of
    // letting page load hang on it (the layout is sized off the box).
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`file://${file}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    const out = await fn(page);
    expect(errors).toEqual([]);
    return out;
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const probe = () => {
  const q = (s: string) => [...document.querySelectorAll(s)] as HTMLElement[];
  const comp = document.querySelector(".mp-component")!.getBoundingClientRect();
  const card = document.querySelector(".qmc-card")!.getBoundingClientRect();
  return {
    comp: [comp.left, comp.top, comp.right, comp.bottom],
    card: [card.left, card.top, card.right, card.bottom],
    tabs: q(".qmc-tab span").map((e) => e.textContent),
    active: q(".qmc-tab").map((e) => e.getAttribute("aria-selected")),
    labels: q(".qmc-kpi-label span").map((e) => e.textContent),
    values: q(".qmc-kpi-value").map((e) => e.textContent),
    dash: q(".qmc-series").map((p) => Number(getComputedStyle(p).strokeDashoffset.replace("px", "")) || 0),
    d: q(".qmc-series").map((p) => p.getAttribute("d") || ""),
    bars: q(".qmc-barfill").map((b) => b.getBoundingClientRect().height),
    barNames: q(".qmc-bar-x span").map((e) => e.textContent),
    xLabels: q(".qmc-line-x span").map((e) => e.textContent),
    anchors: q("[data-anchor]").map((e) => e.getAttribute("data-anchor")),
    footer: document.querySelector(".qmc-footer")!.textContent!.replace(/\s+/g, " ").trim(),
    footerBottom: document.querySelector(".qmc-footer")!.getBoundingClientRect().bottom,
    text: document.querySelector(".qmc")!.textContent || "",
  };
};

describe("quotient-metrics-campaign", () => {
  it("defaults tell the Q3 Flows launch (no real account data) and settle formatted", async () => {
    const html = await assemble({ docked: true });
    const r = await withPage(html, async (page) => {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(0.55); });
      const mid = await page.evaluate(probe);
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(1.6); });
      const drawing = await page.evaluate(probe);
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(6); });
      const end = await page.evaluate(probe);
      return { mid, drawing, end };
    });
    const { mid, drawing, end } = r;
    expect(end.tabs).toEqual(["Brief", "Tasks", "Activation", "Deliverables", "Metrics", "Chats"]);
    expect(end.active[4]).toBe("true");
    expect(end.labels).toEqual(["Page Views", "Sessions", "Email Opens", "Email Clicks", "Social Impressions", "Social Likes"]);
    expect(end.values).toEqual(["48,210", "31,904", "15,605", "3,284", "186,420", "4,812"]);
    // Numbers roll up: mid-entrance the first tile is under its final value.
    const midPV = Number(String(mid.values[0]).replace(/,/g, ""));
    expect(midPV).toBeGreaterThan(0);
    expect(midPV).toBeLessThan(48210);
    // Lines draw (dash offset 1 -> 0), bars grow from the baseline.
    expect(drawing.dash[0]).toBeGreaterThan(0.05);
    expect(end.dash.every((v) => Math.abs(v) < 1e-3)).toBe(true);
    expect(end.d.every((d) => d.startsWith("M") && d.includes("C"))).toBe(true);
    expect(end.bars[0]).toBeGreaterThan(100);
    expect(end.bars[0]).toBeGreaterThan(end.bars[9]);
    expect(end.barNames[1]).toBe("Flows launch webinar");
    expect(end.xLabels[0]).toBe("Jan 26");
    expect(end.xLabels[end.xLabels.length - 1]).toBe("Sep 21");
    expect(end.footer).toContain("Want to dig deeper?");
    expect(end.footer).toContain("Ask the agent");
    for (const a of ["tabs", "kpis", "kpi-0", "kpi-5", "traffic", "deliverables", "footer"]) expect(end.anchors).toContain(a);
    // Fits its box: the card and footer stay inside the component.
    expect(end.card[2]).toBeLessThanOrEqual(end.comp[2] + 1);
    expect(end.footerBottom).toBeLessThanOrEqual(end.comp[3] + 1);
    for (const real of ["Marc", "Ferrentino", "Davish", "Weekly AI", "Claude Design", "Changelog", "Newsletter August"]) {
      expect(end.text).not.toContain(real);
    }
  }, 60000);

  it("the source carries no real names from the capture", async () => {
    const src = await fs.readFile(FILE, "utf-8");
    for (const real of ["Marc", "Ferrentino", "Davish", "Weekly AI", "Claude Design", "Changelog", "cm7ncepht"]) {
      expect(src).not.toContain(real);
    }
  });

  it("script: count rolls a tile to a new number, highlight rings it, switch-tab moves the underline", async () => {
    const html = await assemble({
      kpis: [
        { label: "Page Views", icon: "eye", value: 1000 },
        { label: "Signups", icon: "users", value: 40, format: "percent", decimals: 1 },
      ],
      deliverables: [{ name: "Launch email", value: 500 }, { name: "Webinar", value: 300 }],
      script: [
        { action: "count", target: "Page Views", to: 5000, at: 3, duration: 1 },
        { action: "count", target: "page views", to: 7000, at: 5, duration: 0.5, display: "7K" },
        { action: "highlight", target: "Signups", at: 3, duration: 1 },
        { action: "switch-tab", tab: "Deliverables", at: 4 },
        { action: "set-text", target: "Webinar", text: "Launch webinar", at: 4 },
        { action: "click", target: "Ask the agent", at: 6 },
      ],
    }, { x: "3%", y: "3%", width: "94%", height: "94%" });
    const r = await withPage(html, async (page) => {
      const at = async (t: number) => {
        await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
        return page.evaluate(() => ({
          values: [...document.querySelectorAll(".qmc-kpi-value")].map((e) => e.textContent),
          ring: [...document.querySelectorAll(".qmc-ring")].map((e) => Number(getComputedStyle(e).opacity)),
          active: [...document.querySelectorAll(".qmc-tab")].map((e) => e.getAttribute("aria-selected")),
          bar1: document.querySelectorAll(".qmc-bar-x span")[1].textContent,
        }));
      };
      return { t28: await at(2.8), t35: await at(3.5), t45: await at(4.5), t6: await at(6), back: await at(2.8) };
    });
    expect(r.t28.values).toEqual(["1,000", "40.0%"]);
    const rolling = Number(String(r.t35.values[0]).replace(/,/g, ""));
    expect(rolling).toBeGreaterThan(1000);
    expect(rolling).toBeLessThan(5000);
    expect(r.t35.ring[0]).toBeGreaterThan(0.9);
    expect(r.t45.values[0]).toBe("5,000");
    expect(r.t45.active).toEqual(["false", "false", "false", "true", "false", "false"]);
    expect(r.t45.bar1).toBe("Launch webinar");
    expect(r.t6.values[0]).toBe("7K");
    // Scrub-safe: seeking back restores the earlier state.
    expect(r.back.values[0]).toBe("1,000");
    expect(r.back.active[4]).toBe("true");
    expect(r.back.bar1).toBe("Webinar");
  }, 60000);

  it("entrance none shows the settled page at frame 0", async () => {
    const html = await assemble({ entrance: "none", footer: false });
    const r = await withPage(html, async (page) => {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(0); });
      return page.evaluate(() => ({
        values: [...document.querySelectorAll(".qmc-kpi-value")].map((e) => e.textContent),
        dash: [...document.querySelectorAll(".qmc-series")].map((p) => getComputedStyle(p).strokeDashoffset),
        footer: getComputedStyle(document.querySelector(".qmc-footer")!).display,
        tileOpacity: getComputedStyle(document.querySelector(".qmc-kpi")!).opacity,
      }));
    });
    expect(r.values[0]).toBe("48,210");
    expect(r.footer).toBe("none");
    expect(r.tileOpacity).toBe("1");
    expect(r.dash.every((d) => d === "0px" || d === "0")).toBe(true);
  }, 60000);
});
