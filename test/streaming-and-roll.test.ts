import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// HyperFrames audit gaps: Streaming Text + AI Chat Reveal (streaming-answer)
// and Number Wheel (mpRollDigits, count: "roll" on the stat components).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOLDER: Record<string, string> = { "streaming-answer": "ui-mocks", "stat-card": "titles", "number-counter-row": "titles" };
const SRC = (t: string) => fs.readFile(path.resolve(__dirname, `../src/components/${FOLDER[t]}/${t}.component.html`), "utf-8");
const BRAND = { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] };

async function open(type: string, data: unknown, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, size = { w: 1920, h: 1080 }, position: unknown = { x: "center", y: "center" }) {
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 9, background: "#fafaf8", components: [{ id: "c0", type, position, data }] } as any,
    components: [{ type, source: await SRC(type) }],
    brandKit: BRAND as any, canvas: { width: size.w, height: size.h } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sr-"));
  await fs.writeFile(path.join(dir, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(dir, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

const ANSWER = "Here's the plan:\n- **Email:** a 3-step welcome series\n- **LinkedIn:** 5 posts\nWant me to draft them?";

describe("streaming-answer", () => {
  it("types the ask, thinks, streams the words in order, and the finished answer fits", async () => {
    await open("streaming-answer", { prompt: "Plan next week's launch", answer: ANSWER }, async (page, seek) => {
      const shown = () => page.evaluate(() => [...document.querySelectorAll(".sa-wrap .sa-w")].filter((w) => +getComputedStyle(w).opacity > 0).length);
      await seek(0.8);
      const ask = await page.evaluate(() => document.querySelector(".sa-wrap .sa-ask-text")!.textContent!);
      expect(ask.length).toBeGreaterThan(0);
      expect("Plan next week's launch".startsWith(ask)).toBe(true);
      expect(await shown()).toBe(0);
      await seek(4);
      const mid = await shown();
      const total = await page.evaluate(() => document.querySelectorAll(".sa-wrap .sa-w").length);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(total);
      await seek(8.8);
      expect(await shown()).toBe(total);
      const m = await page.evaluate(() => {
        const w = document.querySelector(".sa-wrap") as HTMLElement;
        return { fits: w.scrollHeight <= w.clientHeight + 1, bold: [...document.querySelectorAll(".sa-wrap .sa-w.b")].map((b) => b.textContent!.trim()), dots: [...document.querySelectorAll(".sa-wrap .sa-li")].map((l) => getComputedStyle(l).getPropertyValue("--dot").trim()) };
      });
      expect(m.fits).toBe(true);
      expect(m.bold).toEqual(["Email:", "LinkedIn:"]);
      expect(m.dots).toEqual(["1", "1"]);
      await seek(4);
      expect(await shown()).toBe(mid); // seek back: same frame
    });
  }, 60000);

  it("phone: the keyboard rises for the ask and drops for the answer; nothing is cut off the top", async () => {
    await open("streaming-answer", { prompt: "Plan next week's launch for the analytics release", answer: ANSWER, device: "phone" }, async (page, seek) => {
      const kb = () => page.evaluate(() => { const k = document.querySelector(".sa-kb")!.getBoundingClientRect(), s = document.querySelector(".sa-screen")!.getBoundingClientRect(); return k.top < s.bottom - 2; });
      await seek(1.0);
      expect(await kb()).toBe(true);
      await seek(8.8);
      expect(await kb()).toBe(false);
      const m = await page.evaluate(() => {
        const th = document.querySelector(".sa-thread")!.getBoundingClientRect(), me = document.querySelector(".sa-me")!.getBoundingClientRect();
        return { meTop: me.top, thTop: th.top, meShown: +getComputedStyle(document.querySelector(".sa-me")!).opacity };
      });
      expect(m.meShown).toBe(1);
      expect(m.meTop).toBeGreaterThanOrEqual(m.thTop);
    }, { w: 1080, h: 1920 });
  }, 60000);
});

describe("rolling digits", () => {
  it("stat-card count:'roll' spins reels that settle on the exact value, gradient type included", async () => {
    await open("stat-card", { value: 12410, label: "signups", count: "roll" }, async (page, seek) => {
      await seek(5);
      const m = await page.evaluate(() => {
        const n = document.querySelector(".stat-number")!;
        // Read each reel's settled digit: the glyph under the reel's window centre.
        const out: string[] = [];
        n.querySelectorAll(":scope > span").forEach((cell) => {
          const r = cell.getBoundingClientRect(), cy = r.top + r.height / 2;
          const strip = cell.querySelector("span");
          if (!strip) { out.push(cell.textContent!); return; }
          const hit = [...strip.children].find((d) => { const b = d.getBoundingClientRect(); return b.top <= cy && b.bottom >= cy; });
          out.push(hit ? hit.textContent! : "?");
        });
        const glyph = n.querySelector(":scope > span span span") as HTMLElement;
        return { text: out.join(""), fill: getComputedStyle(glyph).webkitTextFillColor, clip: getComputedStyle(glyph).backgroundImage };
      });
      expect(m.text).toBe("12,410");
      expect(m.clip).not.toBe("none"); // the gradient reached the glyphs
    });
  }, 60000);

  it("number-counter-row count:'roll' keeps prefix/suffix still and lands every value", async () => {
    const stats = [{ value: 3.2, suffix: "x", label: "a" }, { value: 41, suffix: "%", label: "b" }];
    await open("number-counter-row", { count: "roll", stats }, async (page, seek) => {
      await seek(5);
      const vals = await page.evaluate(() => [...document.querySelectorAll("[data-target]")].map((v) => [...v.children].map((cell) => {
        const strip = cell.querySelector("span");
        if (!strip) return cell.textContent;
        const r = cell.getBoundingClientRect(), cy = r.top + r.height / 2;
        const hit = [...strip.children].find((d) => { const b = d.getBoundingClientRect(); return b.top <= cy && b.bottom >= cy; });
        return hit ? hit.textContent : "?";
      }).join("")));
      expect(vals).toEqual(["3.2x", "41%"]);
    }, undefined, { x: "5%", y: "30%", width: "90%", height: "40%" });
  }, 60000);
});
