import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

// Marc: "am i supposed to like go out and find all these stickers ... or is
// there like a library somewhere of a base set of stickers". The house set,
// stickers by name, a name the set lacks drawn on demand, and a shower of
// them (the dollar-bills shot) -- each checked here, the showers in stills
// (set STK_SHOTS=<dir> to keep the frames).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = fsSync.mkdtempSync(path.join(os.tmpdir(), "stk-data-"));
process.env.MP_DATA_DIR = DATA;

let lib: typeof import("../src/core/sticker-library.js");
let assembleScene: typeof import("../src/core/scene-assembler.js").assembleScene;
beforeAll(async () => {
  lib = await import("../src/core/sticker-library.js");
  ({ assembleScene } = await import("../src/core/scene-assembler.js"));
});

const BRAND = { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] };
async function still(type: string, data: unknown, run: (page: Page, seek: (t: number) => Promise<void>) => Promise<void>) {
  const src = await fs.readFile(path.resolve(__dirname, `../src/components/props/${type}.component.html`), "utf-8");
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 5, background: "linear-gradient(160deg,#c9b8a6,#8b7a6c)", components: [{ id: "c", type, position: type === "sticker-rain" ? { x: 0, y: 0, width: "100%", height: "100%" } : { x: "30%", y: "60%", width: "40%", height: "22%" }, data }] } as any,
    components: [{ type, source: src }], brandKit: BRAND as any, canvas: { width: 1080, height: 1920 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "stk-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), undefined, { timeout: 10000 });
    await run(page, (t) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t));
    expect(errors).toEqual([]);
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}
const shot = async (page: Page, name: string) => { if (process.env.STK_SHOTS) await page.screenshot({ path: path.join(process.env.STK_SHOTS, name) }); };
const pieces = (page: Page) => page.evaluate(() => [...document.querySelectorAll(".strn-piece")].map((n) => {
  const r = (n as HTMLElement).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, vis: getComputedStyle(n).visibility !== "hidden" && +getComputedStyle(n).opacity > 0.5, loaded: (n as HTMLImageElement).naturalWidth > 0 };
}));

describe("the house sticker library", () => {
  it("every house sticker is committed, named in the prop's schema, and addressed by name", async () => {
    const dir = path.resolve(__dirname, "../src/stickers");
    const schema = JSON.parse(await fs.readFile(path.resolve(__dirname, "../src/components/props/sticker-prop.schema.json"), "utf8"));
    expect(lib.HOUSE_STICKERS.length).toBeGreaterThanOrEqual(40);
    for (const s of lib.HOUSE_STICKERS) {
      expect(fsSync.existsSync(path.join(dir, `${lib.stickerSlug(s.name)}.webp`)), s.name).toBe(true);
      expect(schema.description, s.name).toContain(s.name);
    }
    expect(lib.stickerUrl("Money Stack")).toBe("/assets/_system/stickers/money-stack.webp");
    // The house style never draws a brand's mark.
    expect(lib.stickerPrompt("a chimp")).toMatch(/no logos or brand marks/);
  });
  it("copies the house set into the data dir and finds a sticker by a word", async () => {
    const all = await lib.ensureStickerLibrary(DATA);
    expect(all.length).toBe(lib.HOUSE_STICKERS.length);
    expect(fsSync.existsSync(path.join(DATA, "_system", "stickers", "chimp.webp"))).toBe(true);
    expect(lib.findSticker(all, "mailchimp")?.name).toBe("chimp");
    expect(lib.findSticker(all, "cash")?.name).toMatch(/money/);
    expect(lib.findSticker(all, "outdated")?.name).toMatch(/dinosaur|floppy|fax/);
  });
  it("a sticker name becomes its file at assembly; the stored data keeps the name", () => {
    const stored = { sticker: "chimp", at: 1 };
    const prop = lib.stickerData("sticker-prop", stored);
    expect(prop).toMatchObject({ kind: "image", src: "/assets/_system/stickers/chimp.webp" });
    expect(stored).toEqual({ sticker: "chimp", at: 1 });
    expect(lib.stickerData("sticker-rain", { stickers: ["coin", "dollar-bill"] }).srcs).toEqual(["/assets/_system/stickers/coin.webp", "/assets/_system/stickers/dollar-bill.webp"]);
    expect(lib.stickerNamesIn([{ type: "sticker-rain", data: { sticker: "taco", sticker_subject: "a taco" } }, { type: "pill", data: { sticker: "x" } }])).toEqual([{ name: "taco", subject: "a taco" }]);
  });
});

