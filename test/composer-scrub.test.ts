import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SCRUBBING BACK RESTORES THE TRUE PRIOR STATE. Sending a prompt empties the
// composer, and that was a bare tl.call() -- a callback that never un-does
// itself. Crossing it backwards (the Studio scrubber, or a renderer that ever
// steps back) left the composer empty for the rest of the film, under a 1.8x
// zoom, which reads as a blank screen. The fix is the paired boundary: the
// inverse state a hair before the target one.

const W = 1920, H = 1080;

async function load(name: string) {
  return {
    type: name,
    source: await fs.readFile(
      path.resolve(__dirname, `../src/components/mockups/${name}.component.html`), "utf-8"),
  };
}

const CASES = [
  {
    type: "claude-cowork-home",
    selector: '[data-target="input"]',
    text: "Turn this into marketing.",
    script: [
      { action: "type-prompt", at: 0.2, speed: 60, text: "Turn this into marketing." },
      { action: "send-prompt", at: 1.4 },
    ],
  },
  {
    type: "claude-cowork-session",
    selector: '[data-target="input"]',
    text: "Schedule it.",
    script: [
      { action: "type-message", at: 0.2, speed: 60, text: "Schedule it." },
      { action: "send-message", at: 1.4, text: "Schedule it." },
    ],
  },
];

async function composerAcrossSend(browser: Browser, c: (typeof CASES)[number]) {
  const html = await assembleScene({
    scene: {
      id: "s", label: "scrub", duration_seconds: 4, background: "#0f172a",
      components: [{
        id: "c", type: c.type,
        position: { x: "3%", y: "5%", width: "94%", height: "90%" }, z_index: 10,
        data: { script: c.script },
      }],
    } as any,
    components: [await load(c.type)],
    brandKit: { colors: {}, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scrub-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, html);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
    const seek = (t: number) => page.evaluate((x) => {
      const tl = (window as any).__MP_TIMELINE; tl.pause(); tl.time(x);
    }, t);
    const read = () => page.evaluate((sel) => {
      const n = document.querySelector(sel);
      return n ? (n.textContent || "").trim() : "(no composer)";
    }, c.selector);

    await seek(1.2); const typed = await read();
    await seek(1.8); const sent = await read();
    await seek(1.2); const back = await read();   // the scrub back
    return { typed, sent, back };
  } finally {
    await page.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("composer scrub", () => {
  it("puts the typed text back when the playhead crosses the send backwards", async () => {
    const browser = await chromium.launch({
      ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
    });
    try {
      for (const c of CASES) {
        const r = await composerAcrossSend(browser, c);
        expect(r.typed, `${c.type}: the prompt must be typed before the send`).toBe(c.text);
        expect(r.sent, `${c.type}: the composer empties on send`).toBe("");
        expect(r.back, `${c.type}: scrubbing back must restore the typed prompt`).toBe(c.text);
      }
    } finally {
      await browser.close();
    }
  }, 120_000);
});
