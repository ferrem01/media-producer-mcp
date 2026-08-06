import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { measureTextContrast } from "../src/core/text-contrast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// st-chaos-collage is the PROBLEM beat (Remotion "Shipper" steal, #57): a
// headline standing still while the mess it names swarms around it. The whole
// design risk is one thing -- a busy frame that eats its own headline -- so
// the contract is measured, not asserted in a comment:
//
//   - the headline clears the legibility gate WITH the swarm running
//   - `resolve` actually clears the swarm and lands the answer
//   - junk cards degrade to a clean statement frame, never to an empty one

const W = 1280, H = 720, DUR = 7;

const CARDS = [
  { kind: "notification", title: "Slack -- #launch", body: "who owns the blog post?" },
  { kind: "stat", value: "47", title: "unread threads" },
  { kind: "waveform", title: "Voice memo 4:12" },
  { kind: "message", title: "Maria", body: "did we ever ship the email?" },
  { kind: "notification", title: "Notion", body: "Q3 Launch Plan -- edited 6d ago" },
  { kind: "stat", value: "3", title: "conflicting docs" },
  { kind: "message", title: "Adam", body: "which deck is current?" },
  { kind: "notification", title: "Gmail", body: "Re: Re: Re: campaign copy" },
  { kind: "waveform", title: "Standup recording 22:40" },
  { kind: "stat", value: "9d", title: "since last update" },
];

const HEADLINE = "Every launch lives in | eleven different places.";

