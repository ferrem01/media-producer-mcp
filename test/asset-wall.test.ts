import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { measureTextContrast } from "../src/core/text-contrast.js";

// The Moda launch film (Oct 9, Marc: "the color and design makes any video
// pop"): designed sample work drifting past (asset-wall), AI agents as named
// cursors (agent-cursor), and our own email editor building a beautiful
// sample brand's email under them.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, "../src/components");
const src = (cat: string, type: string) => fs.readFile(path.join(LIB, cat, `${type}.component.html`), "utf-8");

async function write(components: any[], W = 1920, H = 1080, dur = 6) {
  const scene = { id: "s", label: "s", duration_seconds: dur, background: "#ffffff", components };
  const html = await assembleScene({ scene: scene as any,
    components: [
      { type: "asset-wall", source: await src("media", "asset-wall") },
      { type: "agent-cursor", source: await src("effects", "agent-cursor") },
      { type: "quotient-email-editor", source: await src("mockups", "quotient-email-editor") },
    ],
    brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H, fps: 30 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap") } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "awall-"));
  const htmlPath = path.join(tmp, "s.html");
  await fs.writeFile(htmlPath, html);
  return { htmlPath, tmp };
}
async function boot(components: any[], W = 1920, H = 1080) {
  const { htmlPath, tmp } = await write(components, W, H);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`file://${htmlPath}`, { waitUntil: "commit" });
  await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000, polling: 100 });
  const at = (t: number) => page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
  return { page, at, done: async () => { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }); } };
}
const FULL = { x: 0, y: 0, width: "100%", height: "100%" };

describe("the house sample work (shared/samples.js + src/sample-work)", () => {
  it("every piece in the manifest is a committed image, and a pick never puts the same piece next to itself", async () => {
    const code = await fs.readFile(path.join(LIB, "shared", "samples.js"), "utf-8");
    const win: any = {};
    new Function("window", code)(win);
    const S = win.mpSamples;
    expect(S.brands.length).toBe(12);
    expect(S.work.length).toBeGreaterThanOrEqual(59);
    for (const w of S.work) {
      expect(w.src).toMatch(/^\/assets\/_system\/sample-work\/[a-z]+-[a-z]+(-[a-z0-9]+)?\.webp$/);
      await fs.access(path.resolve(__dirname, "../src/sample-work", path.basename(w.src)));
      expect(w.ratio).toBeGreaterThan(0.4);
    }
    // Quotient's three areas, each a set worth showing: full-length emails,
    // social posts for each platform, blog articles and blog home pages.
    const by = (k: string) => S.work.filter((w: any) => w.kind === k);
    expect(by("email").length).toBeGreaterThanOrEqual(12);
    expect(by("social").length).toBeGreaterThanOrEqual(14);
    expect(new Set(by("social").map((w: any) => w.platform)).size).toBeGreaterThanOrEqual(6);
    expect(by("blog").length).toBeGreaterThanOrEqual(10);
    for (const w of S.pick(12, { platforms: ["linkedin"] })) expect(w.platform).toBe("linkedin");
    for (const w of S.work) if (w.brand) expect(S.brand(w.brand).id).toBe(w.brand);
    const picks = S.pick(60, { seed: 3 });
    for (let i = 1; i < picks.length; i++) expect(picks[i].src).not.toBe(picks[i - 1].src);
    // Filters, the deck in order, and the film's own pieces.
    expect(S.pick(6, { kinds: ["slide"], brands: ["flowpath"], shuffle: false }).map((w: any) => path.basename(w.src)))
      .toEqual(["flowpath-slide-1.webp", "flowpath-slide-2.webp", "flowpath-slide-3.webp", "flowpath-slide-4.webp", "flowpath-slide-5.webp", "flowpath-slide-6.webp"]);
    expect(S.pick(2, { items: ["/a.png", { src: "/b.png", ratio: 1.25 }], shuffle: false }).map((w: any) => w.src)).toEqual(["/a.png", "/b.png"]);
    // A brand's photo becomes its email's hero.
    S.setPhotos({ oliva: "/assets/t/projects/p/assets/oliva.png", nobody: "/x.png" });
    expect(S.emailBlocks("oliva").blocks[1]).toMatchObject({ kind: "hero", image: "/assets/t/projects/p/assets/oliva.png" });
    expect(S.emailBlocks("flowpath").blocks[1].steps).toHaveLength(3);
    const em = S.emailBlocks("oliva");
    expect(em.brand.name).toBe("Oliva Terra");
    expect(em.blocks.map((b: any) => b.kind)).toEqual(["logo", "hero", "eyebrow", "headline", "text", "button", "footer"]);
  });
});

