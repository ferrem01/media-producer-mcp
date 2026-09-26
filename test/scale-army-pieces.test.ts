import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// The Scale Army cut (recipe founder-selfie-punch-cards), Marc: "there is
// this text highlighting too... do we have that?" -- the pieces it needs,
// each checked in a 9:16 still (set SAP_SHOTS=<dir> to keep the frames).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAND = { colors: { primary: "#f0643a", background: "#ffffff", text: "#17171c" }, fonts: [] };

async function still(type: string, dir: string, data: unknown, position: unknown, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>, background = "linear-gradient(160deg,#6b5a4e,#2c2622)") {
  const src = await fs.readFile(path.resolve(__dirname, `../src/components/${dir}/${type}.component.html`), "utf-8");
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 5, background, components: [{ id: "c", type, position, data }] } as any,
    components: [{ type, source: src }], brandKit: BRAND as any, canvas: { width: 1080, height: 1920 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sap-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
const shot = async (page: Page, name: string) => { if (process.env.SAP_SHOTS) await page.screenshot({ path: path.join(process.env.SAP_SHOTS, name) }); };

describe("tiered captions: small running words, the key phrase big on a brush plate", () => {
  it("splits a phrase into lead / key / tail, wipes the plate on with the key, and fits the lane", async () => {
    await still("reel-caption-lane", "captions", {
      mode: "tiered", scrim: "shadow", max_font: 96, min_font: 40,
      phrases: [
        { text: "We hired a *social* *media* *manager* before", start: 0.2, end: 2.4 },
        { text: "but nothing actually", start: 2.4, end: 3.2 },
        { text: "*ACTUAL* *PIPELINE*", start: 3.2, end: 4.6, key_style: "plain" },
      ],
    }, { x: "4%", y: "66%", width: "92%", height: "16%" }, async (page, seek) => {
      const at = async (t: number) => { await seek(t); return page.evaluate(() => {
        const vis = [...document.querySelectorAll(".rcl-phrase")].filter((p) => getComputedStyle(p).visibility !== "hidden" && +getComputedStyle(p).opacity > 0.5);
        const ph = vis[0] as HTMLElement | undefined;
        if (!ph) return null;
        const box = (ph.closest(".rcl-stack") as HTMLElement).getBoundingClientRect();
        const r = (sel: string) => { const e = ph.querySelector(sel) as HTMLElement | null; return e ? { fs: parseFloat(getComputedStyle(e).fontSize), rect: e.getBoundingClientRect(), text: e.textContent } : null; };
        const plate = ph.querySelector(".rcl-plate") as HTMLElement | null;
        return { n: vis.length, lead: r(".rcl-lead"), key: r(".rcl-key"), tail: r(".rcl-tail"), plate: plate ? getComputedStyle(plate).clipPath : null, plateBg: plate ? getComputedStyle(plate).backgroundColor : null, keyInk: r(".rcl-keytext") ? getComputedStyle(ph.querySelector(".rcl-keytext")!).color : null, box: { l: box.left, r: box.right, t: box.top, b: box.bottom } };
      }); };
      const a = (await at(2.0))!;
      await shot(page, "tiered-plate.png");
      expect(a.n).toBe(1);
      expect(a.lead!.text).toBe("We hired a");
      expect(a.key!.text).toBe("social media manager");
      expect(a.tail!.text).toBe("before");
      expect(a.key!.fs).toBeGreaterThan(a.lead!.fs * 1.9); // two sizes
      expect(a.plate).toMatch(/inset\(0(px)? 0%? ?0(px)? 0(px)?\)|inset\(0px\)/); // wiped fully on
      expect(a.plateBg).toBe("rgb(240, 100, 58)");
      expect(a.keyInk).toBe("rgb(255, 255, 255)");
      for (const part of [a.lead!, a.key!, a.tail!]) { expect(part.rect.left).toBeGreaterThanOrEqual(a.box.l - 2); expect(part.rect.right).toBeLessThanOrEqual(a.box.r + 2); }
      const early = (await at(0.25))!; // the plate starts closed
      expect(early.plate).toMatch(/inset\(0(px)? (9\d|100)%/);
      const b = (await at(2.8))!;
      expect(b.key).toBeNull(); expect(b.lead!.text).toBe("but nothing actually");
      const c = (await at(4.2))!;
      await shot(page, "tiered-plain.png");
      expect(c.plate).toBeNull(); // plain payoff: no plate
      expect(c.key!.text).toBe("ACTUAL PIPELINE");
    });
  }, 60000);
});

describe("type-punch-card: big brand words streak into their spots on a white card", () => {
  it("stacks a repeated line, lands each line sharp inside the frame, and streaks one out", async () => {
    await still("type-punch-card", "titles", {
      lines: [
        { text: "More posts", repeat: 3, x: 62, y: 20, at: 0.2, out: 1.4 },
        { text: "We", x: 14, y: 45, at: 1.5, size: "xl" },
        { text: "Better", x: 42, y: 70, at: 1.9 },
        { text: "Designs", italic: true, x: 60, y: 78, at: 2.2, from: "up" },
      ],
    }, { x: 0, y: 0, width: "100%", height: "100%" }, async (page, seek) => {
      const read = async (t: number) => { await seek(t); return page.evaluate(() => [...document.querySelectorAll(".tpc-line")].map((l) => {
        const r = l.getBoundingClientRect();
        const copies = [...l.querySelectorAll(".tpc-copy")].map((c) => +getComputedStyle(c).opacity);
        return { text: l.querySelector(".tpc-copy")!.textContent, copies, filter: getComputedStyle(l).filter, l: r.left, r: r.right, t: r.top, b: r.bottom, color: getComputedStyle(l).color, italic: getComputedStyle(l).fontStyle };
      })); };
      const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".tpc")!).backgroundColor);
      expect(bg).toBe("rgb(255, 255, 255)");
      const a = await read(1.0);
      expect(a[0].copies).toEqual([1, 1, 1]); // the stack landed
      expect(a[0].filter).toBe("none");      // sharp once landed
      expect(a[0].color).toBe("rgb(240, 100, 58)");
      expect(a[1].copies).toEqual([0]);       // not yet
      const mid = await read(1.9);
      expect(mid[0].copies.every((o) => o < 0.05)).toBe(true); // streaked out
      const b = await read(3.2);
      await shot(page, "punch-card.png");
      for (const ln of b.slice(1)) {
        expect(ln.copies).toEqual([1]);
        expect(ln.filter).toBe("none");
        expect(ln.l).toBeGreaterThanOrEqual(0); expect(ln.r).toBeLessThanOrEqual(1080); expect(ln.t).toBeGreaterThanOrEqual(0); expect(ln.b).toBeLessThanOrEqual(1920);
      }
      expect(b[3].italic).toBe("italic");
      const inFlight = await read(1.62); // "We" mid-streak carries the blur
      expect(inFlight[1].filter).toMatch(/url\(/);
    }, "#ffffff");
  }, 60000);
});

