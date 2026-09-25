import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

// Float screencast-frame: the frosted glass pane behind the tilted recording
// is optional (Marc: "what is this layer behind the tilted screen?").
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";

async function probe(data: Record<string, unknown>, t = 2): Promise<{ glass: number; edge: string }> {
  const type = "screencast-frame";
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 6, background: "#f4efe1", components: [{ id: "c0", type, position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
    components: [{ type, source: await fs.readFile(path.resolve(__dirname, "../src/components/media/screencast-frame.component.html"), "utf-8") }],
    brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1280, height: 720 } as any, gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scf-"));
  await fs.writeFile(path.join(dir, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + path.join(dir, "s.html"));
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t);
    expect(errors).toEqual([]);
    return await page.evaluate(() => ({ glass: document.querySelectorAll(".scf-glass").length, edge: getComputedStyle(document.querySelector(".scf-frame")!).boxShadow }));
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

describe("screencast-frame float: glass", () => {
  it("lays the glass pane by default and drops it with glass:false", async () => {
    const base = { image_url: PNG, frame_style: "plain", presentation: "float", theme: "light" };
    expect((await probe(base)).glass).toBe(1);
    expect((await probe({ ...base, glass: false })).glass).toBe(0);
  }, 60000);

  it("the light slab edge dims with the screen during a callout, and comes back after", async () => {
    // An undimmed edge under a dimmed screen read as a second screen behind it.
    const data = { image_url: PNG, frame_style: "plain", presentation: "float", theme: "light", glass: false, callouts: [{ at: 0.5, dur: 2, x: 10, y: 10, w: 30, h: 30 }] };
    // Computed color-mix serialises as color(srgb r g b / a) with 0-1 channels, or rgb(); normalise to 0-255.
    const first = (bs: string) => {
      const m = bs.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
      if (m) return [m[1], m[2], m[3]].map((v) => Number(v) * 255);
      return (bs.match(/rgba?\(([^)]+)\)/) || ["", ""])[1].split(",").slice(0, 3).map(Number);
    };
    const before = first((await probe(data, 0.3)).edge);
    const during = first((await probe(data, 2)).edge);
    const after = first((await probe(data, 5.5)).edge);
    expect(during[0]).toBeLessThan(before[0] - 40); // darker while the screen is dimmed
    expect(Math.abs(after[0] - before[0])).toBeLessThan(3); // restored
  }, 90000);
});
