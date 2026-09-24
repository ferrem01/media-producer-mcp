import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { extractAnchors } from "../src/core/word-anchors.js";

// card-cascade: overwhelm as a long 3D row of cards standing up like
// dominoes, a cursor hovering with tags, the whole row draining to grey on
// the word (after the Bundance spec ad Marc sent).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src/components/props/card-cascade.component.html");

describe("card-cascade", () => {
  it("stands the row up card by card, hovers with a tag, and drains to grey", async () => {
    const data = { count: 14, hovers: [{ at: 1.2, card: 1, tag: "???" }], grey_at: 3.2 };
    const html = await assembleScene({
      scene: { id: "s", label: "s", duration_seconds: 4.5, background: "#fff",
        components: [{ id: "c", type: "card-cascade", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
      components: [{ type: "card-cascade", source: await fs.readFile(SRC, "utf-8") }],
      brandKit: { colors: {}, fonts: [] } as any, canvas: { width: 1920, height: 1080 } as any,
      gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    } as any);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-"));
    const file = path.join(dir, "s.html");
    await fs.writeFile(file, html);
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`file://${file}`);
      await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
      const at = async (t: number) => {
        await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
        return page.evaluate(() => {
          const shown = (e: Element) => getComputedStyle(e).visibility !== "hidden" && Number(getComputedStyle(e).opacity) > 0.5;
          return {
            cards: document.querySelectorAll(".cc-card").length,
            standing: [...document.querySelectorAll(".cc-card")].filter(shown).length,
            tag: [...document.querySelectorAll(".cc-tag")].filter(shown).map((t) => t.textContent),
            grey: getComputedStyle(document.querySelector(".cc-stage")!).filter,
            ground: Number(getComputedStyle(document.querySelector(".cc-grey")!).opacity),
          };
        });
      };
      const t0 = await at(0.2);
      expect(t0.cards).toBe(14);
      expect(t0.standing).toBeLessThan(6); // the cascade is still running
      const t1 = await at(1.8);
      expect(t1.standing).toBe(14);
      expect(t1.tag).toEqual(["???"]);
      expect(t1.ground).toBeLessThan(0.1);
      const t2 = await at(4.2);
      expect(t2.grey).toContain("grayscale(1)");
      expect(t2.ground).toBeGreaterThan(0.9);
      expect((await at(0.2)).ground).toBeLessThan(0.1); // seeks back
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 60000);

  it("takes word anchors and stays deterministic", async () => {
    const c: any = { type: "card-cascade", data: { enter_at: "@choices", grey_at: "@overwhelming", hovers: [{ at: "@this", card: 2, tag: "?" }] } };
    expect(extractAnchors(c)).toBe(3);
    expect(await fs.readFile(SRC, "utf-8")).not.toMatch(/Math\.random|onUpdate|repeat:\s*-1/);
  });
});
