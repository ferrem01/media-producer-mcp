import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  probeTake, orientedDims, reframeCrop, reframePad, measureLoudness, sanitizeTake, TAKE_LOUDNESS_TARGET_LUFS, SOFT_LOOK_FILTER,
  gradeTake, softLookFilter, ungradedPathOf, DEFAULT_SOFT_STRENGTH,
} from "../src/core/take-sanitize.js";

const run = promisify(execFile);
const ffmpeg = async (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);

// The camera picture the phone saw: a landscape sensor frame.
const SCENE = "testsrc=size=480x270:rate=30:duration=2";

// A phone booth take as iOS Safari ships it: the landscape sensor frame
// stored on its side in a portrait buffer, a rotation tag that puts it
// upright again, and the voice far too quiet. `sideways` = the transpose
// used to store it; `tag` = the display rotation that undoes it.
async function phoneTake(dir: string, name: string, o: { sideways?: boolean; gainDb?: number; audio?: boolean; scene?: string } = {}): Promise<string> {
  const upright = path.join(dir, `${name}-upright.mp4`);
  const args = ["-y", "-f", "lavfi", "-i", o.scene || SCENE];
  if (o.audio !== false) args.push("-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=2");
  args.push("-map", "0:v");
  if (o.sideways) args.push("-vf", "transpose=2"); // 90 degrees counter-clockwise into a portrait buffer
  if (o.audio !== false) args.push("-map", "1:a", "-af", `volume=${o.gainDb ?? -30}dB`, "-c:a", "aac");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", upright);
  await ffmpeg(args);
  if (!o.sideways) return upright;
  const tagged = path.join(dir, `${name}.mp4`);
  await ffmpeg(["-y", "-display_rotation", "-90", "-i", upright, "-c", "copy", tagged]);
  return tagged;
}

/** Mean absolute pixel difference between one frame of each file (0-255),
 *  after the second is put through `vf`. Decoding honors rotation tags, so
 *  this compares what a player would SHOW. */
