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

describe("kinetic-text entrance: assemble", () => {
  const data = { text: "ai allows us to increase our *volume*", entrance: "assemble", at: 0.3, color: "#17171c" };

  it("flies each word up into a line that is laid out from frame one", async () => {
    const html = await assemble({ data }, "kinetic-text", KT);
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        const tl = (window as any).__MP_TIMELINE;
        const spans = Array.from(document.querySelectorAll(".text-container > span")) as HTMLElement[];
        const first = spans[0], last = spans[spans.length - 1];
        tl.pause(0.35);
        const early = { y: first.getBoundingClientRect().top, op: parseFloat(getComputedStyle(last).opacity) };
        tl.pause(3.2);
        const late = { y: first.getBoundingClientRect().top, op: parseFloat(getComputedStyle(last).opacity) };
        return { count: spans.length, early, late };
      }));
    expect(r.count).toBeGreaterThan(5);
    // First word mid-flight early (below its resting place), settled later.
    expect(r.early.y, "first word never travelled").toBeGreaterThan(r.late.y + 20);
    // Last word still invisible early, standing late.
    expect(r.early.op).toBeLessThan(0.3);
    expect(r.late.op).toBeGreaterThan(0.9);
  }, 300_000);

  it("grows the starred word after the line stands", async () => {
    const html = await assemble({ data }, "kinetic-text", KT);
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        const tl = (window as any).__MP_TIMELINE;
        const acc = document.querySelector(".text-container .kt-accent") as HTMLElement;
        // Before the swell fires (it starts at aAt + words*step + 0.35 ≈ 1.49
        // for this line) but after the word has landed enough to have width.
        tl.pause(1.3);
        const before = acc.getBoundingClientRect().width;
        tl.pause(3.4);
        const after = acc.getBoundingClientRect().width;
        return { before, after };
      }));
    expect(r.after, `accent width ${r.before} -> ${r.after}`).toBeGreaterThan(r.before * 1.12);
  }, 300_000);
});

describe("kinetic-text exit: smear-up", () => {
  it("streams the words out the top, staggered, by the end of the scene", async () => {
    const html = await assemble(
      { data: { text: "but that has come at the cost", entrance: "assemble", at: 0.3, exit: "smear-up", exit_at: 3.4 } },
      "kinetic-text", KT);
    const r = await probe(html, (page) =>
      page.evaluate(() => {
        const tl = (window as any).__MP_TIMELINE;
        const spans = Array.from(document.querySelectorAll(".text-container > span")) as HTMLElement[];
        tl.pause(3.0);
        const standing = spans[0].getBoundingClientRect().top;
        tl.pause(3.7);
        // Mid-smear: the FIRST word has left further than the LAST (stagger).
        const firstMid = spans[0].getBoundingClientRect().top;
        const lastMid = spans[spans.length - 1].getBoundingClientRect().top;
        tl.pause(4.6);
        const goneOp = parseFloat(getComputedStyle(spans[0]).opacity);
        return { standing, firstMid, lastMid, goneOp };
      }));
    expect(r.firstMid, "first word did not rise").toBeLessThan(r.standing - 30);
    expect(r.firstMid, "no stagger between first and last word").toBeLessThan(r.lastMid - 10);
    expect(r.goneOp, "words still visible after the smear").toBeLessThan(0.05);
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
