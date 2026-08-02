import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleScene } from "../src/core/scene-assembler.js";
import { measureLayout } from "../src/core/layout-metrics.js";
import { measureTextContrast } from "../src/core/text-contrast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The Quotient mocks' own chrome was the dominant surviving defect class in
// every assembled film once the auto-fix loop landed (proj_0a31e568,
// proj_de47d492, proj_0b762363): muted labels at 2.59:1, tab labels at 3.5:1,
// panels ghosting at 1-4.5% lightness separation, avatar initials measured
// against the photo that covers them. None of it reachable from scene data.
// These tests boot the REAL components on a light page and run the REAL gates
// -- the same measurements the pipeline stamps quality with.

const W = 1920, H = 1080;
const DUR = 3;

async function assembleMock(type: string, data: Record<string, unknown>): Promise<string> {
  const src = await fs.readFile(
    path.resolve(__dirname, `../src/components/mockups/${type}.component.html`), "utf-8",
  );
  return assembleScene({
    scene: {
      id: "s1", label: "mock", duration_seconds: DUR,
      // A light brand page -- the worst case for a near-white app shell.
      background: "#ffffff",
      components: [{
        id: "m0", type,
        position: { x: "8%", y: "8%", width: "84%", height: "84%" },
        data,
      }],
    } as any,
    components: [{ type, source: src }],
    brandKit: { colors: { background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function gateRun(html: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qml-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, html);
  try {
    const contrast = await measureTextContrast({
      htmlPath, width: W, height: H, atTimes: [DUR * 0.35, DUR * 0.6, DUR * 0.85],
    });
    const layout = await measureLayout({
      htmlPath, width: W, height: H, atTimes: [DUR * 0.45, DUR * 0.7, DUR * 0.9],
    });
    return { contrast, layout };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("quotient mocks pass their own gates on a light page", () => {
  it("quotient-chat: no illegible chrome, no ghost shell", async () => {
    const { contrast, layout } = await gateRun(await assembleMock("quotient-chat", {}));
    // The exact strings that shipped as defects, run after run.
    const flagged = contrast.filter((d) =>
      /Type a message|entities|references/i.test(d.text));
    expect(flagged, JSON.stringify(flagged)).toEqual([]);
    const ghosts = layout.filter((d) => d.type === "invisible_surface" && /qch/.test(d.detail));
    expect(ghosts, JSON.stringify(ghosts)).toEqual([]);
  }, 120_000);

  it("quotient-campaign: tab labels and meta labels are legible", async () => {
    const { contrast, layout } = await gateRun(await assembleMock("quotient-campaign", {}));
    const flagged = contrast.filter((d) =>
      /^(Brief|Tasks|Activation|Deliverables|Chats|Date Range|Owner|to)$/.test(d.text));
    expect(flagged, JSON.stringify(flagged)).toEqual([]);
    const ghosts = layout.filter((d) => d.type === "invisible_surface" && /qcp/.test(d.detail));
    expect(ghosts, JSON.stringify(ghosts)).toEqual([]);
  }, 120_000);

  it("quotient-social: engagement labels legible, initials not measured under the photo", async () => {
    const { contrast, layout } = await gateRun(await assembleMock("quotient-social", {}));
    const flagged = contrast.filter((d) =>
      /^(Likes|Comments|Reposts|Forwards|QA|MF)$|Write a comment/.test(d.text));
    expect(flagged, JSON.stringify(flagged)).toEqual([]);
    const ghosts = layout.filter((d) => d.type === "invisible_surface" && /qsp/.test(d.detail));
    expect(ghosts, JSON.stringify(ghosts)).toEqual([]);
  }, 120_000);
});

describe("the muted palette is arithmetic, not taste", () => {
  it("no AA-failing warm gray survives in the quotient mocks", async () => {
    // The three retired tokens. #9c9a94 measured 2.59:1, #a3a19a 2.3:1,
    // #8b8983 3.5:1 on the mocks' own light surfaces.
    for (const f of ["quotient-chat", "quotient-campaign", "quotient-social", "quotient-app-shell"]) {
      const src = await fs.readFile(
        path.resolve(__dirname, `../src/components/mockups/${f}.component.html`), "utf-8",
      );
      expect(src, `${f} still uses a retired gray`).not.toMatch(/#9c9a94|#a3a19a|#8b8983/i);
    }
  });
});