async function frameDiff(dir: string, a: string, b: string, vfB?: string): Promise<number> {
  const pa = path.join(dir, "a.rgb"); const pb = path.join(dir, "b.rgb");
  await ffmpeg(["-y", "-ss", "1", "-i", a, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", pa]);
  await ffmpeg(["-y", "-ss", "1", "-i", b, "-frames:v", "1", ...(vfB ? ["-vf", vfB] : []), "-f", "rawvideo", "-pix_fmt", "rgb24", pb]);
  const A = await fs.readFile(pa); const B = await fs.readFile(pb);
  if (A.length !== B.length) return 255;
  let sum = 0; for (let i = 0; i < A.length; i++) sum += Math.abs(A[i] - B[i]);
  return sum / A.length;
}

describe("the take sanitizer", () => {
  let dir: string;
  beforeAll(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "take-sanitize-")); });

  it("reads stored dimensions, rotation tag, audio presence and duration off one ffmpeg call", async () => {
    const p = await probeTake(await phoneTake(dir, "probe", { sideways: true }));
    expect(p.width).toBe(270);
    expect(p.height).toBe(480);
    expect(Math.abs(p.rotation)).toBe(90);
    expect(p.hasAudio).toBe(true);
    expect(p.duration).toBeGreaterThan(1.8);
    expect(orientedDims(p)).toEqual({ width: 480, height: 270 }); // what a player shows
  });

  it("reframes only a take WIDER than the canvas, to the center column at the canvas aspect", () => {
    expect(reframeCrop({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toEqual({ w: 608, h: 1080, x: 656, y: 0 });
    expect(reframeCrop({ width: 1080, height: 1920 }, { width: 1080, height: 1920 })).toBeNull(); // fits
    // A take TALLER than the canvas is pillarboxed, never cropped or zoomed
    // (measured live: a phone take on a 16:9 film came through as a face).
    expect(reframeCrop({ width: 1080, height: 1920 }, { width: 1920, height: 1080 })).toBeNull();
    expect(reframePad({ width: 1080, height: 1920 }, { width: 1920, height: 1080 })).toEqual({ w: 608, h: 1080 });
    expect(reframePad({ width: 1080, height: 1920 }, { width: 1080, height: 1920 })).toBeNull(); // fits
    expect(reframePad({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toBeNull(); // wider: the crop's job
    expect(reframeCrop({ width: 1078, height: 1920 }, { width: 1080, height: 1920 })).toBeNull(); // near enough
    expect(reframeCrop({ width: 1080, height: 1920 }, { width: 1920, height: 1080 })).toBeNull(); // taller: never crop a head off
    expect(reframeCrop({ width: 1920, height: 1080 }, { width: 1920, height: 1080 })).toBeNull();
  });

  it("bakes the honest rotation tag into upright frames, crops to the booth frame, lifts the voice", async () => {
    // What iOS shipped, and the picture it was a sideways encoding of.
    const file = await phoneTake(dir, "ios", { sideways: true, gainDb: -30 });
    const picture = await phoneTake(dir, "picture", { gainDb: -30 });
    const before = await measureLoudness(file);
    expect(before!).toBeLessThan(-25);

    const r = await sanitizeTake(file, { width: 270, height: 480 });
    expect(r.rotation_baked).toBe(-90);
    expect(r.oriented).toEqual({ width: 480, height: 270 });
    expect(r.reframed).toEqual({ from: "480x270", to: "270x480" });
    expect(r.loudness?.measured_lufs).toBeCloseTo(before!, 0);
    expect(r.loudness?.normalized_to_lufs).toBe(TAKE_LOUDNESS_TARGET_LUFS);

    const after = await probeTake(file);
    expect(after.rotation).toBe(0);            // nothing left for a player to apply
    expect([after.width, after.height]).toEqual([270, 480]);
    // The stored pixels are now the upright picture's center column at
    // canvas size -- the frame the phone screen showed the speaker.
    expect(await frameDiff(dir, file, picture, "crop=152:270:164:0,scale=270:480")).toBeLessThan(12);
    const lufs = await measureLoudness(file);
    expect(Math.abs(lufs! - TAKE_LOUDNESS_TARGET_LUFS)).toBeLessThan(1.5);
  });

  it("leaves a take that already matches the canvas alone apart from loudness", async () => {
    const file = await phoneTake(dir, "portrait", { gainDb: -30, scene: "testsrc=size=270x480:rate=30:duration=2" });
    const r = await sanitizeTake(file, { width: 270, height: 480 });
    expect(r.rotation_baked).toBe(0);
    expect(r.reframed).toBeUndefined();
    expect(r.loudness?.normalized_to_lufs).toBe(TAKE_LOUDNESS_TARGET_LUFS);
    expect([r.probe.width, r.probe.height]).toEqual([270, 480]);
  });

  it("does nothing to a clean take: no tag, right frame, voice within tolerance", async () => {
    const file = await phoneTake(dir, "clean", { gainDb: 0, scene: "testsrc=size=270x480:rate=30:duration=2" });
    const clean = await measureLoudness(file);
    const stat = await fs.stat(file);
    const r = await sanitizeTake(file, { width: 270, height: 480 });
    const within = Math.abs(clean! - TAKE_LOUDNESS_TARGET_LUFS) <= 1;
    expect(r.rotation_baked).toBe(0);
    expect(r.reframed).toBeUndefined();
    expect(r.loudness?.normalized_to_lufs == null).toBe(within);
    if (within) expect((await fs.stat(file)).mtimeMs).toBe(stat.mtimeMs);
  });

  it("no longer grades: the soft look is its own pass (gradeTake), off the kept original", async () => {
    const file = await phoneTake(dir, "nograde", { audio: false, scene: "testsrc=size=270x480:rate=30:duration=2" });
    const before = await fs.readFile(file);
    await sanitizeTake(file, { width: 270, height: 480 });
    expect((await fs.readFile(file)).equals(before)).toBe(true); // nothing to fix, nothing graded
  });

  it("grades on a dial from the kept original: up, down, and back to natural", async () => {
    // Marc: "it doesn't entirely look like it was on" -- the base alone was
    // too mild; he picked 0.5 of the smoothing on a side-by-side.
    const file = await phoneTake(dir, "dial", { gainDb: 0, scene: "testsrc2=size=270x480:rate=30:duration=2" });
    const original = await fs.readFile(file);
    expect(softLookFilter(0)).toBe(SOFT_LOOK_FILTER);
    expect(SOFT_LOOK_FILTER).toMatch(/hqdn3d/);
    expect(SOFT_LOOK_FILTER).not.toMatch(/bilateral/);
    expect(softLookFilter(DEFAULT_SOFT_STRENGTH)).toMatch(/hqdn3d.*bilateral=sigmaS=6:sigmaR=0\.06/);
    expect(softLookFilter(0.5, { baseSoft: true })).toBe("bilateral=sigmaS=6:sigmaR=0.06");
    expect(softLookFilter(0.5, { fallback: true })).toMatch(/smartblur/);

    const light = await gradeTake(file, { look: "soft", strength: 0 });
    expect(light.baseSoft).toBe(false);
    expect((await fs.readFile(ungradedPathOf(file))).equals(original)).toBe(true); // the original is kept
    const dLight = await frameDiff(dir, file, ungradedPathOf(file));
    await gradeTake(file, { look: "soft", strength: 1 });
    const dStrong = await frameDiff(dir, file, ungradedPathOf(file));
    expect(dLight).toBeGreaterThan(0.3);
    expect(dStrong).toBeGreaterThan(dLight * 1.5); // the dial turns it up
    await gradeTake(file, { look: "soft", strength: 0 });
    expect(Math.abs((await frameDiff(dir, file, ungradedPathOf(file))) - dLight)).toBeLessThan(0.2); // and down again: from the original, not stacked
    const back = await gradeTake(file, { look: "natural" });
    expect(back.look).toBe("natural");
    expect((await fs.readFile(file)).equals(original)).toBe(true);
    const p = await probeTake(file);
    expect([p.width, p.height, p.hasAudio]).toEqual([270, 480, true]);
  }, 60000);

  it("grades a take whose original is gone over its old base, adding the smoothing only", async () => {
    const file = await phoneTake(dir, "legacy", { gainDb: 0, scene: "testsrc2=size=270x480:rate=30:duration=2" });
    const g = await gradeTake(file, { look: "soft", strength: 0.5, currentLook: "soft" });
    expect(g.baseSoft).toBe(true);
    await expect(fs.stat(`${ungradedPathOf(file)}.soft`)).resolves.toBeTruthy();
    // A later grade still knows (the marker stays with the kept file).
    expect((await gradeTake(file, { look: "soft", strength: 0.2 })).baseSoft).toBe(true);
  }, 60000);

  it("copes with a silent camera-only file: no audio, no normalization, orientation still baked", async () => {
    const file = await phoneTake(dir, "silent", { sideways: true, audio: false });
    const r = await sanitizeTake(file);
    expect(r.rotation_baked).toBe(-90);
    expect(r.loudness).toBeUndefined();
    const after = await probeTake(file);
    expect(after.hasAudio).toBe(false);
    expect(after.rotation).toBe(0);
    expect([after.width, after.height]).toEqual([480, 270]); // no canvas given: upright, unreframed
  });
});

describe("the pillarbox is baked into the take", () => {
  it("the sanitizer pads a tall take to the canvas on a dark field and records the mode", async () => {
    const src = await import("node:fs/promises").then((f) => f.readFile("src/core/take-sanitize.ts", "utf8"));
    expect(src).toMatch(/const pad = canvas && !crop \? reframePad\(oriented, canvas\) : null;/);
    expect(src).toMatch(/pad=\$\{canvas\.width\}:\$\{canvas\.height\}:\(ow-iw\)\/2:\(oh-ih\)\/2:color=\$\{PILLARBOX_COLOR\}/);
    expect(src).toMatch(/mode: "pillarbox" as const/);
  });
});