describe("asset wall", () => {
  it("wall: cards drift across a gradient, an open band carries the headline", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { headline: "1,000 brands for FREE" } }]);
    try {
      await at(1);
      const a = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".aw-card"));
        const h = document.querySelector(".aw-head")!;
        // The words themselves (the block spans the slot, which the ambient
        // camera overscans past the frame).
        const rg = document.createRange(); rg.selectNodeContents(h); const hr = rg.getBoundingClientRect();
        return { n: cards.length, first: cards[0].getBoundingClientRect().left, head: { l: hr.left, r: hr.right, op: Number(getComputedStyle(h).opacity) },
          ground: getComputedStyle(document.querySelector(".aw-ground")!).backgroundImage };
      });
      await at(5);
      const b = await page.evaluate(() => document.querySelectorAll(".aw-card")[0].getBoundingClientRect().left);
      expect(a.n).toBeGreaterThan(12);
      expect(a.ground).toContain("linear-gradient");
      expect(a.head.op).toBe(1);
      expect(a.head.l).toBeGreaterThan(0);
      expect(a.head.r).toBeLessThan(1920);
      expect(b).toBeLessThan(a.first - 20); // drifting
    } finally { await done(); }
  }, 60000);

  it("grid: the same piece for many brands, every card inside the frame, landing in a wave", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { layout: "grid", count: 9, headline: "50 personalized sales decks" } }]);
    try {
      await at(3);
      const r = await page.evaluate(() => Array.from(document.querySelectorAll(".aw-card")).map((c) => { const b = c.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, src: c.querySelector("img")!.getAttribute("src") || "", done: (c.querySelector("img") as HTMLImageElement).naturalWidth }; }));
      expect(r.length).toBe(9);
      for (const c of r) { expect(c.src).toMatch(/sample-work\/[a-z]+-(slide|landing)/); expect(c.done).toBeGreaterThan(0); expect(c.l).toBeGreaterThanOrEqual(0); expect(c.t).toBeGreaterThan(80); expect(c.r).toBeLessThanOrEqual(1920); expect(c.b).toBeLessThanOrEqual(1100); }
    } finally { await done(); }
  }, 60000);

  it("orbit: cards stay in the side columns, clear of the face", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { layout: "orbit", count: 6 } }]);
    try {
      await at(3);
      const r = await page.evaluate(() => Array.from(document.querySelectorAll(".aw-card")).map((c) => { const b = c.getBoundingClientRect(); return { l: b.left, r: b.right }; }));
      expect(r.length).toBe(6);
      for (const c of r) expect(c.r < 1920 * 0.36 || c.l > 1920 * 0.64).toBe(true);
    } finally { await done(); }
  }, 60000);

  it("rolodex: one deck flips past in order, the front slide square to the camera", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { layout: "rolodex" } }]);
    try {
      const front = async (t: number) => { await at(t); return page.evaluate(() => {
        // The card nearest the camera: the one with no tilt.
        const cards = Array.from(document.querySelectorAll(".aw-card")) as HTMLElement[];
        const g = (window as any).gsap;
        const f = cards.map((c, i) => ({ i, rx: Math.abs(Number(g.getProperty(c, "rotationX"))), z: Number(g.getProperty(c, "z")) })).sort((a, b) => b.z - a.z)[0];
        return { n: cards.length, i: f.i, rx: f.rx, src: cards[f.i].querySelector("img")!.getAttribute("src") };
      }); };
      const a = await front(1.0), b = await front(5.8);
      expect(a.n).toBe(6);
      expect(a.src).toContain("flowpath-slide-1");
      expect(a.rx).toBeLessThan(3);
      expect(b.i).toBeGreaterThan(a.i);
      expect(b.src).toContain("flowpath-slide-6");
    } finally { await done(); }
  }, 60000);

  it("fly: pieces come out of the deep and rush past the camera, the stream already moving on frame one", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { layout: "fly", count: 20 } }]);
    try {
      const zs = async (t: number) => { await at(t); return page.evaluate(() => Array.from(document.querySelectorAll(".aw-card")).map((c) => ({ z: Number((window as any).gsap.getProperty(c, "z")), o: Number(getComputedStyle(c).opacity) }))); };
      const a = await zs(0), b = await zs(2);
      expect(a.filter((c) => c.o > 0.5).length).toBeGreaterThan(4);
      // Each card only ever moves towards the camera.
      a.forEach((c, i) => expect(b[i].z).toBeGreaterThanOrEqual(c.z));
      expect(b.some((c) => c.z > 0)).toBe(true);
    } finally { await done(); }
  }, 60000);

  it("scroll: full-length emails in tilted columns, each column scrolling the other way from the next", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { layout: "scroll", kinds: ["email"], headline: "Emails people open." } }]);
    try {
      const ys = async (t: number) => { await at(t); return page.evaluate(() => Array.from(document.querySelectorAll(".aw-col")).map((c) => Number((window as any).gsap.getProperty(c, "y")))); };
      const a = await ys(0.2), b = await ys(5.5);
      expect(a.length).toBe(5);
      const dirs = a.map((y, i) => Math.sign(b[i] - y));
      for (let i = 1; i < dirs.length; i++) expect(dirs[i]).toBe(-dirs[i - 1]);
      const srcs = await page.evaluate(() => Array.from(document.querySelectorAll(".aw-card img")).map((i) => i.getAttribute("src") || ""));
      for (const x of srcs) expect(x).toMatch(/sample-work\/[a-z]+-email/);
      // The line sits in the band at the top, over the ground's fade.
      const head = await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector(".aw-head")!); return r.getBoundingClientRect().bottom; });
      expect(head).toBeLessThan(1080 * 0.24);
      expect(await page.locator(".aw-fade").count()).toBe(1);
    } finally { await done(); }
  }, 60000);

  it("feed: social posts in their platform frames rise in columns", async () => {
    const { page, at, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { layout: "feed" } }]);
    try {
      const y = async (t: number) => { await at(t); return page.evaluate(() => Array.from(document.querySelectorAll(".aw-col")).map((c) => Number((window as any).gsap.getProperty(c, "y")))); };
      const a = await y(0.2), b = await y(5.5);
      a.forEach((v, i) => expect(b[i]).toBeLessThan(v));
      const posts = await page.evaluate(() => Array.from(document.querySelectorAll(".aw-post")).map((p) => ({ text: (p as HTMLElement).innerText, over: p.classList.contains("aw-over"), img: (p.querySelector("img") as HTMLImageElement).getAttribute("src") || "" })));
      expect(posts.length).toBeGreaterThan(8);
      for (const p of posts) expect(p.img).toMatch(/sample-work\/[a-z]+-social/);
      // Every framed post carries its brand's name; feed posts carry the
      // platform's actions, stories and TikToks the app's controls over them.
      expect(posts.some((p) => /Promoted/.test(p.text) && /Repost/.test(p.text))).toBe(true);   // LinkedIn
      expect(posts.some((p) => /likes/.test(p.text))).toBe(true);                               // Instagram
      expect(posts.some((p) => p.over)).toBe(true);                                             // story / TikTok
    } finally { await done(); }
  }, 60000);

  it("grey tone drains the colour (the enemy's work)", async () => {
    const { page, done } = await boot([{ id: "wall", type: "asset-wall", position: FULL, data: { tone: "grey" } }]);
    try {
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".aw-plane")!).filter)).toContain("grayscale(1)");
    } finally { await done(); }
  }, 60000);

  it("the cards are a picture to the gates: cropped at the frame on purpose, never flagged as clipped copy", async () => {
    for (const data of [{ headline: "1,000 brands for FREE" }, { layout: "feed", headline: "Posts for every platform." }, { layout: "scroll", kinds: ["blog"], headline: "Blogs worth reading." }]) {
      const { htmlPath, tmp } = await write([{ id: "wall", type: "asset-wall", position: FULL, data }]);
      try {
        const defects = await measureTextContrast({ htmlPath, width: 1920, height: 1080, atTimes: [3, 5] });
        expect(defects).toEqual([]);
      } finally { await fs.rm(tmp, { recursive: true, force: true }); }
    }
  }, 180000);
});

