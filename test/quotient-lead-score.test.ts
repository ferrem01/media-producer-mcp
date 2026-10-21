import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// quotient-lead-score: the lead-scoring screen (Rules / People), hand-built
// from the captured product. Every person, rule and number is data; the
// score climbs as rules match, on the timeline.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TYPE = "quotient-lead-score";
const SRC = path.resolve(__dirname, `../src/components/mockups/${TYPE}.component.html`);
const WIDE = { x: "4%", y: "6%", width: "92%", height: "88%" };

async function assemble(data: Record<string, unknown>, opts: { tall?: boolean; position?: Record<string, string> } = {}) {
  return assembleScene({
    scene: {
      id: "s1", label: "a", duration_seconds: 8, background: "#fcefe0",
      components: [{ id: "q0", type: TYPE, position: opts.position || WIDE, data }],
    } as any,
    components: [{ type: TYPE, source: await fs.readFile(SRC, "utf-8") }],
    brandKit: { colors: { background: "#fcefe0", text: "#17171c" }, fonts: [] } as any,
    canvas: (opts.tall ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }) as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withPage<T>(html: string, tall: boolean, fn: (page: import("playwright").Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qls-"));
  const file = path.join(dir, "scene.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: tall ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 } });
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
    const q = (s: string) => [...document.querySelectorAll(s)] as HTMLElement[];
    const vis = (e: HTMLElement | null) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
    const card = document.querySelector(".qls-card")!.getBoundingClientRect();
    return {
      score: document.querySelector(".qls-d-score-val")!.textContent,
      rowScores: q(".qls-row-score").map((e) => e.textContent),
      on: q(".qls-br").map((e) => e.classList.contains("is-on")),
      notes: q(".qls-br-note").map((e) => e.textContent),
      pts: q(".qls-br-pts").map((e) => e.textContent),
      people: vis(document.querySelector(".qls-people")),
      rules: vis(document.querySelector(".qls-rules")),
      list: vis(document.querySelector(".qls-list")),
      detail: vis(document.querySelector(".qls-detail")),
      rows: q(".qls-row").length,
      text: (document.querySelector(".qls") as HTMLElement).innerText,
      anchors: q("[data-anchor]").map((e) => e.getAttribute("data-anchor")),
      overflow: q(".qls-top, .qls-search, .qls-d-head, .qls-rule-top").some((e) => e.getBoundingClientRect().right > card.right + 1),
      nameSize: parseFloat(getComputedStyle(document.querySelector(".qls-br-label")!).fontSize),
    };
  }, t);

describe("quotient-lead-score", () => {
  it("settles on the made-up defaults: the ranked list, Sarah's 92 and how it was calculated, none of the captured account", async () => {
    await withPage(await assemble({}), false, async (page) => {
      const mid = await state(page, 0.6);
      const end = await state(page, 4);
      expect(end.score).toBe("92");
      expect(Number(mid.score)).toBeLessThan(92);
      expect(end.rowScores.slice(0, 3)).toEqual(["92", "77", "68"]);
      expect(end.on).toEqual([true, true, true, true, true, false, false]);
      expect(end.notes[0]).toBe("Matched · 2 visits");
      expect(end.notes[5]).toBe("Didn't match");
      expect(end.pts).toEqual(["30", "25", "20", "10", "7", "0", "0"]);
      expect(end.people && end.list && end.detail).toBe(true);
      expect(end.rules).toBe(false);
      for (const s of ["Rules", "People", "Scores ready", "Save", "Search people...", "Person", "Score", "Sarah Chen", "sarah@northwind.co",
        "Published score", "How this score was calculated", "Rules from the last completed evaluation.", "Viewed the pricing page"]) expect(end.text).toContain(s);
      for (const bad of ["Kasprzak", "Jagad", "Saurabh", "Manchanda", "Stefan", "Maritz", "Ignacio", "Alistair", "Muradi", "gmail"]) expect(end.text).not.toContain(bad);
      for (const a of ["header", "tabs", "list", "row-0", "detail", "score", "breakdown", "rule-0"]) expect(end.anchors).toContain(a);
      expect(end.overflow).toBe(false);
    });
  }, 60000);

  it("climb: the matched rules tick on one by one and the score climbs to the total; match flips one rule on a cue", async () => {
    await withPage(await assemble({ climb: true, climb_at: 1, climb_interval: 0.5 }), false, async (page) => {
      const before = await state(page, 0.9);
      expect(before.score).toBe("0");
      expect(before.on.every((x) => !x)).toBe(true);
      const two = await state(page, 1.95);
      expect(two.on.slice(0, 3)).toEqual([true, true, false]);
      expect(Number(two.score)).toBeGreaterThan(30);
      expect(Number(two.score)).toBeLessThanOrEqual(55);
      const end = await state(page, 5);
      expect(end.score).toBe("92");
      expect(end.rowScores[0]).toBe("92");
    });
    await withPage(await assemble({ entrance: "none", script: [{ action: "match", target: "Webinar no-show", at: 2 }] }), false, async (page) => {
      expect((await state(page, 1)).score).toBe("92");
      const end = await state(page, 3.5);
      expect(end.score).toBe("94");
      expect(end.on[5]).toBe(true);
      expect(end.pts[5]).toBe("2");
    });
  }, 90000);

  it("switch-tab swaps to the Rules view; the Rules tab draws the rule cards from data", async () => {
    await withPage(await assemble({ entrance: "none", script: [{ action: "switch-tab", to: "Rules", at: 2 }] }), false, async (page) => {
      const a = await state(page, 1);
      expect(a.people).toBe(true);
      const b = await state(page, 3);
      expect(b.rules).toBe(true);
      expect(b.people).toBe(false);
    });
    await withPage(await assemble({ tab: "rules", rules: [{ name: "Booked a demo", criteria: [{ icon: "form", field: "Form Submit", op: "is", value: "Demo request" }], amount: 40 }] }), false, async (page) => {
      const s = await state(page, 3);
      expect(s.rules).toBe(true);
      for (const t of ["Scoring rules", "Add rule", "Booked a demo", "Form Submit", "Demo request", "Criteria", "Points", "Add points", "Amount", "40", "Add filter"]) expect(s.text).toContain(t);
    });
  }, 90000);

  it("a tall box stacks a short list over the breakdown; layout 'detail' is the score alone, sized for a phone", async () => {
    const pos = { x: "5%", y: "12%", width: "90%", height: "62%" };
    await withPage(await assemble({}, { tall: true, position: pos }), true, async (page) => {
      const s = await state(page, 4);
      expect(s.rows).toBe(3);
      expect(s.list && s.detail).toBe(true);
      expect(s.overflow).toBe(false);
    });
    await withPage(await assemble({ layout: "detail" }, { tall: true, position: pos }), true, async (page) => {
      const s = await state(page, 4);
      expect(s.list).toBe(false);
      expect(s.detail).toBe(true);
      expect(s.nameSize).toBeGreaterThan(22);
    });
  }, 90000);
});
