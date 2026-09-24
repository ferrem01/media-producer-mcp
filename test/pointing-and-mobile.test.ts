import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { extractAnchors } from "../src/core/word-anchors.js";

// Batch 1 (pointing at UI): kinetic-text marks + ~~strike=>replace~~, the
// gliding spotlight, ink-callout. Batch 2 (mobile): cursor-performer touch,
// imessage-thread. From the HyperFrames audit's high-value gaps.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, "../src/components");
const src = (cat: string, type: string) => fs.readFile(path.join(LIB, cat, `${type}.component.html`), "utf-8");

async function open(comps: Array<{ cat: string; type: string; data: unknown; position?: unknown }>, canvas = { width: 1920, height: 1080 }, dur = 6) {
  const types = [...new Set(comps.map((c) => c.cat + "/" + c.type))];
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: dur, background: "#ffffff",
      components: comps.map((c, i) => ({ id: "c" + i, type: c.type, position: c.position || { x: "0%", y: "0%", width: "100%", height: "100%" }, data: c.data, z_index: i + 1 })) } as any,
    components: await Promise.all(types.map(async (k) => { const [cat, type] = k.split("/"); return { type, source: await src(cat, type) }; })),
    brandKit: { colors: { primary: "#393bf5", secondary: "#e8590c", text: "#17171c", background: "#ffffff" }, fonts: [] } as any,
    canvas: canvas as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-"));
  const file = path.join(dir, "s.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: canvas });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`file://${file}`);
  await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
  const seek = (t: number) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
  return { page, seek, errors, close: async () => { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); } };
}
const shown = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => {
  // Rendered at all (a display:none ancestor hides it), visible, opaque.
  const cs = getComputedStyle(e); return e.getClientRects().length > 0 && cs.visibility !== "hidden" && Number(cs.opacity) > 0.5;
}).length, sel);

describe("kinetic-text marks and strikes", () => {
  it("strikes ~~old=>new~~, brings the new word in, then circles the starred phrase as ONE run", async () => {
    const { page, seek, errors, close } = await open([{ cat: "titles", type: "kinetic-text", position: { x: "5%", y: "30%", width: "90%", height: "40%" },
      data: { text: "Reports take ~~hours=>minutes~~ with *one agent*", entrance: "type-on", mark: "circle", font_size: "90px", color: "#17171c" } }]);
    try {
      await seek(0.2);
      expect(await shown(page, ".kt-new")).toBe(0);
      const inks = await page.evaluate(() => document.querySelectorAll("svg.kt-ink").length);
      expect(inks).toBe(2); // the strike + ONE circle around "one agent" (type-on builds a span per word)
      await seek(5.4);
      expect(await page.evaluate(() => document.querySelector(".kt-new")!.textContent)).toBe(" minutes");
      expect(await shown(page, ".kt-new")).toBe(1);
      expect(Number(await page.evaluate(() => getComputedStyle(document.querySelector(".kt-old")!).opacity))).toBeLessThan(0.6);
      const drawn = await page.evaluate(() => [...document.querySelectorAll("svg.kt-ink path")].map((p) => parseFloat(getComputedStyle(p).strokeDashoffset)));
      expect(Math.max(...drawn)).toBeLessThan(1);
      // The circle hugs the whole phrase, not one word.
      const w = await page.evaluate(() => { const s = [...document.querySelectorAll("svg.kt-ink")].pop()!; return s.getBoundingClientRect().width; });
      const phrase = await page.evaluate(() => { const a = [...document.querySelectorAll(".kt-accent")].filter((x) => !x.closest(".kt-new")); const r0 = a[0].getBoundingClientRect(), r1 = a[a.length - 1].getBoundingClientRect(); return r1.right - r0.left; });
      expect(w).toBeGreaterThan(phrase * 0.95);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("hides the pen until it starts (a round cap on an empty dash prints a dot)", async () => {
    const { page, seek, close } = await open([{ cat: "titles", type: "kinetic-text", position: { x: "5%", y: "30%", width: "90%", height: "40%" },
      data: { text: "Ship *faster*", mark: "underline", mark_at: 2 } }]);
    try {
      await seek(1.5);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector("svg.kt-ink path")!).opacity)).toBe("0");
      await seek(2.9);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector("svg.kt-ink path")!).opacity)).toBe("1");
    } finally { await close(); }
  }, 60000);
});

