import { describe, it, expect } from "vitest";
import { pinnedToFrame } from "../src/core/scene-assembler.js";

// A punch-in on the person moves the person, never the graphics (Marc, Oct 14:
// the 7x stat card and the engine chip zoomed with him).
describe("pinnedToFrame", () => {
  const punchIn = { camera_moves: [{ at: 1, type: "zoom" }] };
  const speaker = { id: "speaker", type: "video", data: { src: "speaker" } };

  it("pins every graphic over the person on a whole-scene move", () => {
    for (const c of [
      { id: "stat", type: "kinetic-text", data: {} },
      { id: "plate", type: "gradient-background", data: {} },
      { id: "chip", type: "sticker-prop", data: {} },
    ]) expect(pinnedToFrame(c, punchIn, true)).toBe(true);
  });

  it("lets the person, the world ground and an anchor-framed component ride", () => {
    expect(pinnedToFrame(speaker, punchIn, true)).toBe(false);
    expect(pinnedToFrame({ id: "g", type: "paper-ground" }, punchIn, true)).toBe(false);
    const framed = { camera_moves: [{ at: 1, type: "zoom", anchor: "chart.peak" }] };
    expect(pinnedToFrame({ id: "chart", type: "bar-chart" }, framed, true)).toBe(false);
    expect(pinnedToFrame({ id: "stat", type: "kinetic-text" }, framed, true)).toBe(true);
  });

  it("changes nothing without the person in the rig, or with only targeted moves", () => {
    const stat = { id: "stat", type: "kinetic-text" };
    expect(pinnedToFrame(stat, punchIn, false)).toBe(false);
    expect(pinnedToFrame(stat, { camera_moves: [{ at: 1, type: "zoom", target: "screencast" }] } as any, true)).toBe(false);
    expect(pinnedToFrame(stat, {}, true)).toBe(false);
    // The frame's own chrome stays pinned everywhere, as before.
    expect(pinnedToFrame({ id: "cap", type: "reel-caption-lane" }, {}, false)).toBe(true);
  });
});

// Measured in the browser: the stat card over the person keeps its box
// through a 1.3x punch-in, and sits where it sits on the same scene without
// a move (the pin layer keeps the overscan container's geometry).
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(HERE, "../src/components");

async function statBoxes(moves: any[] | undefined, times: number[]) {
  const scene = {
    id: "s", label: "s", duration_seconds: 3, background: "#ffffff", transparent_background: true,
    camera_moves: moves,
    components: [
      { id: "speaker", type: "video", data: { src: "speaker", background: "room" }, position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 1 },
      { id: "stat", type: "kinetic-text", data: { text: "~7x", at: 0, exit_at: 99 }, position: { x: "6%", y: "30%", width: "34%", height: "10%" }, z_index: 40 },
    ],
  };
  const html = await assembleScene({ scene: scene as any,
    components: [
      { type: "video", source: await fs.readFile(path.join(LIB, "media/video.component.html"), "utf-8") },
      { type: "kinetic-text", source: await fs.readFile(path.join(LIB, "titles/kinetic-text.component.html"), "utf-8") },
    ],
    speakerUrl: "file:///nonexistent/speaker.mp4",
    brandKit: { colors: { primary: "#393bf5", background: "#ffffff", text: "#17171c" }, fonts: [] } as any,
    canvas: { width: 1080, height: 1920 } as any, gsapDir: path.resolve(HERE, "../vendor/gsap") } as any);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pin-"));
  await fs.writeFile(path.join(tmp, "s.html"), html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.goto(`file://${path.join(tmp, "s.html")}`);
    await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
    const out: Array<{ l: number; t: number; w: number; h: number }> = [];
    for (const t of times) {
      out.push(await page.evaluate((tt) => {
        (window as any).__MP_TIMELINE.time(tt);
        const r = document.querySelector("[data-cid='stat']")!.getBoundingClientRect();
        return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      }, t));
    }
    return out;
  } finally { await browser.close(); await fs.rm(tmp, { recursive: true, force: true }); }
}

describe("a punch-in on the person, in the browser", () => {
  it("holds the stat card still, where it sits without a move", async () => {
    // t=0 on the move-free scene: before its slow ambient drift has moved it.
    const [still] = await statBoxes(undefined, [0]);
    const [before, mid] = await statBoxes([{ at: 0.5, type: "zoom", x: 50, y: 38, scale: 1.3, duration: 0.3 }], [0.2, 1.5]);
    expect(mid).toEqual(before);
    expect(mid).toEqual(still);
  }, 60000);
});
