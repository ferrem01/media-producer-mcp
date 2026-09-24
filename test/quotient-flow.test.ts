import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { extractAnchors } from "../src/core/word-anchors.js";

// quotient-flow: a Quotient flow drawn from a list of steps in the product's
// look (measured off Marc's capture of the real flow editor), that unfurls
// row by row and takes a script -- highlight + twinkle, a path through the
// flow, camera focus. Built for the signals ad's beat 3 ("Quotient brings
// them together, and acts on them", proj_de974ad1).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src/components/mockups/quotient-flow.component.html");

const BEAT3 = {
  steps: [
    { id: "sig", kind: "event", title: "Customer signal", subtitle: "Website · CRM · Product" },
    { id: "agent", kind: "agent", subtitle: "Reads the signal, picks the next best email" },
    { id: "which", kind: "conditional", title: "Which signal?", subtitle: "AI", ai: true },
    { id: "price", kind: "email", subtitle: "Pricing follow-up", after: "which", branch: "Viewed pricing" },
    { id: "case", kind: "email", subtitle: "Case study", after: "which", branch: "Deal moved" },
    { id: "sales", kind: "slack", subtitle: "# sales heads-up", after: "case" },
    { id: "mile", kind: "email", subtitle: "Milestone next steps", after: "which", branch: "Milestone" },
  ],
  pace: 0.2,
  script: [
    { at: 1.5, action: "highlight", step: "agent", until: 2.4 },
    { at: 1.9, action: "path", steps: ["sig", "agent", "which", "case", "sales"], hop: 0.35 },
  ],
};

