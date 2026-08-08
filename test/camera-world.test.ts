import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene, backdropOverscan } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// THE WORLD TRAVELS WITH THE CAMERA -- and in the single-scene render path it
// already did, by accident of DOM shape: the rig adopts .mp-camera whole,
// backdrop included (verified on the golden render: the tooth pattern
// translates across the ribbon pan). Two defects remained. (1) NO OVERSCAN:
// a pan/zoom-out can slide the sheet's edge into frame, masked because the
// exposed canvas matches the paper color, so the texture just silently stops
// (the golden ribbon pan left ~10% of frame bare by the math). (2) The
// COMPOSITE document (Studio preview) lays wrappers flat and parked backdrops
// outside the rig -- so Studio showed a still sheet while the render moved
// it, lying about exactly the thing that makes a move read as camera.
//
// Now a travel-safe surface rides the rig wherever it is, oversized by what
// the scene's moves demand (backdropOverscan), so its edge never enters
// frame; non-travel-safe backdrops keep their current behaviour per path.

const W = 1280, H = 720, DUR = 5;

async function scene(opts: { moves: any[]; backdrop?: string }): Promise<string> {
  const src = await read("../src/components/effects/paper-ground.component.html");
  const mesh = await read("../src/components/effects/mesh-gradient.component.html").catch(() => src);
  const type = opts.backdrop || "paper-ground";
  return assembleScene({
    scene: {
      id: "s1", label: "place", duration_seconds: DUR, background: "#f2efe7",
      camera_moves: opts.moves,
      components: [
        { id: "bg", type, position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 1,
          data: { seed: 7, tone: "#f2efe7", intensity: 0.2 } },
      ],
    } as any,
    components: [{ type: "paper-ground", source: src }, { type: "mesh-gradient", source: mesh }],
    brandKit: { colors: { background: "#f2efe7", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function bgRect(html: string, times: number[]): Promise<Array<{ left: number; width: number; inRig: boolean }>> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "camworld-"));
  const p = path.join(dir, "scene.html");
  await fs.writeFile(p, html);
  const browser = await chromium.launch({
    ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  });
  try {
    const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`file://${p}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
    const out: Array<{ left: number; width: number; inRig: boolean }> = [];
    for (const t of times) {
      out.push(await page.evaluate((tt) => {
        (window as any).__MP_TIMELINE.pause(tt);
        const el = document.querySelector('[data-mp-backdrop]') as HTMLElement;
        const r = el.getBoundingClientRect();
        return { left: r.left, width: r.width, inRig: !!el.closest(".__mp_camera_rig") };
      }, t));
    }
    return out;
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("backdropOverscan", () => {
  it("asks for almost nothing when the camera is zoomed well in", () => {
    const o = backdropOverscan([{ at: 0, type: "zoom", scale: 3, x: 20, y: 47 } as any]);
    expect(o).not.toBeNull();
    expect(o!).toBeLessThan(0.3);
  });

  it("asks for real overscan on a wide pan at moderate zoom", () => {
    const o = backdropOverscan([
      { at: 0, type: "zoom", scale: 1.5, x: 20, y: 50 } as any,
      { at: 0.4, type: "pan", x: 80, y: 50 } as any,
    ]);
    expect(o).not.toBeNull();
    expect(o!).toBeGreaterThan(0.1);
  });

  it("refuses moves it cannot cover instead of showing the void", () => {
    // A 1x 'pan' to the far edge needs more sheet than the cap allows.
    const o = backdropOverscan([{ at: 0, type: "pan", x: 500, y: 50 } as any]);
    expect(o).toBeNull();
  });
});

describe("the paper travels with the camera", () => {
  const MOVES = [
    { at: 0, type: "zoom", scale: 1.6, x: 25, y: 50, duration: 0.01 },
    { at: 0.4, type: "pan", x: 75, y: 50, duration: 3.5, ease: "none" },
  ];

  it("gives the paper overscan beyond what the zoom alone provides", async () => {
    // At zoom 1.6 an unstretched sheet spans exactly W*1.6. Overscan is the
    // part past that -- the slack that keeps the pan from exposing the edge.
    const [a, b] = await bgRect(await scene({ moves: MOVES }), [0.5, 3.8]);
    expect(a.inRig, "paper-ground is not riding the rig").toBe(true);
    expect(a.width, "no overscan beyond the zoom's own footprint").toBeGreaterThan(W * 1.6 * 1.1);
    expect(Math.abs(b.left - a.left), "the paper did not move during the pan").toBeGreaterThan(40);
  }, 300_000);

  it("keeps the frame covered at the far end of the pan", async () => {
    // The unstretched math leaves ~10% of frame bare at pan x:75 -- the
    // silent tooth-stops-here defect. Overscan closes it.
    const rects = await bgRect(await scene({ moves: MOVES }), [0.05, 2.0, 3.9]);
    for (const r of rects) {
      expect(r.left, `left edge entered frame: ${JSON.stringify(r)}`).toBeLessThanOrEqual(0);
      expect(r.left + r.width, `right edge entered frame: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(W);
    }
  }, 300_000);

  it("magnifies the sheet at macro", async () => {
    const [r] = await bgRect(await scene({ moves: [{ at: 0, type: "zoom", scale: 3, x: 30, y: 50, duration: 0.01 }] }), [1]);
    expect(r.inRig).toBe(true);
    expect(r.width).toBeGreaterThan(W * 2.5);
  }, 300_000);

  it("does not stretch a non-travel-safe backdrop", async () => {
    // mesh-gradient rides the rig in this document shape (it always has --
    // the whole .mp-camera is adopted), but only TRAVEL_SAFE surfaces get
    // the overscan treatment. Its footprint stays exactly scale * frame.
    const [r] = await bgRect(await scene({ moves: MOVES, backdrop: "mesh-gradient" }), [0.5]);
    expect(r.width).toBeLessThan(W * 1.6 * 1.05);
    expect(r.width).toBeGreaterThan(W * 1.6 * 0.95);
  }, 300_000);
});
