import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The paper world's PHOTOGRAPHIC TOOTH is the one thing that separates real
// paper from procedural noise -- and its failure mode is silent: a sheet with
// no photo on it still looks like paper, so a tooth that never stamped reads
// as "working" in every screenshot and every gate.
//
// It shipped broken twice. First the world never resolved the tile (the mint
// wrote the PNG but never registered it in brandKit.assets, so `texture_url`
// was simply absent). Then, with the URL wired, the component set `img.src`
// and tested `img.complete` in the SAME tick -- always false for an uncached
// image -- so `stampTooth` never ran. The component now paints the procedural
// sheet immediately and REPAINTS when the photo decodes, and records what
// actually happened in `data-mp-tooth`. These tests read that flag.

const W = 1280, H = 720, DUR = 3;
const TILE = path.resolve(__dirname, "fixtures/paper-tooth-tile.png");

async function sheetHtml(data: Record<string, unknown>): Promise<string> {
  const src = await fs.readFile(
    path.resolve(__dirname, "../src/components/effects/paper-ground.component.html"), "utf-8",
  );
  return assembleScene({
    scene: {
      id: "s1", label: "sheet", duration_seconds: DUR, background: "#f2efe7",
      components: [{
        id: "bg", type: "paper-ground",
        position: { x: 0, y: 0, width: "100%", height: "100%" },
        data,
      }],
    } as any,
    components: [{ type: "paper-ground", source: src }],
    brandKit: { colors: { background: "#f2efe7", text: "#3b342a" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

/** Render the sheet and report what the component says it painted. */
async function toothFlag(data: Record<string, unknown>): Promise<string | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tooth-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, await sheetHtml(data));
  const browser = await chromium.launch({
    ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`file://${htmlPath}`, { waitUntil: "load", timeout: 60_000 });
    // Same bounded image wait the capture path uses before it screenshots.
    await page.evaluate(() => Promise.race([
      Promise.all(Array.from(document.images).map((i) =>
        i.complete ? Promise.resolve() : i.decode().catch(() => undefined))),
      new Promise((r) => setTimeout(r, 3000)),
    ])).catch(() => {});
    return await page.$eval("[data-cid=\"bg\"]", (el) => el.getAttribute("data-mp-tooth"));
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("paper world: photographic tooth", () => {
  it("stamps the tile even though it is not decoded on the first tick", async () => {
    expect(await toothFlag({
      seed: 1855668815, tone: "#f2efe7", intensity: 0.3, texture_url: `file://${TILE}`,
    })).toBe("1");
  }, 300_000);

  it("falls back to the procedural sheet when no tile is given", async () => {
    expect(await toothFlag({ seed: 1855668815, tone: "#f2efe7", intensity: 0.3 })).toBeNull();
  }, 300_000);

  it("falls back rather than blanking when the tile is missing", async () => {
    expect(await toothFlag({
      seed: 1855668815, tone: "#f2efe7", intensity: 0.3,
      texture_url: "file:///nonexistent/paper-tooth-texture.png",
    })).toBe("0");
  }, 300_000);
});