describe("spotlight targets", () => {
  it("glides the window from target to target with a label chip each", async () => {
    const { page, seek, errors, close } = await open([{ cat: "effects", type: "spotlight", data: { targets: [
      { at: 0.4, x: 20, y: 20, w: 20, h: 10, label: "Search" }, { at: 2, x: 70, y: 60, w: 10, h: 30, label: "Status" }] } }]);
    try {
      const hole = () => page.evaluate(() => { const r = document.querySelector(".spot-hole")!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await seek(1.5);
      const a = await hole();
      expect(Math.abs(a.x - 0.2 * 1920)).toBeLessThan(20);
      expect(await page.evaluate(() => document.querySelectorAll(".spot-label").length)).toBe(2);
      expect(await shown(page, ".spot-label")).toBe(1);
      await seek(3.2);
      const b = await hole();
      expect(Math.abs(b.x - 0.7 * 1920)).toBeLessThan(20);
      expect(Math.abs(b.y - 0.6 * 1080)).toBeLessThan(20);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("no longer drifts at random", async () => {
    expect(await src("effects", "spotlight")).not.toMatch(/Math\.random/);
    expect(extractAnchors({ type: "spotlight", data: { targets: [{ at: "@search", x: 1, y: 1 }, { at: "@status", x: 2, y: 2 }] } } as any)).toBe(2);
  });
});

describe("ink-callout", () => {
  it("writes a note, draws the arrow and the mark, one callout at a time", async () => {
    const { page, seek, errors, close } = await open([{ cat: "props", type: "ink-callout", data: { callouts: [
      { at: 0.3, label: "one list", target: { x: 20, y: 20, w: 20, h: 8 }, mark: "box" },
      { at: 2.2, label: "live status", target: { x: 60, y: 50, w: 8, h: 6 }, mark: "circle" }] } }]);
    try {
      await seek(1.9);
      const first = await page.evaluate(() => [...document.querySelectorAll(".icl-ink path")].slice(0, 3).map((p) => [getComputedStyle(p).opacity, parseFloat(getComputedStyle(p).strokeDashoffset)]));
      expect(first.every(([o, d]) => o === "1" && (d as number) < 1)).toBe(true); // shaft, head, box all drawn
      await seek(3.6);
      const labels = await page.evaluate(() => [...document.querySelectorAll(".icl-label")].map((l) => Number(getComputedStyle(l).opacity)));
      expect(labels[0]).toBeLessThan(0.1); // the first note cleared for the second
      expect(labels[1]).toBeGreaterThan(0.9);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);
});

describe("cursor-performer touch", () => {
  it("lands, presses and lifts on a tap -- no arrow, no hover travel", async () => {
    const { page, seek, errors, close } = await open([{ cat: "props", type: "cursor-performer", data: { pointer: "touch", path: [{ at: 1, x: "50%", y: "60%", tap: true }] } }], { width: 1080, height: 1920 });
    try {
      await seek(0.5);
      expect(await shown(page, ".curp-touch")).toBe(0);
      await seek(1.0);
      expect(await shown(page, ".curp-touch")).toBe(1);
      await seek(1.8);
      expect(await shown(page, ".curp-touch")).toBe(0);
      expect(await page.evaluate(() => document.querySelectorAll(".curp svg, .mp-cursor").length)).toBe(0);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);
});

describe("imessage-thread", () => {
  const data = { keyboard: true, contact: { name: "Dana (Acme)" }, messages: [
    { from: "them", text: "still sending it by hand?" }, { from: "them", text: "it's 2026" },
    { from: "me", text: "guilty" }, { from: "them", text: "try this", reaction: "‼️" }] };
  it("groups bubbles with tails, types your side on the keyboard, dots before replies, Delivered under yours", async () => {
    const { page, seek, errors, close } = await open([{ cat: "mockups", type: "imessage-thread", data }], { width: 1080, height: 1920 }, 8);
    try {
      expect(await page.evaluate(() => [...document.querySelectorAll(".imt-b")].map((b) => b.classList.contains("tail")))).toEqual([false, true, true, true]);
      expect(await page.evaluate(() => document.querySelector(".imt-avatar")!.textContent)).toBe("D");
      // "guilty" types into the field (the 3rd message starts at 3.7s).
      await seek(3.9);
      expect(await page.evaluate(() => document.querySelector(".imt-draft")!.textContent)).toMatch(/^gu/);
      // Sent at ~4.3s; "Delivered" follows; the reply's typing dots are up.
      await seek(5.1);
      expect(await shown(page, ".imt-rcpt")).toBe(1);
      expect(await shown(page, ".imt-typing")).toBe(1);
      await seek(7.5);
      expect(await shown(page, ".imt-typing")).toBe(0);
      expect(await shown(page, ".imt-react")).toBe(1);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);
  it("is deterministic and takes word anchors", async () => {
    expect(await src("mockups", "imessage-thread")).not.toMatch(/Math\.random|onUpdate|repeat:\s*-1/);
    expect(extractAnchors({ type: "imessage-thread", data: { messages: [{ from: "me", text: "x", at: "@hey" }] } } as any)).toBe(1);
  });
});
