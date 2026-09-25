import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";
import { extractAnchors } from "../src/core/word-anchors.js";
import { isSpeakerLayer, speakerBackgroundOf, speakerUsesBase, speakerRendersInside, bindSpeakerLayerData, missingSpeakerCopies } from "../src/core/speaker-layer.js";

// speaker-3d: captions that live in the room with the person (after the
// camera-3d-captions demo Marc sent): a big word BEHIND the head, small words
// in front, a ring around the neck (far arc behind, near arc in front), one
// camera over it all, silhouette wipes. It IS the speaker layer.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src/components/media/speaker-3d.component.html");

const LINES = [
  { at: 0.2, kind: "small", text: "I've learned that people" },
  { at: 1.0, kind: "big", text: "forget", until: 2.4 },
  { at: 2.4, kind: "ring", text: "but they'll never forget" },
  { at: 3.1, kind: "big", text: "feel" },
];

describe("speaker-3d is the speaker layer", () => {
  const comp = { type: "speaker-3d", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data: { src: "speaker", lines: LINES } };
  it("counts as the person, always on alpha, drawn inside the scene (never the base fast path)", () => {
    expect(isSpeakerLayer(comp)).toBe(true);
    expect(speakerBackgroundOf(comp)).toBe("alpha");
    const scene = { components: [comp], duration_seconds: 4 };
    expect(speakerUsesBase(scene)).toBe(false);
    expect(speakerRendersInside(scene)).toBe(true);
  });
  it("gets BOTH copies of the take: the cut-out as src, the raw take as the room", () => {
    const b = bindSpeakerLayerData(comp.data, { url: "/t/raw.mp4", offset: 2, alphaUrl: "/t/alpha.webm", alphaOffset: 2 }, { type: "speaker-3d" })!;
    expect(b.src).toBe("/t/alpha.webm");
    expect(b.alpha).toBe(true);
    expect(b.room_src).toBe("/t/raw.mp4");
    expect(b.room_start_at).toBe(2);
    expect(b.start_at).toBe(2);
  });
  it("still performs before a take exists (a plain video speaker is left out instead)", () => {
    expect(bindSpeakerLayerData(comp.data, null, { type: "speaker-3d" })).not.toBeNull();
    expect(bindSpeakerLayerData({ src: "speaker" }, null)).toBeNull();
  });
  it("asks the matte for the cut-out when the take lands", () => {
    const project = { scenes: [{ components: [comp] }], speaker_track: { clips: [{ source: "/t/raw.mp4", scene_index: 0 }] } };
    expect(missingSpeakerCopies(project as any, { source: "/t/raw.mp4" } as any).alpha).toBe(true);
  });
  it("takes word anchors on every time", () => {
    const c: any = JSON.parse(JSON.stringify({ ...comp, data: { src: "speaker", lines: [{ at: "@learned", kind: "small", text: "x" }, { at: "@forget", until: "@never", kind: "big", text: "forget" }], wipes: [{ at: "@but" }] } }));
    expect(extractAnchors(c)).toBe(4);
  });
});

async function open(data: unknown, speaker: Record<string, unknown>): Promise<{ page: Page; close: () => Promise<void> }> {
  const html = await assembleScene({
    scene: { id: "s", label: "s", duration_seconds: 4, background: "#222",
      components: [{ id: "sp", type: "speaker-3d", position: { x: "0%", y: "0%", width: "100%", height: "100%" }, data }] } as any,
    components: [{ type: "speaker-3d", source: await fs.readFile(SRC, "utf-8") }],
    brandKit: { colors: { primary: "#e8392c", background: "#222222", text: "#ffffff" }, fonts: [] } as any,
    canvas: { width: 1920, height: 1080 } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
    ...speaker,
  } as any);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "s3d-"));
  const file = path.join(dir, "s.html");
  await fs.writeFile(file, html);
  const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`file://${file}`);
  await page.waitForFunction(() => (window as any).__MP_READY === true, undefined, { timeout: 30000 });
  return { page, close: async () => { await browser.close(); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); } };
}

