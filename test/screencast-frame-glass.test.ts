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

async function glassCount(data: Record<string, unknown>): Promise<number> {
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
    await page.evaluate(() => { (window as any).__MP_TIMELINE.time(2); });
    expect(errors).toEqual([]);
    return await page.evaluate(() => document.querySelectorAll(".scf-glass").length);
  } finally { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

describe("screencast-frame float: glass", () => {
  it("lays the glass pane by default and drops it with glass:false", async () => {
    const base = { image_url: PNG, frame_style: "plain", presentation: "float", theme: "light" };
    expect(await glassCount(base)).toBe(1);
    expect(await glassCount({ ...base, glass: false })).toBe(0);
  }, 60000);
});
