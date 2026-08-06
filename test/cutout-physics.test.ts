import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SPEC-creative-axes rule 2: an enum value on a creative axis has to be backed
// by machinery. `visual_system.motion: cutout-physics` shipped as prose in the
// director prompt -- the codegen was free to ignore it and nothing measured
// whether it had. These tests are the machinery's contract:
//
//   - elements STEP on a 12fps grid (stop-motion), and the CAMERA does not
//   - inked elements BOIL; the backdrop does not (the paper holds still)
//   - all of it survives arbitrary seek order (the renderer scrubs, and GSAP
//     suppresses callbacks on seek -- the reason stepping is an EASE and the
//     boil is a sequence of zero-duration sets)
//   - a film that did not ask for it gets none of it

const W = 960, H = 540, DUR = 3;

async function sheet(motionPhysics?: "cutout-physics"): Promise<string> {
  const paper = await fs.readFile(
    path.resolve(__dirname, "../src/components/effects/paper-ground.component.html"), "utf-8");
  const text = await fs.readFile(
    path.resolve(__dirname, "../src/components/titles/kinetic-text.component.html"), "utf-8");
  return assembleScene({
    scene: {
      id: "s1", label: "cutout", duration_seconds: DUR, background: "#f2efe7",
      ...(motionPhysics ? { motion_physics: motionPhysics } : {}),
      components: [
        {
          id: "bg", type: "paper-ground",
          position: { x: 0, y: 0, width: "100%", height: "100%" },
          data: { seed: 5, tone: "#f2efe7", intensity: 0.3 },
        },
        {
          id: "hero", type: "kinetic-text",
          position: { x: "10%", y: "35%", width: "80%", height: "30%" },
          data: { text: "ELEVEN INTEGRATIONS", color: "#3b342a" },
          // A wrapper entrance the assembler owns, so the assertion does not
          // depend on any one component's internal choreography.
          enter: { effect: "rise", at: 0, duration: 1.5, ease: "power2.out" },
        },
      ],
    } as any,
    components: [{ type: "paper-ground", source: paper }, { type: "kinetic-text", source: text }],
    brandKit: { colors: { background: "#f2efe7", text: "#3b342a" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function withScene<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cutout-"));
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

/** Seek the master and read the hero wrapper's y plus the camera's matrix. */
async function sample(page: Page, times: number[]) {
  return page.evaluate((ts) => ts.map((t) => {
    (window as any).__MP_TIMELINE.pause(t);
    const hero = document.querySelector('.mp-component[data-cid="hero"]')!;
    const cam = document.querySelector(".mp-camera")!;
    return {
      t,
      heroY: Math.round(((window as any).gsap.getProperty(hero, "y") as number) * 1000) / 1000,
      cam: getComputedStyle(cam).transform,
    };
  }), times);
}

describe("cutout-physics: the physics contract is machinery, not prose", () => {
  it("steps elements onto a 12fps grid while the camera stays smooth", async () => {
    // Frame k spans [k/12, (k+1)/12); sample twice INSIDE frames 4, 5 and 6,
    // clear of the boundaries, so "holds within a frame, moves across one" is
    // a statement about the grid rather than about float luck.
    const rows = await withScene(await sheet("cutout-physics"), (p) =>
      sample(p, [4 / 12 + 0.01, 5 / 12 - 0.01, 5 / 12 + 0.01, 6 / 12 - 0.01, 6 / 12 + 0.01, 7 / 12 - 0.01]));
    const y = rows.map((r) => r.heroY);
    // Within a frame the pose HOLDS; across a frame boundary it moves.
    expect(y[0], JSON.stringify(rows)).toBe(y[1]);
    expect(y[2]).toBe(y[3]);
    expect(y[4]).toBe(y[5]);
    expect(new Set([y[0], y[2], y[4]]).size).toBe(3);
    // The camera is exempt -- a stepped camera reads as dropped frames.
    const cams = rows.map((r) => r.cam);
    expect(new Set(cams).size, `camera stepped: ${JSON.stringify(cams)}`).toBe(cams.length);
  }, 300_000);

  it("does not step a film that never asked for it", async () => {
    const rows = await withScene(await sheet(), (p) =>
      sample(p, [4 / 12 + 0.01, 5 / 12 - 0.01, 5 / 12 + 0.01, 6 / 12 - 0.01]));
    const y = rows.map((r) => r.heroY);
    expect(new Set(y).size, JSON.stringify(rows)).toBe(y.length);
  }, 300_000);

  it("is seek-order independent (the renderer scrubs, it does not play)", async () => {
    const times = [0.30, 0.42, 0.52, 1.1, 2.4];
    const html = await sheet("cutout-physics");
    const fwd = await withScene(html, (p) => sample(p, times));
    const rev = await withScene(html, (p) => sample(p, [...times].reverse()));
    const byTime = new Map(rev.map((r) => [r.t, r]));
    for (const f of fwd) {
      expect(byTime.get(f.t)!.heroY, `t=${f.t}`).toBe(f.heroY);
      expect(byTime.get(f.t)!.cam, `t=${f.t}`).toBe(f.cam);
    }
  }, 300_000);

  it("boils the ink and leaves the paper alone", async () => {
    const got = await withScene(await sheet("cutout-physics"), (p) => p.evaluate(() => ({
      hero: (document.querySelector('.mp-component[data-cid="hero"]') as HTMLElement).style.filter,
      bg: (document.querySelector('.mp-component[data-cid="bg"]') as HTMLElement).style.filter,
      turbulence: document.querySelectorAll("feTurbulence").length,
    })));
    expect(got.hero).toMatch(/url\("?#mp-boil-\d+"?\)/);
    expect(got.bg).not.toMatch(/mp-boil/);
    expect(got.turbulence).toBeGreaterThan(0);
  }, 300_000);

  it("advances the boil seed over the scene, deterministically", async () => {
    const html = await sheet("cutout-physics");
    const read = (p: Page) => p.evaluate(() => [0.1, 0.9, 1.7, 2.6].map((t) => {
      (window as any).__MP_TIMELINE.pause(t);
      return document.querySelector("feTurbulence")!.getAttribute("seed");
    }));
    const a = await withScene(html, read);
    const b = await withScene(html, read);
    expect(new Set(a).size, `seed never advanced: ${JSON.stringify(a)}`).toBeGreaterThan(1);
    expect(b).toEqual(a);
  }, 300_000);
});
