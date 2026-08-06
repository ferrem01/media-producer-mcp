import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The multiplayer cursor cast (Remotion "Shipper" steal, #57). It is an
// ENHANCEMENT of the existing protagonist hand, not a second component: one
// hand says "someone is doing this", a named cast says "a team is already in
// here". So the contract has two halves -- the cast renders as distinct named
// people, and every scene that only ever passed `path` keeps working.

const W = 960, H = 540, DUR = 4;

async function stage(data: Record<string, unknown>): Promise<string> {
  const src = await fs.readFile(
    path.resolve(__dirname, "../src/components/props/cursor-performer.component.html"), "utf-8");
  return assembleScene({
    scene: {
      id: "s1", label: "cursors", duration_seconds: DUR, background: "#0c0d12",
      components: [{
        id: "cur", type: "cursor-performer",
        position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 90, data,
      }],
    } as any,
    components: [{ type: "cursor-performer", source: src }],
    brandKit: { colors: { background: "#0c0d12", text: "#ffffff" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withScene<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cast-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, html);
  const browser = await chromium.launch({
    ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`file://${htmlPath}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
    return await fn(page);
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const CAST = [
  { name: "Maria", path: [{ at: 0.2, x: "20%", y: "30%" }, { at: 1.6, x: "62%", y: "48%", click: true }] },
  { name: "Adam", color: "#12a594", path: [{ at: 0.2, x: "80%", y: "70%" }, { at: 1.8, x: "40%", y: "35%" }] },
  { name: "Kim", path: [{ at: 0.2, x: "55%", y: "85%" }, { at: 2.0, x: "70%", y: "20%" }] },
];

/** Cursor tips + label text at a given time. */
async function readCursors(page: Page, t: number) {
  return page.evaluate((tt) => {
    (window as any).__MP_TIMELINE.pause(tt);
    return Array.from(document.querySelectorAll(".mp-cursor")).map((c) => {
      const label = c.querySelector(".mp-cursor-label") as HTMLElement | null;
      const cs = getComputedStyle(c as HTMLElement);
      return {
        left: (c as HTMLElement).style.left,
        top: (c as HTMLElement).style.top,
        opacity: Math.round(parseFloat(cs.opacity) * 100) / 100,
        name: label ? label.textContent : null,
        pill: label ? getComputedStyle(label).backgroundColor : null,
        fill: (c.querySelector("path") as SVGPathElement | null)?.getAttribute("fill") || null,
      };
    });
  }, t);
}

describe("cursor-performer: the multiplayer cast", () => {
  it("renders one named, distinctly coloured cursor per cast member", async () => {
    const got = await withScene(await stage({ cast: CAST }), (p) => readCursors(p, 1.0));
    expect(got).toHaveLength(3);
    expect(got.map((c) => c.name)).toEqual(["Maria", "Adam", "Kim"]);
    // A named cast that all looks the same is one cursor with extra steps.
    expect(new Set(got.map((c) => c.fill)).size).toBe(3);
    // An explicit member colour wins over the auto palette.
    expect(got[1].fill).toBe("#12a594");
    // The pill carries the member's colour, so the name reads as theirs.
    expect(got.map((c) => c.pill)).toEqual(got.map(() => expect.any(String)));
    expect(new Set(got.map((c) => c.pill)).size).toBe(3);
  }, 300_000);

  it("moves every member independently and survives seek order", async () => {
    const html = await stage({ cast: CAST });
    const early = await withScene(html, (p) => readCursors(p, 0.3));
    const late = await withScene(html, (p) => readCursors(p, 1.9));
    for (let i = 0; i < 3; i++) {
      expect(`${early[i].left},${early[i].top}`, `member ${i} never moved`)
        .not.toBe(`${late[i].left},${late[i].top}`);
    }
    // Same times, reverse order: the renderer scrubs, it does not play.
    const scrubbed = await withScene(html, async (p) => {
      const l = await readCursors(p, 1.9);
      const e = await readCursors(p, 0.3);
      return { e, l };
    });
    expect(scrubbed.e).toEqual(early);
    expect(scrubbed.l).toEqual(late);
  }, 300_000);

  it("keeps the single protagonist hand exactly as it was", async () => {
    const got = await withScene(
      await stage({ path: [{ at: 0.2, x: "30%", y: "40%" }, { at: 1.5, x: "70%", y: "60%", click: true }] }),
      (p) => readCursors(p, 1.0));
    expect(got).toHaveLength(1);
    // No pill: an unnamed hand is the protagonist, not a person in a room.
    expect(got[0].name).toBeNull();
    expect(got[0].fill).toBe("#1a1a2e");
  }, 300_000);

  it("falls back to one hand rather than nothing when the cast is junk", async () => {
    for (const cast of ["a cast of three", [{ name: "Nobody" }], []]) {
      const got = await withScene(await stage({ cast }), (p) => readCursors(p, 1.0));
      expect(got, JSON.stringify(cast)).toHaveLength(1);
      expect(got[0].opacity).toBeGreaterThan(0);
    }
  }, 300_000);
});
