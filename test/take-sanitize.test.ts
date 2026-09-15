import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  probeTake, rotationIsSpurious, measureLoudness, sanitizeTake, TAKE_LOUDNESS_TARGET_LUFS,
} from "../src/core/take-sanitize.js";

const run = promisify(execFile);
const ffmpeg = async (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);

// A phone booth take as iOS Safari ships it: frames stored upright in
// portrait, a quarter-turn display matrix on top, the voice far too quiet.
async function phoneTake(dir: string, opts: { rotate?: number; gainDb?: number; audio?: boolean } = {}): Promise<string> {
  const upright = path.join(dir, "upright.mp4");
  const args = ["-y", "-f", "lavfi", "-i", "testsrc=size=270x480:rate=30:duration=2"];
  if (opts.audio !== false) args.push("-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=2");
  args.push("-map", "0:v");
  if (opts.audio !== false) args.push("-map", "1:a", "-af", `volume=${opts.gainDb ?? -30}dB`, "-c:a", "aac");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", upright);
  await ffmpeg(args);
  if (!opts.rotate) return upright;
  const tagged = path.join(dir, "tagged.mp4");
  await ffmpeg(["-y", "-display_rotation", String(opts.rotate), "-i", upright, "-c", "copy", tagged]);
  return tagged;
}

describe("the take sanitizer", () => {
  let dir: string;
  beforeAll(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "take-sanitize-")); });

  it("reads dimensions, rotation tag, audio presence and duration off one ffmpeg call", async () => {
    const p = await probeTake(await phoneTake(dir, { rotate: -90 }));
    expect(p.width).toBe(270);
    expect(p.height).toBe(480);
    expect(Math.abs(p.rotation)).toBe(90);
    expect(p.hasAudio).toBe(true);
    expect(p.duration).toBeGreaterThan(1.8);
  });

  it("calls a quarter-turn tag on a portrait-stored file spurious, and nothing else", () => {
    expect(rotationIsSpurious({ width: 1080, height: 1920, rotation: -90 })).toBe(true);
    expect(rotationIsSpurious({ width: 1080, height: 1920, rotation: 90 })).toBe(true);
    expect(rotationIsSpurious({ width: 1080, height: 1920, rotation: 270 })).toBe(true);
    // A landscape sensor honestly tagged portrait: the tag is the truth.
    expect(rotationIsSpurious({ width: 1920, height: 1080, rotation: 90 })).toBe(false);
    expect(rotationIsSpurious({ width: 1080, height: 1920, rotation: 0 })).toBe(false);
    expect(rotationIsSpurious({ width: 1080, height: 1920, rotation: 180 })).toBe(false);
  });

  it("strips the sideways tag without touching the frames, and lifts the voice to dialogue level", async () => {
    const file = await phoneTake(dir, { rotate: -90, gainDb: -30 });
    const before = await measureLoudness(file);
    expect(before).not.toBeNull();
    expect(before!).toBeLessThan(-25);

    const r = await sanitizeTake(file);
    expect(r.rotation_stripped).toBe(true);
    expect(r.loudness?.measured_lufs).toBeCloseTo(before!, 0);
    expect(r.loudness?.normalized_to_lufs).toBe(TAKE_LOUDNESS_TARGET_LUFS);

    const after = await probeTake(file);
    expect(after.rotation).toBe(0);
    expect(after.width).toBe(270);
    expect(after.height).toBe(480);
    const lufs = await measureLoudness(file);
    expect(Math.abs(lufs! - TAKE_LOUDNESS_TARGET_LUFS)).toBeLessThan(1.5);
  });

  it("leaves a clean take alone", async () => {
    const file = await phoneTake(dir, { gainDb: 0 });
    const clean = await measureLoudness(file);
    const stat = await fs.stat(file);
    // A full-scale sine sits near -16 only by coincidence of the fixture;
    // assert on the decision, not the number.
    const r = await sanitizeTake(file);
    const within = Math.abs(clean! - TAKE_LOUDNESS_TARGET_LUFS) <= 1;
    expect(r.rotation_stripped).toBe(false);
    expect(r.loudness?.normalized_to_lufs == null).toBe(within);
    if (within) expect((await fs.stat(file)).mtimeMs).toBe(stat.mtimeMs);
  });

  it("copes with a silent camera-only file: no audio, no normalization, tag still fixed", async () => {
    const file = await phoneTake(dir, { rotate: 90, audio: false });
    const r = await sanitizeTake(file);
    expect(r.rotation_stripped).toBe(true);
    expect(r.loudness).toBeUndefined();
    expect((await probeTake(file)).hasAudio).toBe(false);
  });
});
