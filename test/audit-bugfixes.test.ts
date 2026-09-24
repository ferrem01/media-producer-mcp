import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// The component polish audit's bug fixes: every render worker must build the
// same frame (no Math.random), the typewriter must fit its box, and the old
// JSON-schema-shaped schemas are gone (the writer saw them with no description).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, "../src/components");
const find = async (type: string) => {
  for (const cat of await fs.readdir(LIB)) {
    const f = path.join(LIB, cat, `${type}.component.html`);
    try { await fs.access(f); return f; } catch { /* next */ }
  }
  throw new Error("no " + type);
};

async function snapshot(browser: Browser, type: string, data: unknown, at: number, box = { x: "0%", y: "0%", width: "100%", height: "100%" }) {
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 4, background: "#ffffff", components: [{ id: "c", type, position: box, data }] } as any,
    components: [{ type, source: await fs.readFile(await find(type), "utf-8") }],
    brandKit: { colors: { primary: "#393bf5", text: "#17171c", background: "#ffffff" }, fonts: [] } as any,
    canvas: { width: 960, height: 540 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "abf-"));
  const file = path.join(dir, "s.html");
  await fs.writeFile(file, html);
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  try {
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await page.evaluate((t) => { (window as any).__MP_TIMELINE.time(t); }, at);
    return await page.evaluate(() => {
      const root = document.querySelector(".mp-camera")!;
      const canv = [...root.querySelectorAll("canvas")].map((c) => { try { return (c as HTMLCanvasElement).toDataURL().length + ":" + (c as HTMLCanvasElement).toDataURL().slice(-64); } catch { return "x"; } });
      return root.innerHTML.replace(/ktmb\d+|__mpBoil\w*/g, "") + canv.join("|");
    });
  } finally { await page.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

describe("formerly random components build the same frame every time", () => {
  const CASES: Array<[string, unknown]> = [
    ["particle-field", {}], ["magnetic", {}], ["portal", {}], ["grid-pixelate-wipe", {}],
    ["caption-glitch-rgb", { text: "Marketing ships faster" }], ["caption-particle-burst", { text: "Marketing ships faster" }],
    ["caption-matrix-decode", { text: "Marketing ships faster" }], ["caption-emoji-pop", { text: "Ship it", emoji: "🚀" }],
    ["particle-text", { text: "Quotient" }], ["liquid-glass-media-controls", { title: "Track" }], ["shatter", {}],
  ];
  it("two independent loads, same seek, same DOM", async () => {
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      for (const [type, data] of CASES) {
        const a = await snapshot(browser, type, data, 1.3);
        const b = await snapshot(browser, type, data, 1.3);
        expect(b, type).toBe(a);
      }
    } finally { await browser.close(); }
  }, 180000);
  it("no component calls Math.random", async () => {
    const offenders: string[] = [];
    for (const cat of await fs.readdir(LIB)) {
      if (cat === "shared") continue;
      for (const f of await fs.readdir(path.join(LIB, cat))) {
        if (f.endsWith(".component.html") && /Math\.random\(\)/.test(await fs.readFile(path.join(LIB, cat, f), "utf-8"))) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("typewriter fits its box", () => {
  it("steps the type down instead of cutting the first line off the top", async () => {
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const html = await assembleScene({
        scene: { id: "s", label: "s", duration_seconds: 4, background: "#ffffff", components: [{ id: "c", type: "typewriter",
          position: { x: "10%", y: "18%", width: "80%", height: "30%" },
          data: { style: "print", text: "Headline: Ship a week of marketing before lunch.\nOffer: 20% off annual plans -- this week only.\nCTA: Start your free trial today." } }] } as any,
        components: [{ type: "typewriter", source: await fs.readFile(await find("typewriter"), "utf-8") }],
        brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 1920, height: 1080 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
      } as any);
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tw-"));
      await fs.writeFile(path.join(dir, "s.html"), html);
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(`file://${path.join(dir, "s.html")}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(3.9); });
      const m = await page.evaluate(() => {
        const box = document.querySelector(".typewriter")!.getBoundingClientRect();
        const txt = document.querySelector(".text-area")!.getBoundingClientRect();
        return { boxTop: box.top, boxBottom: box.bottom, top: txt.top, bottom: txt.bottom };
      });
      expect(m.top).toBeGreaterThanOrEqual(m.boxTop - 1);
      expect(m.bottom).toBeLessThanOrEqual(m.boxBottom + 1);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    } finally { await browser.close(); }
  }, 60000);
});

describe("schemas", () => {
  it("every schema is in the house shape: type, description and a data block", async () => {
    const bad: string[] = [];
    for (const cat of await fs.readdir(LIB)) {
      if (cat === "shared") continue;
      for (const f of await fs.readdir(path.join(LIB, cat))) {
        if (!f.endsWith(".schema.json")) continue;
        const j = JSON.parse(await fs.readFile(path.join(LIB, cat, f), "utf-8"));
        if (!j.data || typeof j.data !== "object" || !j.description || j.type === "object") bad.push(f);
      }
    }
    expect(bad).toEqual([]);
  });
});
