import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { speak, levelGain, levelFilter, LINE_LOUDNESS_LUFS } from "../src/audio/tts.js";
import { measureLoudness } from "../src/core/take-sanitize.js";

const run = promisify(execFile);

// "The voice volume drops off in the last scene" (Marc, Oct 8, proj_f5c104bb):
// the 2 s closing line came out quieter than the long lines, because a
// single-pass loudnorm rides its gain on a 3 s window. Every line is now
// measured, then given one gain.
describe("voice line level", () => {
  it("gains a line to the target from its measured loudness", () => {
    expect(levelGain(-30)).toBe(LINE_LOUDNESS_LUFS + 30);
    expect(levelGain(null)).toBe(0);
    expect(levelFilter(1.2, 4.5)).toBe("atempo=1.2,volume=4.5dB,alimiter=limit=0.84:level=false");
    expect(levelFilter(1, 2)).not.toContain("atempo");
  });

  it("a short line lands as loud as a long one", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tts-level-"));
    // A speech-like stand-in: pink noise with a syllable-rate swell, read quiet.
    const read = (seconds: number) => async (_t: string, _v: string, out: string) => {
      await run("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i",
        `anoisesrc=d=${seconds}:c=pink:a=0.3,volume='0.5+0.5*sin(2*PI*3*t)':eval=frame,lowpass=4000`,
        "-c:a", "libmp3lame", "-b:a", "192k", out]);
    };
    const short = await speak({ text: "It's free.", out: path.join(dir, "short.mp3"), voice: "brian", speed: 1.2, read: read(2) });
    const long = await speak({ text: "A longer line.", out: path.join(dir, "long.mp3"), voice: "brian", speed: 1.2, read: read(9) });
    const s = await measureLoudness(short);
    const l = await measureLoudness(long);
    expect(s).not.toBeNull();
    expect(l).not.toBeNull();
    expect(Math.abs((s as number) - (l as number))).toBeLessThan(1);
    expect(Math.abs((s as number) - LINE_LOUDNESS_LUFS)).toBeLessThan(2.5);
    await fs.rm(dir, { recursive: true, force: true });
  }, 30000);
});
