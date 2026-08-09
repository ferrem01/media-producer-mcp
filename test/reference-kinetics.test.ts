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
// golden replication to 100% -- corrected twice against Marc's stills):
// - 8-10s: each word of the claim ENTERS FROM BELOW THE FRAME and climbs up
//   into its slot in reading order, tilted in flight; the starred word lands
//   with its letters wavy and settles. No swell -- that was an invention.
// - 10-11s: the starred word LEADS the exit, letters rolling up in a wave,
//   then the rest of the sentence floats up and out after it.
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
  // Marc's stills of the reference at 8-10s: "the words come in the bottom"
  // -- each word enters from below the frame edge and rides up into its
  // slot, reading order, visible the whole climb. Font-agnostic by
  // construction (spans + transforms; rise measured per word from its own
  // laid-out slot).
  const data = { text: "ai allows us to increase our *volume*", entrance: "assemble", at: 0.3, color: "#17171c" };

  it("climbs each word in from below the frame into its slot", async () => {
    const html = await assemble({ data }, "kinetic-text", KT);
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        const H = 720;
        const tl = (window as any).__MP_TIMELINE;
        const spans = Array.from(document.querySelectorAll(".text-container > span")) as HTMLElement[];
        const tops = () => spans.map((s) => s.getBoundingClientRect().top);
        tl.pause(0.55);
        const early = tops();
        tl.pause(3.0);
        const late = tops();
        return { n: spans.length, H, early, late };
      }));
    expect(r.n).toBeGreaterThan(5);
    // Mid-gather: the first word is airborne INSIDE the frame (left its start,
    // not yet parked) while the last word is still BELOW the frame edge --
    // the conveyor, not a simultaneous pop.
    expect(r.early[0], "first word never entered the frame").toBeLessThan(r.H);
    expect(r.early[0], "first word teleported to its slot").toBeGreaterThan(r.late[0] + 15);
    expect(r.early[r.n - 1], "last word should still be waiting below the frame").toBeGreaterThanOrEqual(r.H - 5);
    // Settled: everything parked at its slot, inside the frame.
    for (const t of r.late) expect(t).toBeLessThan(r.H * 0.8);
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
