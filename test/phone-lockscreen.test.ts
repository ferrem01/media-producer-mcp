import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { extractAnchors } from "../src/core/word-anchors.js";

// The consequence beat: notifications land on a lock screen, newest on top,
// and a stamp slams onto the wrong one. Built for the signals ad's beat 2
// (proj_de974ad1), where a diagram of disconnected tools read as nothing.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src/components/mockups/phone-lockscreen.component.html");

const DATA = {
  time: "2:16",
  notifications: [
    { at: 0.4, app: "Analytics", icon: "A", title: "Visitor #4821 viewed /pricing" },
    { at: 1.4, app: "CRM", icon: "C", title: "Deal moved: Northwind → Proposal" },
    { at: 2.4, app: "Mail", icon: "M", title: "Welcome to Northwind", body: "Start your free trial today" },
  ],
  stamp: { text: "WRONG EMAIL.", at: 3.2 },
};

describe("phone-lockscreen", () => {
  it("lands notifications newest-on-top at their times and stamps the newest", async () => {
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 5, background: "#000",
        components: [{ id: "p", type: "phone-lockscreen", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data: DATA }] } as any,
      components: [{ type: "phone-lockscreen", source: await fs.readFile(SRC, "utf-8") }],
      brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 1080, height: 1920 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pls-"));
    const file = path.join(dir, "s.html");
    await fs.writeFile(file, html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      const at = async (t: number) => {
        await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
        return page.evaluate(() => ({
          shown: [...document.querySelectorAll(".pls-card")].filter((c) => (c as HTMLElement).getBoundingClientRect().height > 40)
            .map((c) => c.querySelector(".pls-title")!.textContent),
          stamp: getComputedStyle(document.querySelector(".pls-stamp")!).visibility,
          stampBox: document.querySelector(".pls-stamp")!.getBoundingClientRect().toJSON(),
          newestBox: (document.querySelector(".pls-card") as HTMLElement).getBoundingClientRect().toJSON(),
        }));
      };
      const t0 = await at(0.1);
      expect(t0.shown).toEqual([]);
      const t1 = await at(1.9);
      expect(t1.shown).toEqual(["Deal moved: Northwind → Proposal", "Visitor #4821 viewed /pricing"]);
      const t2 = await at(4.5);
      expect(t2.shown[0]).toBe("Welcome to Northwind");
      expect(t2.shown).toHaveLength(3);
      expect(t2.stamp).toBe("visible");
      // The stamp sits ON the newest notification, and out of a Reel's
      // bottom 18% (the platform's caption band).
      const mid = t2.stampBox.top + t2.stampBox.height / 2;
      expect(mid).toBeGreaterThan(t2.newestBox.top);
      expect(mid).toBeLessThan(t2.newestBox.bottom + 20);
      expect(t2.stampBox.bottom).toBeLessThan(1920 * 0.82);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 60000);

  it("takes word anchors on every time", () => {
    const comp: any = { type: "phone-lockscreen", data: JSON.parse(JSON.stringify({ ...DATA,
      notifications: DATA.notifications.map((n, i) => ({ ...n, at: ["@tool", "@another", "@third"][i] })), stamp: { text: "WRONG EMAIL.", at: "@third" } })) };
    expect(extractAnchors(comp)).toBe(4);
    expect(Object.keys(comp.anchors).sort()).toEqual(["notifications[0].at", "notifications[1].at", "notifications[2].at", "stamp.at"]);
  });

  it("two phones side by side: each scales whole into its half (no squeezed stage) and wears its label", async () => {
    const phone = (x: string, label: string) => ({ type: "phone-lockscreen", position: { x, y: "20%", width: "45%", height: "45%" },
      data: { label, notifications: [{ at: 0.2, app: "Mail", title: label, body: "A notification long enough to wrap across the card" }] } });
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 2, background: "#fff",
        components: [{ id: "a", ...phone("3%", "Company A") }, { id: "b", ...phone("52%", "Company B") }] } as any,
      components: [{ type: "phone-lockscreen", source: await fs.readFile(SRC, "utf-8") }],
      brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 1080, height: 1920 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pls2-"));
    const file = path.join(dir, "s.html");
    await fs.writeFile(file, html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(1.5); });
      const m = await page.evaluate(() => [...document.querySelectorAll(".pls-root")].map((r) => {
        const box = r.getBoundingClientRect();
        const card = r.querySelector(".pls-card-in")!.getBoundingClientRect();
        const label = r.querySelector(".pls-label") as HTMLElement;
        return { boxW: box.width, cardW: card.width, label: label.textContent, labelShown: getComputedStyle(label).display !== "none" };
      }));
      expect(m.length).toBe(2);
      for (const p of m) {
        expect(p.cardW / p.boxW).toBeGreaterThan(0.85); // squeezed: ~0.2
        expect(p.labelShown).toBe(true);
      }
      expect(m.map((p) => p.label)).toEqual(["Company A", "Company B"]);
    } finally {
      await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 60000);
});

