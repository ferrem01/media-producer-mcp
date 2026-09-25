import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mixAudio, hasAudioStream } from "../src/audio/mixer.js";

const run = promisify(execFile);
const ff = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
async function meanDb(file: string, ss: number, t: number): Promise<number> {
  const r = await run("ffmpeg", ["-hide_banner", "-ss", String(ss), "-t", String(t), "-i", file, "-af", "volumedetect", "-f", "null", "-"]).catch((e) => e);
  const m = /mean_volume: (-?[\d.]+) dB/.exec(String(r.stderr || ""));
  return m ? Number(m[1]) : -120;
}

// A speaker film's composite carries the VOICE as its own audio. The mixer
// built its output from the added tracks alone, so one sound cue (or a music
// bed) replaced the voice: the render had the tick and silence.
describe("the audio mixer", () => {
  it("keeps the video's own sound under the tracks it adds", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mix-voice-"));
    const voiced = path.join(dir, "voiced.mp4"), silent = path.join(dir, "silent.mp4"), tick = path.join(dir, "tick.wav");
    await ff(["-f", "lavfi", "-i", "color=c=gray:s=160x120:d=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", voiced]);
    await ff(["-f", "lavfi", "-i", "color=c=gray:s=160x120:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", silent]);
    await ff(["-f", "lavfi", "-i", "sine=frequency=880:duration=0.2", tick]);
    expect(await hasAudioStream(voiced)).toBe(true);
    expect(await hasAudioStream(silent)).toBe(false);

    const out = path.join(dir, "out.mp4");
    await mixAudio({ videoPath: voiced, outputPath: out, tracks: [{ path: tick, type: "sfx", volume: 0.8, startTime: 1 }], totalDuration: 3 });
    const voice = await meanDb(voiced, 2, 1);
    expect(Math.abs((await meanDb(out, 2, 1)) - voice)).toBeLessThan(1.5); // the voice is still there after the tick
    expect(await meanDb(out, 1, 0.2)).toBeGreaterThan(voice);              // and the tick sits on top

    // A silent picture still mixes (no base layer to add).
    const out2 = path.join(dir, "out2.mp4");
    await mixAudio({ videoPath: silent, outputPath: out2, tracks: [{ path: tick, type: "sfx", volume: 0.8, startTime: 1 }], totalDuration: 3 });
    expect(await meanDb(out2, 1, 0.2)).toBeGreaterThan(-60);
  }, 60000);
});
