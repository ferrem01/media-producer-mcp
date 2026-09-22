import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// THE CURSOR LANDS ON THE THING. A film that clicks a mock's Tasks tab, a
// schedule menu, a Publish button or a line the agent wrote in the chat is
// making a claim the viewer checks instantly: the pointer is ON it, or the
// shot is a lie. Percentages drift with every layout change, so a mock marks
// what can be clicked with data-cursor-target and the runner aims at the
// element. This pins the aim for all four Quotient mocks, INCLUDING the chat,
// whose lines are built then hidden until their reveal -- there the component
// publishes a resolver that knows where a line will be at the moment of the
// click, scroll included.

const W = 1920, H = 1080;

async function load(name: string) {
  return {
    type: name,
    source: await fs.readFile(
      path.resolve(__dirname, `../src/components/mockups/${name}.component.html`), "utf-8"),
  };
}

const TASKS = [
  { text: "Draft LinkedIn post from the call highlights", due: "Today", priority: "high",
    owner: "Quotient Agent", platform: "linkedin", deliverable: "LinkedIn — BrightLoop" },
  { text: "Draft X post", due: "Today", priority: "high", owner: "Quotient Agent",
    platform: "x", deliverable: "X — one-liner" },
  { text: "Write the blog: the BrightLoop story", due: "Today", priority: "medium",
    owner: "Quotient Agent", deliverable: "Blog — BrightLoop" },
];

type Case = {
  type: string; data: Record<string, unknown>; duration: number;
  at: number; selector: string;
};

const CASES: Record<string, Case> = {
  // The click that carries the film from the conversation into the page it
  // opens: the line is revealed at 1.2 and clicked after it.
  chat: {
    type: "quotient-chat", duration: 3.4, at: 2.35,
    selector: '[data-cursor-target="campaign"]',
    data: {
      conversation_title: "BrightLoop call → thought leadership",
      script: [
        { action: "agent-message", text: "Got the transcript. Scanning for the moment worth marketing.", at: 0.3 },
        { action: "verb-line", verb: "Created", entity: "campaign", title: "BrightLoop Thought Leadership", at: 1.2 },
        { action: "click", target: "campaign", at: 1.9 },
      ],
    },
  },
  campaign: {
    type: "quotient-campaign", duration: 3, at: 0.7,
    selector: '[data-cursor-target="tasks"]',
    data: {
      title: "BrightLoop Thought Leadership", active_tab: "brief", tasks: TASKS,
      script: [
        { action: "click", target: "tasks", at: 0.3 },
        { action: "switch-tab", tab: "tasks", at: 0.7 },
      ],
    },
  },
  social: {
    type: "quotient-social", duration: 3.2, at: 0.8,
    selector: '[data-cursor-target="schedule"]',
    data: {
      platform: "linkedin", status: "draft", post_title: "BrightLoop LinkedIn Draft",
      post_text: "BrightLoop cut onboarding from three weeks to four days.",
      script: [
        { action: "click", target: "schedule", at: 0.4 },
        { action: "open-schedule-menu", at: 0.85 },
      ],
    },
  },
  // The menu row is built hidden and only faded in -- it still has a box, so
  // the aim resolves before it is ever shown.
  socialMenu: {
    type: "quotient-social", duration: 3.2, at: 1.8,
    selector: '.qsp-schedmenu-row[data-menu="publish"]',
    data: {
      platform: "linkedin", status: "draft", post_title: "BrightLoop LinkedIn Draft",
      post_text: "BrightLoop cut onboarding from three weeks to four days.",
      script: [
        { action: "open-schedule-menu", at: 0.4 },
        { action: "click", target: "publish", at: 1.2 },
      ],
    },
  },
  blog: {
    type: "quotient-blog", duration: 2.6, at: 0.8,
    selector: '[data-cursor-target="publish"]',
    data: {
      title: "How BrightLoop Cut Onboarding Drop-off",
      script: [{ action: "click", target: "publish", at: 0.4 }],
    },
  },
};

async function aimOf(browser: Browser, c: Case) {
  const comp = await load(c.type);
  const html = await assembleScene({
    scene: {
      id: "s", label: "aim", duration_seconds: c.duration, background: "#0f172a",
      components: [{
        id: "c", type: c.type,
        position: { x: "3%", y: "5%", width: "94%", height: "90%" }, z_index: 10, data: c.data,
      }],
    } as any,
    components: [comp],
    brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aim-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, html);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
    await page.evaluate((t) => {
      const tl = (window as any).__MP_TIMELINE;
      if (tl) { tl.pause(); tl.time(t); }
    }, c.at);
    await page.waitForTimeout(120);
    return await page.evaluate((sel) => {
      const cur = document.querySelector(".mp-cursor");
      const el = document.querySelector(sel);
      if (!cur || !el) return { found: false, inside: false, missBy: 9999, opacity: 0 };
      const cb = cur.getBoundingClientRect(), eb = el.getBoundingClientRect();
      // The arrow's POINT is what clicks, not the middle of the 24px box.
      const tip = { x: cb.left + 2, y: cb.top + 2 };
      const dx = tip.x < eb.left ? eb.left - tip.x : (tip.x > eb.right ? tip.x - eb.right : 0);
      const dy = tip.y < eb.top ? eb.top - tip.y : (tip.y > eb.bottom ? tip.y - eb.bottom : 0);
      return {
        found: true,
        inside: dx === 0 && dy === 0,
        missBy: Math.round(Math.hypot(dx, dy)),
        opacity: Number(getComputedStyle(cur).opacity),
      };
    }, c.selector);
  } finally {
    await page.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("cursor aim", () => {
  it("lands the pointer inside every clicked element", async () => {
    const browser = await chromium.launch({
      ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
    });
    try {
      for (const [name, c] of Object.entries(CASES)) {
        const r = await aimOf(browser, c);
        expect(r.found, `${name}: cursor and target must exist`).toBe(true);
        // A cursor that never moved is invisible -- the silent failure mode.
        expect(r.opacity, `${name}: cursor must be visible at the click`).toBeGreaterThan(0.5);
        expect(r.missBy, `${name}: pointer missed by ${r.missBy}px`).toBe(0);
        expect(r.inside, `${name}: pointer must be inside the target`).toBe(true);
      }
    } finally {
      await browser.close();
    }
  }, 180_000);
});
