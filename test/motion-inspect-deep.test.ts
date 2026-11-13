import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { sampleMotionAt, summarizeMotion, type MotionSamplePoint } from "../src/core/motion-inspect.js";

// get(target='motion') walks each component's subtree to decide whether its
// CONTENT is visible. A fixed depth cap of 6 stopped short of the text in the
// deep product mockups (quotient-email-editor's email is 8 levels down), found only
// a hidden shallow node, and reported a plainly visible editor as NEVER
// VISIBLE. Run the real probe on each deep mockup and require it to be seen.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 1920, H = 1080, DUR = 6;
const TIMES = [0, 1, 2, 3, 4, 5, 5.9];

async function probe(type: string, data: Record<string, unknown> = {}): Promise<MotionSamplePoint[]> {
  const source = await fs.readFile(path.resolve(__dirname, `../src/components/mockups/${type}.component.html`), "utf-8");
  const html = await assembleScene({
    scene: {
      id: "s1", label: "a", duration_seconds: DUR, background: "#f4f4f7",
      components: [{ id: "m", type, position: { x: "4%", y: "6%", width: "92%", height: "88%" }, data }],
    } as any,
    components: [{ type, source }],
    brandKit: { colors: { background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mideep-"));
  const file = path.join(dir, "scene.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    const out: MotionSamplePoint[] = [];
    for (const t of TIMES) {
      const m = (await sampleMotionAt(page, t)).comps.m;
      out.push({ t, opacity: m.opacity, visible: m.visible, rect: m.rect, scale: 1, rotation: 0, glow: 0 });
    }
    return out;
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("motion probe reaches deep mockup content", () => {
  // The live miss: the email editor docked inside the app shell (show_panel
  // false), cut in mid-scene. Without the panel its only content is the email
  // itself, 8 levels below the wrapper -- the old walk saw nothing visible.
  it("quotient-email-editor without its panel, entering at 1 s, is seen after the cut-in", async () => {
    const pts = await probe("quotient-email-editor", { show_panel: false, docked: true, at: 1 });
    expect(pts[0].visible).toBe(false); // before its entrance
    for (const p of pts.filter((p) => p.t >= 3)) {
      expect(p.visible, `at ${p.t}s`).toBe(true);
      expect(p.opacity, `at ${p.t}s`).toBeGreaterThan(0.9);
    }
    expect(summarizeMotion(pts, DUR)).toMatch(/^enters ~/);
  }, 60000);

  for (const type of ["quotient-email-editor", "quotient-app-shell", "quotient-campaign", "claude-desktop"]) {
    it(`${type} is visible after its entrance`, async () => {
      const pts = await probe(type);
      expect(summarizeMotion(pts, DUR)).not.toContain("NEVER VISIBLE");
      // Once in, it stays in: every sample from 2 s on sees the content.
      for (const p of pts.filter((p) => p.t >= 2)) {
        expect(p.visible, `${type} at ${p.t}s`).toBe(true);
        expect(p.opacity, `${type} at ${p.t}s`).toBeGreaterThan(0.9);
      }
    }, 60000);
  }
});
