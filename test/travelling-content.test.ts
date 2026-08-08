import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// A TRAVELLING ELEMENT MUST NOT TRAVEL EMPTY.
//
// wrapperChoreoScript slid the WRAPPER while the component's own timeline was
// added at 0, and every component opens on nothing: sticker-prop holds
// autoAlpha 0 until data.at (0.4) and then throws in over 0.45s, so it is
// first visible at ~0.85 -- a hair AFTER an 0.8s slide has already parked it.
// The entrance was real and invisible. Watched on proj_4cd19f8b: the places
// "may be sliding in from a side, but they're not appearing for a second or
// two, so by the time they appear they've already slid in."
//
// The fix is a HEAD START, not a delay. The component's clock is scrubbed
// across [lead, lead + duration] so its own reveal resolves OFF-FRAME and the
// thing arrives already formed -- the stamp rides in stamped, the type arrives
// part-written and finishes on screen. Same tweenFromTo mechanism SETTLED uses.

const W = 1280, H = 720;

async function scene(comp: Record<string, unknown>, duration = 5, entrance?: string): Promise<string> {
  const src = await read("../src/components/props/sticker-prop.component.html");
  return assembleScene({
    scene: {
      id: "s1", label: "place", duration_seconds: duration, background: "#f2efe7",
      ...(entrance ? { entrance } : {}),
      components: [{
        id: "prop", type: "sticker-prop",
        position: { x: "20%", y: "30%", width: "40%", height: "25%" },
        data: { kind: "pill", text: "ONE BRIEF" },
        ...comp,
      }],
    } as any,
    components: [{ type: "sticker-prop", source: src }],
    brandKit: { colors: { background: "#f2efe7", text: "#17171c", primary: "#393bf5" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

/** Opacity of the prop's own ink (NOT the wrapper) at each time. */
async function inkAt(html: string, times: number[]): Promise<number[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "carry-"));
  const p = path.join(dir, "scene.html");
  await fs.writeFile(p, html);
  const browser = await chromium.launch({
    ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  });
  try {
    const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`file://${p}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
    const out: number[] = [];
    for (const t of times) {
      out.push(await page.evaluate((tt) => {
        (window as any).__MP_TIMELINE.pause(tt);
        const ink = document.querySelector('[data-cid="prop"] .stkp-pill') as HTMLElement | null;
        if (!ink) return -1;
        const cs = getComputedStyle(ink);
        return cs.visibility === "hidden" ? 0 : parseFloat(cs.opacity || "1");
      }, t));
    }
    return out;
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("a component carried by a travelling entrance arrives already formed", () => {
  it("is still blank at the top of the scene with no entrance", async () => {
    // The baseline the bug was made of: nothing on screen for the first beat.
    const [top, later] = await inkAt(await scene({}), [0.05, 3]);
    expect(top, "sticker-prop should open invisible (autoAlpha 0 until data.at)").toBeLessThan(0.05);
    expect(later).toBeGreaterThan(0.9);
  }, 300_000);

  it("is fully visible from the first frame of a slide entrance", async () => {
    const [top, mid, settled] = await inkAt(
      await scene({ enter: { effect: "slide-left", duration: 1 } }), [0.05, 0.5, 3]);
    expect(top, "the element travelled empty -- the whole defect").toBeGreaterThan(0.9);
    expect(mid, "and stays visible for the whole travel").toBeGreaterThan(0.9);
    expect(settled).toBeGreaterThan(0.9);
  }, 300_000);

  it("does the same from the opposite edge", async () => {
    const [top] = await inkAt(await scene({ enter: { effect: "slide-right", duration: 1 } }), [0.05]);
    expect(top).toBeGreaterThan(0.9);
  }, 300_000);

  it("leaves an in-place entrance alone", async () => {
    // fade/rise/pop exist precisely to overlap the component's own reveal.
    // Pre-rolling those would make content pop in fully formed with no reveal
    // at all -- the carry is for entrances that MOVE, and only those.
    const [top] = await inkAt(await scene({ enter: { effect: "fade", duration: 1 } }), [0.05]);
    expect(top, "a fade entrance was pre-rolled and lost its reveal").toBeLessThan(0.05);
  }, 300_000);

  it("does not spend a short scene's tail on the head start", async () => {
    // Under ~2.5s there is nothing to spare, a travelling entrance cannot read
    // anyway, and `settled` already owns the pre-roll on short cuts.
    const [top] = await inkAt(await scene({ enter: { effect: "slide-left", duration: 1 } }, 2), [0.05]);
    expect(top).toBeLessThan(0.05);
  }, 300_000);

  it("un-breaks SETTLED, which was scrubbed and then quietly un-scrubbed", async () => {
    // Same mechanism, same bug: entrance:"settled" plays [2.2, 2.2+duration] of
    // the component's clock so a micro-shot cut lands on standing content, and
    // the orphan-fold had been re-parenting the timeline to the master at 0 --
    // so the cut opened on a mid-entrance frame, exactly what settled exists to
    // prevent. It has been wrong since the pre-roll shipped.
    const [top] = await inkAt(await scene({}, 1.2, "settled"), [0.02]);
    expect(top, "the cut opened mid-entrance").toBeGreaterThan(0.9);
  }, 300_000);

  it("still gives the component the full scene after it lands", async () => {
    // The window is [lead, lead + duration] against a ctx.duration extended by
    // the same lead, so the component's own tail is not clipped off the end.
    const [end] = await inkAt(await scene({ enter: { effect: "slide-left", duration: 1 } }), [4.9]);
    expect(end).toBeGreaterThan(0.9);
  }, 300_000);
});
