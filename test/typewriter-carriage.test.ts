import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The typewriter pre-lays every character as a hidden span and reveals them on
// the timeline (scrub-safe: tl.set, no onUpdate callbacks). Hidden characters
// collapse to zero width, which is what lets the cursor ride the frontier --
// but it also meant the box was sized by the characters revealed SO FAR, so
// the line grew in BOTH directions and every character already typed slid left
// as the next one landed. Measured at 167px of slide on a 20-character line.
// On screen it reads as text shuffling in place, not as a line being typed.
//
// Two things this test has to get right, because the first version of it got
// both wrong and passed a broken component:
//
//  1. MEASURE IN LAYOUT SPACE. Every scene carries a .mp-camera Ken Burns rig
//     (scale 1.03 over the scene), and getBoundingClientRect folds that in.
//     Reading it raw shows ~4px of "growth" per sample on a component that is
//     not moving at all -- the camera, misread as drift. Neutralise the rig.
//
//  2. USE TEXT THAT FITS. When the line is wider than the frame the box is
//     already at max width, centring is a no-op, and the bug cannot reproduce.
//     A test that only ever used a too-long line reports success on a
//     component that slides 167px in real use.

const W = 1280, H = 720, DUR = 6;
const SHORT = "Blog. Social. Email.";            // fits: this is where it drifted
const LONG = "Subject: Your week just got shorter."; // wraps: must not regress

async function scene(text: string, style: string): Promise<string> {
  const src = await fs.readFile(
    path.resolve(__dirname, "../src/components/titles/typewriter.component.html"), "utf-8");
  return assembleScene({
    scene: {
      id: "s1", label: "type", duration_seconds: DUR, background: "#f2efe7",
      components: [{
        id: "t", type: "typewriter",
        position: { x: 0, y: 0, width: "100%", height: "100%" },
        data: { text, style, at: 0.4, speed: 16 },
      }],
    } as any,
    components: [{ type: "typewriter", source: src }],
    brandKit: { colors: { background: "#f2efe7", text: "#17171c", primary: "#393bf5" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withScene<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tw-"));
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

/** Typed-so-far geometry at time t, with the camera rig neutralised. */
async function carriage(page: Page, t: number) {
  return page.evaluate((tt) => {
    (window as any).__MP_TIMELINE.pause(tt);
    const cam = document.querySelector(".mp-camera") as HTMLElement | null;
    const saved = cam ? cam.style.transform : null;
    if (cam) cam.style.transform = "none";
    const shown = Array.from(document.querySelectorAll(".typed-text span"))
      .filter((s) => getComputedStyle(s as HTMLElement).display !== "none");
    const first = shown.length ? shown[0].getBoundingClientRect() : null;
    const last = shown.length ? shown[shown.length - 1].getBoundingClientRect() : null;
    const box = (document.querySelector(".text-area") as HTMLElement).getBoundingClientRect();
    if (cam) cam.style.transform = saved as string;
    return {
      count: shown.length,
      left: first ? first.left : null,
      right: last ? last.right : null,
      boxLeft: box.left, boxWidth: box.width,
    };
  }, t);
}

const SAMPLES = [0.8, 1.1, 1.4, 1.7];

describe("typewriter: the carriage is fixed, the line grows rightward", () => {
  for (const style of ["print", "cli"]) {
    it(`holds its origin on a line that fits (${style})`, async () => {
      const f = await withScene(await scene(SHORT, style), async (p) => {
        const out = [];
        for (const t of SAMPLES) out.push(await carriage(p, t));
        return out;
      });

      // Sanity first: this must be mid-type, or "no drift" proves nothing.
      expect(f[0].count, "nothing had been typed yet at the first sample").toBeGreaterThan(0);
      expect(f[3].count).toBeGreaterThan(f[0].count);
      expect(f[3].count).toBeLessThanOrEqual(SHORT.length);

      const drift = Math.max(...f.map((x) => Math.abs((x.left as number) - (f[0].left as number))));
      expect(drift, `the origin slid ${drift.toFixed(1)}px`).toBeLessThan(2);

      // The reserved box is what holds it: it must not grow either.
      const grew = Math.max(...f.map((x) => Math.abs(x.boxWidth - f[0].boxWidth)));
      expect(grew, `the box grew ${grew.toFixed(1)}px`).toBeLessThan(2);

      // ...and the line genuinely advances, so a line that never grew cannot pass.
      expect((f[3].right as number) - (f[0].right as number)).toBeGreaterThan(100);
    }, 300_000);
  }

  it("keeps the block where the composition put it", async () => {
    // Reserving the width must not shove the type to the frame edge -- a
    // full-width component still centres its line.
    const f = await withScene(await scene(SHORT, "print"), (p) => carriage(p, 1.4));
    const centred = (W - f.boxWidth) / 2;
    expect(Math.abs(f.boxLeft - centred), `box at ${f.boxLeft}, centred would be ${centred}`).toBeLessThan(2);
  }, 300_000);

  it("wraps a long line instead of stretching past the frame", async () => {
    const f = await withScene(await scene(LONG, "print"), (p) => carriage(p, 1.4));
    expect(f.boxWidth).toBeLessThanOrEqual(W);
    expect(f.left as number).toBeGreaterThanOrEqual(0);
  }, 300_000);

  it("still reveals the whole line by the end", async () => {
    const end = await withScene(await scene(SHORT, "print"), (p) => carriage(p, DUR - 0.2));
    expect(end.count).toBe(SHORT.length);
  }, 300_000);
});