describe("agent cursors over the editor building a sample brand's email", () => {
  it("the email is the sample brand's, and each agent lands on the block it names", async () => {
    const { page, at, done } = await boot([
      { id: "email", type: "quotient-email-editor", position: { x: "12%", y: "9%", width: "76%", height: "82%" }, z_index: 5, data: { sample: "flowpath", at: 0.3, write_time: 3.2 } },
      { id: "agents", type: "agent-cursor", position: FULL, z_index: 20, data: { cursors: [
        { label: "Design Agent", color: "#e2187b", path: [{ at: 1.4, target: "email.headline" }, { at: 3.6, target: "email.button", click: true }] }] } },
    ]);
    try {
      await at(4.2);
      const m = await page.evaluate(() => {
        const btn = document.querySelector('[data-cid="email"] [data-anchor="button"]')!.getBoundingClientRect();
        const arrow = document.querySelector(".ac-arrow")!.getBoundingClientRect();
        const tag = document.querySelector(".ac-tag")!;
        return { btn: { l: btn.left, t: btn.top, r: btn.right, b: btn.bottom }, tip: { x: arrow.left, y: arrow.top }, tag: tag.textContent, tagW: tag.getBoundingClientRect().width,
          logo: document.querySelector('[data-cid="email"]')!.textContent!.includes("Flowpath"), headline: document.querySelector('[data-cid="email"]')!.textContent!.includes("Your Q3 plan, built in seconds") };
      });
      expect(m.logo).toBe(true);
      expect(m.headline).toBe(true);
      expect(m.tag).toBe("Design Agent");
      expect(m.tagW).toBeGreaterThan(120); // a whole name tag, not a clipped dot
      expect(m.tip.x).toBeGreaterThanOrEqual(m.btn.l - 4);
      expect(m.tip.x).toBeLessThanOrEqual(m.btn.r);
      expect(m.tip.y).toBeGreaterThanOrEqual(m.btn.t - 4);
      expect(m.tip.y).toBeLessThanOrEqual(m.btn.b);
    } finally { await done(); }
  }, 60000);
});

describe("the founder-launch recipe", () => {
  it("loads under creator-cut as a talking-head format, with quiet captions", async () => {
    const { getRecipe } = await import("../src/core/recipes.js");
    const r = getRecipe("founder-launch")!;
    expect(r.grammar).toBe("creator-cut");
    expect(r.format).toBe("talking-head");
    expect(r.spine.map((b) => b.role)).toEqual(["money", "what", "range", "problem", "agents", "difference", "scale", "range_2", "enemy", "belief", "offer"]);
    expect((r.layers as any).captions.style).toBe("quiet");
    const { captionLane } = await import("../src/core/captions.js");
    const spine = { source: "measured", duration: 3, words: [{ text: "We", start: 0, end: 0.3 }, { text: "just", start: 0.3, end: 0.6 }, { text: "raised", start: 0.6, end: 1 }, { text: "money.", start: 1, end: 1.5 }] } as any;
    const lane = captionLane(spine, [], { style: "quiet" })!;
    expect(lane.data.max_font).toBe(40);
    expect(lane.data.scrim).toBe("plate");
  });
});