async function open(data: unknown, w: number, h: number, dur = 5): Promise<{ page: Page; close: () => Promise<void>; errors: string[] }> {
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: dur, background: "#fff",
      components: [{ id: "f", type: "quotient-flow", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
    components: [{ type: "quotient-flow", source: await fs.readFile(SRC, "utf-8") }],
    brandKit: { colors: {}, fonts: [] } as any, canvas: { width: w, height: h } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qf-"));
  const file = path.join(dir, "s.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`file://${file}`);
  await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
  return {
    page, errors,
    close: async () => { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); },
  };
}

const seek = (page: Page, t: number) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);

/** Every card by its title + subtitle, with its box and what is showing on it. */
const cards = (page: Page) => page.evaluate(() => [...document.querySelectorAll(".qf-node")].map((n) => {
  const r = n.getBoundingClientRect();
  const q = (s: string) => n.querySelector(s) as HTMLElement | null;
  const vis = (e: HTMLElement | null) => !!e && getComputedStyle(e).visibility === "visible" && Number(getComputedStyle(e).opacity) > 0.5;
  return {
    text: (n.textContent || "").trim(),
    x: r.left + r.width / 2, y: r.top, w: r.width, h: r.height,
    shown: vis(n as HTMLElement),
    lit: vis(q(".qf-lit")), glow: vis(q(".qf-glow")),
    sparks: n.querySelectorAll(".qf-spark").length,
  };
}));

describe("quotient-flow", () => {
  it("lays out the default flow in the product's shape: branches side by side, the merge centered, cards full size", async () => {
    const { page, close, errors } = await open({}, 1920, 1080);
    try {
      await seek(page, 4);
      const c = await cards(page);
      const find = (s: string) => c.filter((n) => n.text.includes(s));
      expect(c.length).toBe(13); // 11 steps + True/False pills
      // The scene's `* { max-width: 100% }` once squeezed every card to a sliver.
      const cardW = await page.evaluate(() => (document.querySelector(".qf-card") as HTMLElement).offsetWidth);
      expect(cardW).toBe(192);
      const http = find("HTTP Request")[0], falseSlack = find("Send Slack Message")[1], merge = find("Update Person")[0];
      expect(Math.abs(http.y - falseSlack.y)).toBeLessThan(2); // one row
      expect(http.x).toBeLessThan(falseSlack.x);
      expect(Math.abs(merge.x - (find("Send Slack Message")[0].x + falseSlack.x) / 2)).toBeLessThan(2);
      // The whole flow is in frame, every step shown, every connector drawn.
      for (const n of c) {
        expect(n.shown).toBe(true);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.y + n.h).toBeLessThanOrEqual(1080);
      }
      const offsets = await page.evaluate(() => [...document.querySelectorAll(".qf-edges path")].map((p) => Number(p.getAttribute("stroke-dashoffset") || 0)));
      expect(offsets.length).toBe(13);
      expect(Math.max(...offsets)).toBeLessThan(0.5);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("unfurls row by row: nothing at the start, the trigger first, the branches together", async () => {
    const { page, close } = await open(BEAT3, 1080, 1920);
    try {
      await seek(page, 0);
      expect((await cards(page)).some((n) => n.shown)).toBe(false);
      await seek(page, 0.45);
      const early = (await cards(page)).filter((n) => n.shown).map((n) => n.text);
      expect(early.some((t) => t.includes("Customer signal"))).toBe(true);
      expect(early.some((t) => t.includes("Case study"))).toBe(false);
      await seek(page, 1.3);
      const all = await cards(page);
      const emails = all.filter((n) => n.text.includes("Send Email"));
      expect(emails.every((n) => n.shown)).toBe(true);
      expect(new Set(emails.map((n) => Math.round(n.y))).size).toBe(1);
    } finally { await close(); }
  }, 60000);

  it("performs the script: the highlight twinkles, the path lights its steps (and only those), the camera rides in", async () => {
    const { page, close, errors } = await open(BEAT3, 1080, 1920);
    try {
      await seek(page, 1.0);
      const fitW = (await cards(page)).find((n) => n.text.includes("Customer signal"))!.w;
      await seek(page, 1.8);
      const mid = await cards(page);
      const agent = mid.find((n) => n.text.includes("Agent"))!;
      expect(agent.glow).toBe(true);
      expect(agent.sparks).toBeGreaterThanOrEqual(4);
      await seek(page, 4.6);
      const end = await cards(page);
      const litText = end.filter((n) => n.lit).map((n) => n.text);
      for (const s of ["Customer signal", "Agent", "Which signal?", "Case study", "sales heads-up"]) {
        expect(litText.some((t) => t.includes(s)), `${s} lit`).toBe(true);
      }
      expect(litText.some((t) => t.includes("Pricing follow-up"))).toBe(false);
      expect(litText.some((t) => t.includes("Milestone next steps"))).toBe(false);
      expect(end.find((n) => n.text.includes("Agent"))!.glow).toBe(false); // until 2.4
      // The trail: one accent copy per connector travelled (the branch
      // passes its pill: 5 steps, 5 connectors), fully drawn.
      const trail = await page.evaluate(() => [...document.querySelectorAll(".qf-trail path")].map((p) => Number(p.getAttribute("stroke-dashoffset"))));
      expect(trail.length).toBe(5);
      expect(Math.max(...trail)).toBeLessThan(0.5);
      // A wide flow on a phone frame is too small to read whole: the path rides in.
      const rideW = end.find((n) => n.text.includes("Customer signal"))!.w;
      expect(rideW).toBeGreaterThan(fitW * 1.3);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("takes word anchors on every time, and stays deterministic", async () => {
    const comp: any = { type: "quotient-flow", data: JSON.parse(JSON.stringify({ ...BEAT3,
      unfurl_at: "@brings",
      steps: BEAT3.steps.map((s, i) => (i === 0 ? { ...s, at: "@signals" } : s)),
      script: [{ at: "@acts", action: "path", steps: ["sig", "agent"] }, { at: "@together", action: "highlight", step: "which", until: "@acts$" }] })) };
    expect(extractAnchors(comp)).toBe(5);
    expect(Object.keys(comp.anchors).sort()).toEqual(["script[0].at", "script[1].at", "script[1].until", "steps[0].at", "unfurl_at"]);
    const src = await fs.readFile(SRC, "utf-8");
    expect(src).not.toMatch(/Math\.random|onUpdate|repeat:\s*-1/);
  });
});

describe("quotient-flow-panel", () => {
  const PANEL_SRC = path.resolve(__dirname, "../src/components/mockups/quotient-flow-panel.component.html");
  it("types into a field, swaps a dropdown, moves a radio -- and seeks back", async () => {
    const data = { script: [
      { at: 0.6, action: "select", field: "Trigger Type", value: "Event" },
      { at: 1.0, action: "type", field: "Flow ID", value: "pricing-page-viewed" },
      { at: 2.0, action: "select", value: "Use existing audience" },
    ] };
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 3, background: "#fff",
        components: [{ id: "p", type: "quotient-flow-panel", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
      components: [{ type: "quotient-flow-panel", source: await fs.readFile(PANEL_SRC, "utf-8") }],
      brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 700, height: 1164 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qp-"));
    const file = path.join(dir, "s.html");
    await fs.writeFile(file, html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 700, height: 1164 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      const state = async (t: number) => {
        await seek(page, t);
        return page.evaluate(() => {
          const shown = (e: Element) => getComputedStyle(e).visibility === "visible" && Number(getComputedStyle(e).opacity) > 0.5;
          const vals = [...document.querySelectorAll(".qp-val")].map((v) => [...v.children].filter(shown).map((c) => (c.textContent || "").trim()).join(""));
          const radio = [...document.querySelectorAll(".qp-radio")].findIndex((r) => shown(r.querySelector("i")!));
          return { vals, radio };
        });
      };
      expect(await state(0.1)).toEqual({ vals: ["Programmatic", "cmot1nzux000vkz041usoppzt"], radio: 0 });
      const mid = await state(1.3);
      expect(mid.vals[0]).toBe("Event");
      expect(mid.vals[1].length).toBeGreaterThan(0);
      expect("pricing-page-viewed".startsWith(mid.vals[1])).toBe(true);
      expect(await state(2.8)).toEqual({ vals: ["Event", "pricing-page-viewed"], radio: 1 });
      expect(await state(0.1)).toEqual({ vals: ["Programmatic", "cmot1nzux000vkz041usoppzt"], radio: 0 });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 60000);
});