describe("the silhouette: measured while the matte runs, carried to speaker-3d", () => {
  it("keeps the typical edge per row (a hand flung out once does not widen it)", async () => {
    const { silhouetteCollector } = await import("../src/core/take-matte.js");
    const c = silhouetteCollector();
    const w = 100, h = 72;
    for (let f = 0; f < 30; f++) {
      const a = new Uint8Array(w * h);
      for (let y = 18; y < h; y++) for (let x = 40; x < 60; x++) a[y * w + x] = 255;
      if (f === 5) for (let y = 40; y < 44; y++) for (let x = 60; x < 95; x++) a[y * w + x] = 255; // a hand, once
      c.add(a, w, h);
    }
    const p = c.profile()!;
    expect(p.rows.length).toBe(36);
    expect(p.rows[0]).toBeNull();
    expect(p.rows[20]).toEqual([0.4, 0.6]);
  });
  it("syncSpeakerClips stamps the take's silhouette onto the scene's speaker-3d", async () => {
    const { syncSpeakerClips } = await import("../src/core/speaker-layer.js");
    const sil = { rows: [null, [0.4, 0.6]] as Array<[number, number] | null> };
    const project: any = { scenes: [{ components: [{ type: "speaker-3d", data: { src: "speaker" } }] }],
      takes: [{ source: "/t/raw.mp4", alpha: "/t/raw-alpha.webm", scene_index: 0, silhouette: sil }],
      speaker_track: { clips: [{ source: "/t/raw.mp4", scene_index: 0 }] } };
    syncSpeakerClips(project);
    expect(project.scenes[0].components[0].data.silhouette).toEqual(sil);
  });
});