async function collage(data: Record<string, unknown>, background = "#0c0d12"): Promise<string> {
  const src = await fs.readFile(
    path.resolve(__dirname, "../src/components/scene-templates/st-chaos-collage.component.html"), "utf-8");
  return assembleScene({
    scene: {
      id: "s1", label: "problem", duration_seconds: DUR, background,
      components: [{
        id: "t", type: "st-chaos-collage",
        position: { x: 0, y: 0, width: "100%", height: "100%" }, data,
      }],
    } as any,
    components: [{ type: "st-chaos-collage", source: src }],
    brandKit: {
      colors: { background, text: background === "#0c0d12" ? "#ffffff" : "#17171c", primary: "#393bf5" },
      fonts: [],
    } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withScene<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chaos-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, html);
  const browser = await chromium.launch({
    ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`file://${htmlPath}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
    return await fn(page);
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Card count + per-card opacity at a time, plus the visible headline text. */
async function readFrame(page: Page, t: number) {
  return page.evaluate((tt) => {
    (window as any).__MP_TIMELINE.pause(tt);
    const cards = Array.from(document.querySelectorAll(".stcc-card"));
    return {
      cards: cards.length,
      lit: cards.filter((c) => parseFloat(getComputedStyle(c as HTMLElement).opacity) > 0.05).length,
      headings: Array.from(document.querySelectorAll(".stcc-headline"))
        .filter((h) => parseFloat(getComputedStyle(h as HTMLElement).opacity) > 0.05)
        .map((h) => (h.textContent || "").trim()),
    };
  }, t);
}

async function contrastDefects(html: string, atTimes: number[]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chaosc-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, html);
  try {
    return await measureTextContrast({ htmlPath, width: W, height: H, atTimes });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("st-chaos-collage: a busy frame that never eats its headline", () => {
  it("keeps the headline legible while the swarm is at full strength", async () => {
    // Mid-scene: every card has arrived and is drifting. This is the frame
    // the whole design exists to survive.
    const defects = await contrastDefects(
      await collage({ headline: HEADLINE, subhead: "And none of them talk to each other.", cards: CARDS }),
      [2.4, 3.6]);
    const onHeadline = defects.filter((d) => /eleven different places|Every launch lives/i.test(d.text));
    expect(onHeadline, JSON.stringify(onHeadline)).toEqual([]);
  }, 300_000);

  it("keeps it legible on the light world too", async () => {
    const defects = await contrastDefects(
      await collage({ headline: HEADLINE, cards: CARDS, theme: "light" }, "#fafaf8"), [2.4]);
    const onHeadline = defects.filter((d) => /eleven different places|Every launch lives/i.test(d.text));
    expect(onHeadline, JSON.stringify(onHeadline)).toEqual([]);
  }, 300_000);

  it("swarms, then clears, then answers", async () => {
    const html = await collage({ headline: HEADLINE, cards: CARDS, resolve: "One thread." });
    const { mid, end } = await withScene(html, async (p) => ({
      mid: await readFrame(p, 2.4),
      end: await readFrame(p, 6.4),
    }));
    expect(mid.cards).toBe(10);
    expect(mid.lit, "the swarm never showed up").toBeGreaterThanOrEqual(9);
    expect(mid.headings.join(" ")).toContain("eleven different places");
    // The chaos has to be answerable, or the scene is just anxiety.
    expect(end.lit, "the swarm never cleared").toBeLessThanOrEqual(1);
    expect(end.headings.join(" ")).toContain("One thread.");
    expect(end.headings.join(" ")).not.toContain("eleven different places");
  }, 300_000);

  it("holds the swarm to the end when no resolve is asked for", async () => {
    const end = await withScene(await collage({ headline: HEADLINE, cards: CARDS }), (p) => readFrame(p, 6.4));
    expect(end.lit).toBeGreaterThanOrEqual(9);
  }, 300_000);

  it("reads identically under reverse-order seek", async () => {
    const html = await collage({ headline: HEADLINE, cards: CARDS, resolve: "One thread." });
    const fwd = await withScene(html, async (p) => [await readFrame(p, 1.2), await readFrame(p, 2.4), await readFrame(p, 6.4)]);
    const rev = await withScene(html, async (p) => {
      const c = await readFrame(p, 6.4); const b = await readFrame(p, 2.4); const a = await readFrame(p, 1.2);
      return [a, b, c];
    });
    expect(rev).toEqual(fwd);
  }, 300_000);

  it("keeps every card inside the frame, drift and tilt included", async () => {
    // A first live render put "3 conflicting docs" half off the left edge:
    // the seat was legal, then the drift and the entrance tilt carried it
    // out. Seats alone are not the contract -- the swept box is.
    const worst = await withScene(await collage({ headline: HEADLINE, cards: CARDS, seed: 23 }), (p) =>
      p.evaluate((W2) => {
        let out = { left: 0, right: 0, top: 0, bottom: 0, who: "" };
        for (let t = 0; t <= 7; t += 0.25) {
          (window as any).__MP_TIMELINE.pause(t);
          for (const c of Array.from(document.querySelectorAll(".stcc-card"))) {
            if (parseFloat(getComputedStyle(c as HTMLElement).opacity) < 0.05) continue;
            const r = (c as HTMLElement).getBoundingClientRect();
            const over = {
              left: Math.max(0, -r.left), right: Math.max(0, r.right - W2.w),
              top: Math.max(0, -r.top), bottom: Math.max(0, r.bottom - W2.h),
            };
            const m = Math.max(over.left, over.right, over.top, over.bottom);
            if (m > Math.max(out.left, out.right, out.top, out.bottom)) {
              out = { ...over, who: (c.textContent || "").slice(0, 30) };
            }
          }
        }
        return out;
      }, { w: W, h: H }));
    expect(worst, JSON.stringify(worst)).toMatchObject({ left: 0, right: 0, top: 0, bottom: 0 });
  }, 300_000);

  it("degrades to a clean statement frame when the cards are junk", async () => {
    for (const cards of ["a pile of notifications", [1, 2, 3], []]) {
      const got = await withScene(await collage({ headline: HEADLINE, cards }), (p) => readFrame(p, 2.4));
      expect(got.cards, JSON.stringify(cards)).toBe(0);
      // Never an empty frame: the headline is the scene's floor.
      expect(got.headings.join(" ")).toContain("eleven different places");
    }
  }, 300_000);
});
