import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// The Flows launch film's pieces (Marc, Nov 13): the lead's side of each use
// case -- signup-form, booking-confirmed, onboarding-checklist -- and the
// flow's new script actions -- card (the agent's findings), send (the email
// leaving a step) and live (many leads at once, counted), plus the step
// anchors. MP_SHOTS=<dir> also writes a still of each state for review.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK = path.resolve(__dirname, "../src/components/mockups");
const SHOTS = process.env.MP_SHOTS || "";

async function open(type: string, data: unknown, dur = 6, w = 1920, h = 1080) {
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: dur, background: "#fff",
      components: [{ id: "c", type, position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
    components: [{ type, source: await fs.readFile(path.join(MOCK, `${type}.component.html`), "utf-8") }],
    brandKit: { colors: {}, fonts: [] } as any, canvas: { width: w, height: h } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fl-"));
  const file = path.join(dir, "s.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`file://${file}`);
  await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
  return { page, errors, close: async () => { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); } };
}

const seek = (page: Page, t: number) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await fs.mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}
const visible = (page: Page, sel: string) => page.evaluate((s) => {
  const e = document.querySelector(s) as HTMLElement | null;
  if (!e) return false;
  const cs = getComputedStyle(e);
  const r = e.getBoundingClientRect();
  return cs.visibility !== "hidden" && Number(cs.opacity) > 0.5 && r.width > 0;
}, sel);
const text = (page: Page, sel: string) => page.evaluate((s) => (document.querySelector(s)?.textContent || "").trim(), sel);

describe("flows launch: the lead's side", () => {
  it("signup-form types the email, presses, and turns into the success line", async () => {
    const { page, errors, close } = await open("signup-form", {
      headline: "The *lean marketing* newsletter", subtitle: "One email a week.", url: "getquotient.ai/newsletter",
      brand: "Quotient", email: "sarah@northwind.co", type_at: 0.6, press_at: 2.0,
    }, 4);
    try {
      await seek(page, 0.3); expect(await text(page, ".sf-val")).toBe("");
      await seek(page, 1.0); const part = await text(page, ".sf-val");
      expect(part.length).toBeGreaterThan(0); expect("sarah@northwind.co".startsWith(part)).toBe(true);
      await shot(page, "signup-typing");
      await seek(page, 1.9); expect(await text(page, ".sf-val")).toBe("sarah@northwind.co");
      await seek(page, 3.2);
      expect(await visible(page, ".sf-done")).toBe(true);
      expect(await visible(page, ".sf-form")).toBe(false);
      await shot(page, "signup-done");
      // Seeking back restores the typed state (renders frame by frame).
      await seek(page, 1.0); expect(await text(page, ".sf-val")).toBe(part);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("booking-confirmed lands the card, the check and every row, with a plain stamp", async () => {
    const { page, errors, close } = await open("booking-confirmed", { stamp: "Booked Tuesday, 11:02 PM" }, 3);
    try {
      await seek(page, 2.6);
      expect(await text(page, ".bc-title")).toBe("This meeting is scheduled");
      expect(await page.locator(".bc-k").count()).toBe(4);
      expect(await visible(page, ".bc-stamp")).toBe(true);
      // No box around the stamp: plain type.
      const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".bc-stamp")!).backgroundColor);
      expect(bg === "rgba(0, 0, 0, 0)" || bg === "transparent").toBe(true);
      await shot(page, "booking");
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("onboarding-checklist starts stuck at 2 of 5 and a completion steps the count and bar", async () => {
    const { page, errors, close } = await open("onboarding-checklist", {
      title: "Get started with Quotient", idle: "Last active 3 days ago", complete: [{ index: 2, at: 1.5 }],
    }, 3);
    try {
      await seek(page, 1.0);
      expect(await text(page, ".oc-count")).toBe("2 of 5 complete");
      await shot(page, "onboarding-stuck");
      const w1 = await page.evaluate(() => (document.querySelector(".oc-fill") as HTMLElement).getBoundingClientRect().width);
      await seek(page, 2.6);
      expect(await text(page, ".oc-count")).toBe("3 of 5 complete");
      const w2 = await page.evaluate(() => (document.querySelector(".oc-fill") as HTMLElement).getBoundingClientRect().width);
      expect(w2).toBeGreaterThan(w1 * 1.3);
      await shot(page, "onboarding-done");
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);
});

const FLOW = {
  steps: [
    { id: "trig", kind: "event", title: "Meeting booked", subtitle: "Webhook", icon: "calendar" },
    { id: "agent", kind: "agent", subtitle: "Research the person and their company" },
    { id: "slack", kind: "slack", subtitle: "# sales" },
    { id: "email", kind: "email", subtitle: "Before-the-call prep", after: "agent" },
  ],
  pace: 0.12,
};

describe("flows launch: quotient-flow actions", () => {
  it("every step card publishes a data-anchor named by its id", async () => {
    const { page, errors, close } = await open("quotient-flow", FLOW, 3);
    try {
      const anchors = await page.evaluate(() => [...document.querySelectorAll(".qf-card[data-anchor]")].map((e) => e.getAttribute("data-anchor")));
      expect(anchors).toEqual(["trig", "agent", "slack", "email"]);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("card opens the agent's findings beside the step, rows landing in order, inside the frame", async () => {
    const { page, errors, close } = await open("quotient-flow", { ...FLOW, script: [
      { action: "card", step: "agent", at: 1, title: "Research", rows: [
        { label: "Role", value: "VP Marketing" }, { label: "Company", value: "Northwind, 40 people" }, { label: "Fit", value: "Strong", color: "#16a34a" }] },
    ] }, 4);
    try {
      await seek(page, 1.3);
      const early = await page.evaluate(() => [...document.querySelectorAll(".qf-rr")].map((r) => Number(getComputedStyle(r).opacity)));
      expect(early[2]).toBeLessThan(0.5);
      await seek(page, 3.5);
      const box = await page.evaluate(() => (document.querySelector(".qf-research") as HTMLElement).getBoundingClientRect().toJSON());
      expect(await visible(page, ".qf-research")).toBe(true);
      expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(1920);
      expect(box.top).toBeGreaterThanOrEqual(0); expect(box.bottom).toBeLessThanOrEqual(1080);
      const agent = await page.evaluate(() => document.querySelector('[data-anchor="agent"]')!.getBoundingClientRect().toJSON());
      expect(box.left).toBeGreaterThan(agent.right);   // beside it, not over it
      await shot(page, "flow-card");
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("send lifts an envelope off the step and flies it out (right) or at the camera (fills the frame)", async () => {
    const { page, errors, close } = await open("quotient-flow", { ...FLOW, script: [
      { action: "send", step: "email", at: 1, to: "right" },
      { action: "send", step: "email", at: 2.2, to: "camera", duration: 0.6 },
    ] }, 4);
    try {
      const envs = () => page.evaluate(() => [...document.querySelectorAll(".qf-env")].map((e) => {
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return { x: r.left + r.width / 2, w: r.width, vis: cs.visibility !== "hidden" && Number(cs.opacity) > 0.3 };
      }));
      await seek(page, 0.9); expect((await envs()).some((e) => e.vis)).toBe(false);
      await seek(page, 1.3); const a = (await envs())[0];
      expect(a.vis).toBe(true);
      await shot(page, "flow-send");
      await seek(page, 1.95); const b = (await envs())[0];
      expect(b.x).toBeGreaterThan(a.x + 300);
      // Mid-flight to the camera the envelope is still over the card it left:
      // it must paint OVER the step cards, not behind them.
      await seek(page, 2.5);
      const onTop = await page.evaluate(() => {
        const env = document.querySelectorAll(".qf-env")[1];
        const r = env.getBoundingClientRect();
        // The middle of the largest overlap between the envelope and a card.
        let best = null, area = 0;
        for (const c of document.querySelectorAll(".qf-card")) {
          const q = c.getBoundingClientRect();
          const l = Math.max(r.left, q.left), t = Math.max(r.top, q.top);
          const w = Math.min(r.right, q.right) - l, h = Math.min(r.bottom, q.bottom) - t;
          if (w > 0 && h > 0 && w * h > area) { area = w * h; best = [l + w / 2, t + h / 2]; }
        }
        if (!best) return "no overlap";
        const hit = document.elementFromPoint(best[0], best[1]);
        return !!hit && env.contains(hit);
      });
      expect(onTop).toBe(true);
      await seek(page, 3.05); const c = (await envs())[1];
      expect(c.w).toBeGreaterThan(1920);   // at the viewer: past the frame
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("live runs many leads through the paths and each step counts its arrivals", async () => {
    const { page, errors, close } = await open("quotient-flow", { ...FLOW, script: [
      { action: "live", at: 0.5, until: 5, every: 0.3, hop: 0.25, paths: [["trig", "agent", "slack"], ["trig", "agent", "email"]] },
    ] }, 5);
    try {
      const counts = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".qf-card[data-anchor]")].map((c) => {
        const k = c.querySelector(".qf-count") as HTMLElement | null;
        return [c.getAttribute("data-anchor"), k && getComputedStyle(k).visibility !== "hidden" ? Number(k.textContent!.replace(/,/g, "")) : 0];
      })));
      await seek(page, 0.4); expect((await counts()).trig).toBe(0);
      await seek(page, 2.0); const mid = await counts();
      await seek(page, 4.8); const end = await counts();
      expect(end.trig).toBeGreaterThan(mid.trig);
      expect(end.trig).toBeGreaterThanOrEqual(end.agent);
      expect(end.slack + end.email).toBeLessThanOrEqual(end.agent);
      expect(end.slack).toBeGreaterThan(0); expect(end.email).toBeGreaterThan(0);
      await seek(page, 2.4);
      const dots = await page.evaluate(() => [...document.querySelectorAll(".qf-dot")].filter((d) => Number(getComputedStyle(d).opacity) > 0.5).length);
      expect(dots).toBeGreaterThanOrEqual(2);   // several leads in flight at once
      await shot(page, "flow-live");
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);
});

describe("flows launch: the product's triggers", () => {
  it("quotient-flow draws every trigger kind as a Trigger card with its own title", async () => {
    const kinds = ["schedule", "person-update", "person-created", "marketing-event", "webhook", "crm-record"];
    const { page, errors, close } = await open("quotient-flow", {
      steps: kinds.map((k, i) => ({ id: k, kind: k, after: null, ...(i ? {} : {}) })), unfurl: false,
    }, 2);
    try {
      const t = await page.evaluate(() => [...document.querySelectorAll(".qf-card")].map((c) => c.textContent!.replace(/\s+/g, " ").trim()));
      expect(t).toEqual(["ScheduleTrigger", "Person UpdatedTrigger", "Person CreatedTrigger", "Marketing EventTrigger", "WebhookTrigger", "CRM Record UpdatedTrigger"]);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);

  it("quotient-flow-panel menu opens the trigger types, lands on the value and swaps the field's icon", async () => {
    const { page, errors, close } = await open("quotient-flow-panel", {
      script: [{ action: "menu", field: "Trigger Type", value: "Marketing Event", at: 0.5 }],
    }, 3, 700, 1160);
    try {
      await seek(page, 1.0);
      const open1 = await page.evaluate(() => {
        const m = document.querySelector(".qp-menu") as HTMLElement;
        return { vis: getComputedStyle(m).visibility !== "hidden" && Number(getComputedStyle(m).opacity) > 0.5,
          opts: [...m.querySelectorAll(".qp-opt")].map((o) => o.textContent) };
      });
      expect(open1.vis).toBe(true);
      expect(open1.opts).toContain("Webhook");
      expect(open1.opts).toContain("Marketing Event");
      await shot(page, "panel-menu");
      await seek(page, 2.5);
      const after = await page.evaluate(() => {
        const f = document.querySelector(".qp-field.sel") as HTMLElement;
        const spans = [...f.querySelectorAll(".qp-val span")].filter((s) => Number(getComputedStyle(s).opacity) > 0.5);
        return { val: spans.map((s) => s.textContent).join("|"), menu: Number(getComputedStyle(document.querySelector(".qp-menu")!).opacity) };
      });
      expect(after.val).toBe("Marketing Event");
      expect(after.menu).toBeLessThan(0.1);
      expect(errors).toEqual([]);
    } finally { await close(); }
  }, 60000);
});