describe("speaker-3d in the browser", () => {
  it("stacks room -> big word -> person cut-out -> small words, and a ring in both halves", async () => {
    const { page, close } = await open({ src: "speaker", lines: LINES, wipes: [{ at: 2.0 }] },
      { speakerUrl: "/nowhere/raw.mp4", speakerOffset: 1.5, speakerAlphaUrl: "/nowhere/alpha.webm", speakerAlphaOffset: 1.5 });
    try {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(1.8); });
      const m = await page.evaluate(() => {
        const q = (s: string) => document.querySelector(s)!;
        const layerOf = (el: Element) => ["s3d-plate", "s3d-back", "s3d-person", "s3d-front", "s3d-wipes"].find((c) => el.closest("." + c));
        const order = [...q(".s3d-root").children].map((c) => c.className);
        const big = [...document.querySelectorAll(".s3d-big")].find((b) => b.textContent === "forget")!;
        const small = document.querySelector(".s3d-small")!;
        return {
          order,
          plateSrc: q(".s3d-plate video")?.getAttribute("src"),
          plateAt: q(".s3d-plate video")?.getAttribute("data-start-at"),
          personSrc: q(".s3d-person video")?.getAttribute("src"),
          bigLayer: layerOf(big), smallLayer: layerOf(small),
          bigW: big.getBoundingClientRect().width,
          bigShown: getComputedStyle(big).visibility !== "hidden" && Number(getComputedStyle(big.firstElementChild!).opacity) > 0.9,
          rings: [...document.querySelectorAll("svg.s3d-ring")].map((s) => layerOf(s)),
          wipeVideo: !!q(".s3d-wipe .s3d-wipe-sil video"),
        };
      });
      expect(m.order).toEqual(["s3d-plate", "s3d-back", "s3d-person", "s3d-front", "s3d-wipes"]);
      expect(m.plateSrc).toContain("raw.mp4");
      expect(m.plateAt).toBe("1.5");
      expect(m.personSrc).toContain("alpha.webm");
      expect(m.bigLayer).toBe("s3d-back");
      expect(m.smallLayer).toBe("s3d-front");
      expect(m.bigShown).toBe(true);
      // Wider than a head: a centred big word the cut-out would hide whole
      // is scaled up (measured: "feel" vanished).
      expect(m.bigW).toBeGreaterThan(1920 * 0.38);
      expect(m.rings.sort()).toEqual(["s3d-back", "s3d-front"]);
      expect(m.wipeVideo).toBe(true);
    } finally { await close(); }
  }, 60000);

  it("performs its captions before a take exists (no videos, words still land)", async () => {
    const { page, close } = await open({ src: "speaker", lines: LINES }, {});
    try {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(3.6); });
      const m = await page.evaluate(() => ({
        videos: document.querySelectorAll("video").length,
        feel: [...document.querySelectorAll(".s3d-big")].some((b) => b.textContent === "feel" && Number(getComputedStyle(b.firstElementChild!).opacity) > 0.9),
      }));
      expect(m.videos).toBe(0);
      expect(m.feel).toBe(true);
    } finally { await close(); }
  }, 60000);

  it("matches the reference's typography: huge centred word, stacked serif small lines, the ring phrase once", async () => {
    // Measured against the camera-3d-captions reference, side by side: the
    // big words were half its size, small lines replaced each other in sans,
    // and the ring repeated its phrase round the whole ellipse.
    const lines = [
      { at: 0.1, kind: "small", text: "I've learned that people", side: "right" },
      { at: 0.6, kind: "big", text: "forget" },
      { at: 0.8, kind: "small", text: "what you said", side: "right" },
      { at: 1.6, kind: "big", text: "forget", side: "right", layer: "front" },
      { at: 1.8, kind: "small", text: "what you did", side: "right" },
      { at: 2.4, kind: "ring", text: "but people will never forget" },
      { at: 3.2, kind: "big", text: "feel", side: "right", layer: "front" },
    ];
    const { page, close } = await open({ src: "speaker", font: "serif", lines }, {});
    try {
      const at = async (t: number) => { await page.evaluate((tt) => { (window as any).__MP_TIMELINE.time(tt); }, t); };
      const shown = (sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => { const cs = getComputedStyle(e); return cs.visibility !== "hidden" && Number(cs.opacity) > 0.5 && Number(getComputedStyle(e.firstElementChild || e).opacity) > 0.5; }).map((e) => e.textContent), sel);
      await at(1.4);
      const m1 = await page.evaluate(() => {
        const big = document.querySelector(".s3d-big")!.getBoundingClientRect();
        const stack = document.querySelector(".s3d-stack")!;
        return { bigW: big.width, rows: stack.querySelectorAll(".s3d-word").length, serif: getComputedStyle(stack.querySelector(".s3d-small")!).fontFamily };
      });
      expect(m1.bigW).toBeGreaterThan(1920 * 0.5);
      expect(m1.rows).toBe(2);
      expect(m1.serif).toMatch(/Georgia|serif/);
      expect(await shown(".s3d-stack .s3d-small")).toEqual(["I'velearnedthatpeople", "whatyousaid"]);
      // A big word landing on the stack's side clears it; the next line opens a new stack.
      await at(2.2);
      expect((await shown(".s3d-stack .s3d-small")).length).toBe(1);
      const side = await page.evaluate(() => { const b = [...document.querySelectorAll(".s3d-big")][1].getBoundingClientRect(); return { r: b.right, l: b.left }; });
      expect(side.r).toBeLessThan(1920);
      // The ring carries its phrase once, italic serif.
      await at(2.9);
      const ring = await page.evaluate(() => { const t = document.querySelector("svg.s3d-ring text")!; return { text: t.textContent, style: t.getAttribute("font-style") }; });
      expect(ring.text).toBe("but people will never forget");
      expect(ring.style).toBe("italic");
      // One hero at a time: the ring is gone once "feel" lands.
      await at(3.8);
      const ringOp = await page.evaluate(() => [...document.querySelectorAll("svg.s3d-ring")].map((s) => Number(getComputedStyle(s).opacity)));
      expect(Math.max(...ringOp)).toBeLessThan(0.05);
    } finally { await close(); }
  }, 60000);

  it("tucks a side word's first letter behind the person's measured edge (behind, not beside)", async () => {
    // Marc, side by side with the reference: "the word feel is behind the
    // person; yours is in front." A side word parked at the frame edge sat
    // clear of her; the reference tucks its first letter behind her.
    const rows: Array<[number, number] | null> = Array.from({ length: 36 }, (_, r) => (r < 4 ? null : [0.36, 0.64]));
    const { page, close } = await open({ src: "speaker", font: "serif", silhouette: { rows }, lines: [{ at: 0.2, kind: "big", text: "feel", side: "right" }] }, {});
    try {
      await page.evaluate(() => { (window as any).__MP_TIMELINE.time(0.9); });
      const m = await page.evaluate(() => {
        const w = document.querySelector(".s3d-big")!;
        const f = w.firstElementChild!.getBoundingClientRect();
        return { layer: w.parentElement!.className, fL: f.left, fR: f.right, right: w.getBoundingClientRect().right };
      });
      expect(m.layer).toBe("s3d-back");
      // The edge (64% of 1920 = 1229) cuts through the first letter.
      expect(m.fL).toBeLessThan(1229);
      expect(m.fR).toBeGreaterThan(1229);
      expect(m.right).toBeLessThan(1920);
    } finally { await close(); }
  }, 60000);

  it("is deterministic (no randomness, no per-frame callbacks)", async () => {
    const src = await fs.readFile(SRC, "utf-8");
    expect(src).not.toMatch(/Math\.random|onUpdate|repeat:\s*-1/);
  });
});
