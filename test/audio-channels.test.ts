import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { channelLevels, panForLevels, centerDeadChannel, ensureCenteredTake, isTakeAsset } from "../src/audio/channels.js";

// Marc, on an actor test: "my voice seems to be coming from the upper
// left-hand corner." Measured: his lav receiver records mono into the LEFT
// channel, the right one silent -- and the rendered Old Chimp film carried
// it that way (voice left only; the right side held just music and sfx).

const run = promisify(execFile);
const DIR = path.join(os.tmpdir(), `mp-channels-${process.pid}`);
afterAll(async () => { await fs.rm(DIR, { recursive: true, force: true }); });

/** 2s clip: a picture plus a stereo track whose two sides are given as lavfi sources. */
async function clip(name: string, left: string, right: string): Promise<string> {
  await fs.mkdir(DIR, { recursive: true });
  const file = path.join(DIR, name);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30:duration=2",
    "-f", "lavfi", "-i", `${left}`, "-f", "lavfi", "-i", `${right}`,
    "-filter_complex", "[1:a][2:a]amerge=inputs=2[a]", "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
  return file;
}

describe("a voice on one channel plays centered", () => {
  it("measures each channel and centers only a dead one", () => {
    expect(panForLevels([-16.7, -113])).toBe("pan=stereo|c0=c0|c1=c0");
    expect(panForLevels([-Infinity, -18])).toBe("pan=stereo|c0=c1|c1=c1");
    expect(panForLevels([-16, -20])).toBeNull();      // two live channels: a real stereo take
    expect(panForLevels([-90, -95])).toBeNull();      // silence is not one-sided
    expect(panForLevels([-16])).toBeNull();           // mono already plays centered
    expect(panForLevels(null)).toBeNull();
  });

  it("rewrites a left-only take so both sides carry the voice, and leaves a stereo take alone", async () => {
    const left = await clip("left.mp4", "sine=frequency=300:duration=2", "anullsrc=r=48000:cl=mono:d=2");
    const before = (await channelLevels(left))!;
    expect(before[0]).toBeGreaterThan(-30);
    expect(before[1]).toBeLessThan(-60);
    expect(await centerDeadChannel(left)).toBe(true);
    const after = (await channelLevels(left))!;
    expect(after[1]).toBeGreaterThan(-30);
    expect(Math.abs(after[0] - after[1])).toBeLessThan(1);

    const stereo = await clip("stereo.mp4", "sine=frequency=300:duration=2", "sine=frequency=500:duration=2");
    const st = await fs.stat(stereo);
    expect(await centerDeadChannel(stereo)).toBe(false);
    expect((await fs.stat(stereo)).mtimeMs).toBe(st.mtimeMs);
  }, 30000);

  it("Studio's take files are centered on first request (a take recorded before the fix), once", async () => {
    // Marc's marketing lead heard music and sfx in Studio but not his voice:
    // Studio plays the take file itself, and it was left-only.
    expect(isTakeAsset("assets/take-2026-09-25T21-59-11-665Z.mp4")).toBe(true);
    expect(isTakeAsset("assets/.take-2026-09-27T22-04-50-448Z.ungraded.mp4")).toBe(true);
    expect(isTakeAsset("assets/img_1.png")).toBe(false);
    expect(isTakeAsset("assets/../project.json")).toBe(false);
    const take = await clip("take-old.mp4", "sine=frequency=250:duration=2", "anullsrc=r=48000:cl=mono:d=2");
    await Promise.all([ensureCenteredTake(take), ensureCenteredTake(take), ensureCenteredTake(take)]); // concurrent first requests
    const lv = (await channelLevels(take))!;
    expect(lv[1]).toBeGreaterThan(-30);
    const m1 = (await fs.stat(take)).mtimeMs;
    await ensureCenteredTake(take);
    expect((await fs.stat(take)).mtimeMs).toBe(m1);
    const idx = await fs.readFile(path.join(__dirname, "..", "src", "index.ts"), "utf8");
    expect(idx).toMatch(/if \(isTakeAsset\(assetSubPath\)\) await ensureCenteredTake\(fullPath\)/);
  }, 30000);

  it("is wired where a take arrives and where the speaker's voice enters a render", async () => {
    const src = (f: string) => fs.readFile(path.join(__dirname, "..", "src", f), "utf8");
    expect(await src("core/take-sanitize.ts")).toMatch(/const pan = await deadChannelPan\(filePath\);/);
    const base = await src("core/speaker-track.ts");
    expect(base.match(/await centerDeadChannel\(outputPath\)/g)?.length).toBe(2); // single clip and concat paths
  });
});
