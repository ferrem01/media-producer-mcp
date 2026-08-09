import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page, type Browser } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// The reference film's remaining vocabulary ("Behind the Craft", getting the
// golden replication to 100% -- Marc's frame notes):
// - 8-10s: the words of the claim FLY UP from the sheet and assemble into
//   the sentence, and the key word ("volume") grows once the line stands.
// - 10-11s: the standing sentence SMEARS UP -- words stretch and stream out
//   the top, staggered. The caused boundary between typeset beats.
// - The era flip carries ONE sentence across pen -> type -> composer; the
//   typewriter must be able to pick up mid-sentence (pretyped) instead of
//   visibly retyping what the viewer just watched being written.

const W = 1280, H = 720, DUR = 5;

async function assemble(comp: Record<string, unknown>, type: string, srcPath: string): Promise<string> {
  const src = await read(srcPath);
  return assembleScene({
    scene: {
      id: "s1", label: "t", duration_seconds: DUR, background: "#f2efe7",
      components: [{ id: "c1", type, position: { x: "10%", y: "30%", width: "80%", height: "40%" }, ...comp }],
    } as any,
    components: [{ type, source: src }],
    brandKit: { colors: { background: "#f2efe7", text: "#17171c", primary: "#393bf5" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function probe<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "refkin-"));
  const p = path.join(dir, "scene.html");
  await fs.writeFile(p, html);
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
    });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`file://${p}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const KT = "../src/components/titles/kinetic-text.component.html";
const TW = "../src/components/titles/typewriter.component.html";
const RP = "../src/components/mockups/retro-post.component.html";

describe("kinetic-text entrance: assemble (the sentence gathers itself)", () => {
  // Frame-checked against the reference at 8.5-9.3s: words pop in SCATTERED
  // around the line's neighbourhood (mostly below, each at its own offset)
  // and converge up into their slots -- not a formation fly-in from the
  // bottom edge, and no swell on the key word (that was an invention; the
  // reference's "volume" leads the EXIT instead).
  const data = { text: "ai allows us to increase our *volume*", entrance: "assemble", at: 0.3, color: "#17171c" };

  it("scatters the words below-and-around, then converges them into the line", async () => {
    const html = await assemble({ data }, "kinetic-text", KT);
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        const tl = (window as any).__MP_TIMELINE;
        const spans = Array.from(document.querySelectorAll(".text-container > span")) as HTMLElement[];
        const rects = () => spans.map((s) => { const b = s.getBoundingClientRect(); return { x: b.left, y: b.top }; });
        tl.pause(0.45);
        const early = rects();
        tl.pause(2.5);
        const late = rects();
        // displacement per word between mid-gather and settled
        const dy = early.map((e, i) => e.y - late[i].y);
        const dx = early.map((e, i) => Math.abs(e.x - late[i].x));
        return { n: spans.length, dy, dx };
      }));
    expect(r.n).toBeGreaterThan(5);
    // Most words start BELOW their slot (positive dy) by a meaningful amount...
    const below = r.dy.filter((d: number) => d > 15).length;
    expect(below, `dy=${r.dy.map((d: number) => d.toFixed(0)).join(",")}`).toBeGreaterThanOrEqual(Math.floor(r.n * 0.6));
    // ...and the offsets are SCATTERED, not uniform: spread across words.
    const spread = Math.max(...r.dy) - Math.min(...r.dy);
    expect(spread, "every word travelled the same distance -- that is a formation, not a gather").toBeGreaterThan(25);
    expect(Math.max(...r.dx), "no horizontal scatter at all").toBeGreaterThan(15);
  }, 300_000);

  it("builds the starred word per-character so the exit can roll it up", async () => {
    const html = await assemble({ data }, "kinetic-text", KT);
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        (window as any).__MP_TIMELINE.pause(2.5);
        const acc = document.querySelector(".text-container .kt-accent") as HTMLElement;
        return { chars: acc.children.length };
      }));
    expect(r.chars).toBeGreaterThanOrEqual("volume".length);
  }, 300_000);
});

describe("kinetic-text exit: smear-up (the starred word leads)", () => {
  it("rolls the accent word's letters up first, then scatters the rest upward", async () => {
    const html = await assemble(
      { data: { text: "ai allows us to increase our *volume*", entrance: "assemble", at: 0.3, exit: "smear-up", exit_at: 3.0 } },
      "kinetic-text", KT);
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        const tl = (window as any).__MP_TIMELINE;
        const acc = document.querySelector(".text-container .kt-accent") as HTMLElement;
        const firstWord = document.querySelector(".text-container > span") as HTMLElement;
        tl.pause(2.6);
        const stand = { acc: acc.getBoundingClientRect().top, first: firstWord.getBoundingClientRect().top };
        tl.pause(3.4);
        // Early in the exit: the accent's FIRST letter has risen while the
        // sentence's first word still stands (the lead).
        const lead = {
          accChar: (acc.children[1] as HTMLElement).getBoundingClientRect().top,
          first: firstWord.getBoundingClientRect().top,
        };
        tl.pause(4.6);
        const goneOp = parseFloat(getComputedStyle(firstWord).opacity);
        return { stand, lead, goneOp };
      }));
    expect(r.lead.accChar, "the accent letters did not lead").toBeLessThan(r.stand.acc - 40);
    expect(Math.abs(r.lead.first - r.stand.first), "the rest left at the same time as the lead").toBeLessThan(20);
    expect(r.goneOp, "the sentence never left").toBeLessThan(0.05);
  }, 300_000);
});

describe("typewriter pretyped: the sentence continues, it does not restart", () => {
  it("shows the prefix from frame one and types only the remainder", async () => {
    const html = await assemble(
      { data: { text: "Writing has always been and continues to be the way.", style: "print",
        pretyped: "Writing has always been", at: 0.4, speed: 30, hold_cursor: false } },
      "typewriter", TW);
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        const tl = (window as any).__MP_TIMELINE;
        const visible = () => Array.from(document.querySelectorAll(".typed-text span"))
          .filter((s) => getComputedStyle(s as HTMLElement).display !== "none").length;
        tl.pause(0.05);
        const atOpen = visible();
        tl.pause(4.5);
        const atEnd = visible();
        return { atOpen, atEnd };
      }));
    expect(r.atOpen).toBe("Writing has always been".length);
    expect(r.atEnd).toBe("Writing has always been and continues to be the way.".length);
  }, 300_000);
});

describe("retro-post: the era flashback carries the same sentence", () => {
  it("continues typing from the pretyped prefix inside the 2008 chrome", async () => {
    const html = await assemble(
      { position: { x: 0, y: 0, width: "100%", height: "100%" },
        data: { text: "Writing has always been and continues to be the way our ideas reach the world.",
          pretyped: "Writing has always been and continues", at: 0.4, speed: 30 } },
      "retro-post", RP);
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        const tl = (window as any).__MP_TIMELINE;
        const visible = () => Array.from(document.querySelectorAll(".rpost-typed span"))
          .filter((s) => getComputedStyle(s as HTMLElement).visibility !== "hidden").length;
        tl.pause(0.05);
        const atOpen = visible();
        tl.pause(4.5);
        const atEnd = visible();
        const bar = document.querySelector(".rpost-bar") as HTMLElement;
        const share = document.querySelector(".rpost-share") as HTMLElement;
        return { atOpen, atEnd, hasChrome: !!bar, shareOp: parseFloat(getComputedStyle(share).opacity) };
      }));
    expect(r.atOpen).toBe("Writing has always been and continues".length);
    expect(r.atEnd).toBeGreaterThan(r.atOpen + 20);
    expect(r.hasChrome).toBe(true);
    expect(r.shareOp, "Share button never appeared").toBeGreaterThan(0.9);
  }, 300_000);
});

describe("prop-strike card:false strikes ink on the surface", () => {
  it("drops the white card chrome", async () => {
    const html = await assemble(
      { data: { text: "delve, tapestry, game changer", at: 0.3, strike_at: 1.2, card: false } },
      "prop-strike", "../src/components/props/prop-strike.component.html");
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        (window as any).__MP_TIMELINE.pause(2);
        const card = document.querySelector(".pstk-card") as HTMLElement;
        const cs = getComputedStyle(card);
        return { bg: cs.backgroundColor, shadow: cs.boxShadow };
      }));
    expect(r.bg).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/);
    expect(r.shadow).toBe("none");
  }, 300_000);
});