describe("stack-list: a lead, then items rising one per word, carried over the person", () => {
  const data = { lead: "that continuously improves", items: [{ text: "our hooks", at: 1.0 }, { text: "our formats", at: 1.5 }, { text: "our CTAs", at: 2.0 }] };
  const read = (page: Page) => page.evaluate(() => {
    const root = document.querySelector(".stl") as HTMLElement;
    return {
      bg: getComputedStyle(root).backgroundColor,
      lead: +getComputedStyle(document.querySelector(".stl-lead")!).opacity,
      items: [...document.querySelectorAll(".stl-item")].map((n) => ({ o: +getComputedStyle(n).opacity, top: n.getBoundingClientRect().top, left: n.getBoundingClientRect().left, right: n.getBoundingClientRect().right })),
      shadow: getComputedStyle(document.querySelector(".stl-col")!).textShadow,
    };
  });
  it("on its own white card the items land in order, flush left", async () => {
    await still("stack-list", "titles", data, { x: 0, y: 0, width: "100%", height: "100%" }, async (page, seek) => {
      await seek(1.2);
      const a = await read(page);
      expect(a.bg).toBe("rgb(255, 255, 255)");
      expect(a.lead).toBe(1);
      expect(a.items.map((i) => i.o > 0.9)).toEqual([true, false, false]);
      await seek(2.8);
      const b = await read(page);
      await shot(page, "stack-list.png");
      expect(b.items.every((i) => i.o === 1)).toBe(true);
      expect(b.items[1].top).toBeGreaterThan(b.items[0].top);
      expect(Math.abs(b.items[0].left - b.items[2].left)).toBeLessThan(2);
      expect(Math.max(...b.items.map((i) => i.right))).toBeLessThanOrEqual(1080);
    }, "#ffffff");
  }, 60000);
  it("settled over the person: already landed at the cut, transparent, with a halo", async () => {
    await still("stack-list", "titles", { ...data, ground: "none", settled: true }, { x: 0, y: 0, width: "100%", height: "100%" }, async (page, seek) => {
      await seek(0.05);
      const a = await read(page);
      await shot(page, "stack-list-over.png");
      expect(a.bg).toBe("rgba(0, 0, 0, 0)");
      expect(a.lead).toBe(1);
      expect(a.items.every((i) => i.o === 1)).toBe(true);
      expect(a.shadow).not.toBe("none");
    });
  }, 60000);
});