describe("sticker-prop by name", () => {
  it("draws the named house sticker in its box", async () => {
    await still("sticker-prop", { sticker: "chimp", at: 0.3 }, async (page, seek) => {
      await seek(1.6);
      const a = await page.evaluate(() => {
        const img = document.querySelector(".stkp-image") as HTMLImageElement | null;
        const box = document.querySelector(".mp-component")!.getBoundingClientRect();
        const r = img?.getBoundingClientRect();
        return img && r ? { loaded: img.naturalWidth > 0, in: r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1, o: +getComputedStyle(img).opacity } : null;
      });
      await shot(page, "sticker-chimp.png");
      expect(a).toEqual({ loaded: true, in: true, o: 1 });
    });
  }, 60000);
});

describe("sticker-rain: the money shot", () => {
  it("flutter: bills fall through the frame, spread across it, the same every time", async () => {
    const data = { sticker: "dollar-bill", count: 14, at: 0.3, spread: 1.2, fall: 2.2 };
    let first: Array<{ x: number; y: number }> = [];
    await still("sticker-rain", data, async (page, seek) => {
      await seek(0.1);
      expect((await pieces(page)).every((p) => !p.vis)).toBe(true);
      await seek(1.8);
      const mid = await pieces(page);
      await shot(page, "rain-flutter.png");
      expect(mid.length).toBe(14);
      expect(mid.every((p) => p.loaded)).toBe(true);
      const onScreen = mid.filter((p) => p.vis && p.y > 0 && p.y < 1920);
      expect(onScreen.length).toBeGreaterThanOrEqual(8);
      const xs = onScreen.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1080 * 0.6);
      // A shower, not a slanted row: height does not follow the lane (the
      // first cut staggered starts left to right and fell as one diagonal).
      const n = onScreen.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = onScreen.reduce((a, p) => a + p.y, 0) / n;
      const cov = onScreen.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
      const sx = Math.sqrt(onScreen.reduce((a, p) => a + (p.x - mx) ** 2, 0)), sy = Math.sqrt(onScreen.reduce((a, p) => a + (p.y - my) ** 2, 0));
      expect(Math.abs(cov / (sx * sy))).toBeLessThan(0.6);
      first = mid.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
      await seek(4.9);
      expect((await pieces(page)).every((p) => p.y > 1920)).toBe(true);
    });
    await still("sticker-rain", data, async (page, seek) => {
      await seek(1.8);
      expect((await pieces(page)).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))).toEqual(first);
    });
  }, 90000);
  it("pile: coins drop, land on the floor and stay; lanes 'sides' keeps the face clear", async () => {
    await still("sticker-rain", { sticker: "coin", mode: "pile", lanes: "sides", count: 10, at: 0.2, spread: 0.8, size: 0.16 }, async (page, seek) => {
      await seek(4.5);
      const end = await pieces(page);
      await shot(page, "rain-pile.png");
      expect(end.every((p) => p.vis && p.loaded)).toBe(true);
      expect(end.every((p) => p.y > 1920 * 0.8 && p.y < 1920)).toBe(true);
      // Every coin lies wholly inside the frame (the bottom edge cut them off).
      expect(await page.evaluate(() => [...document.querySelectorAll(".strn-piece")].every((n) => { const r = n.getBoundingClientRect(); return r.bottom <= 1920 + 1 && r.left >= -1 && r.right <= 1080 + 1; }))).toBe(true);
      expect(end.every((p) => p.x < 1080 / 3 + 40 || p.x > (1080 * 2) / 3 - 40)).toBe(true);
    });
  }, 60000);
});
