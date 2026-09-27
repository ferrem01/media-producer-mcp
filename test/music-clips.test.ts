import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mixAudio } from "../src/audio/mixer.js";

const run = promisify(execFile);
const ff = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
async function meanDb(file: string, ss: number, t: number): Promise<number> {
  const r = await run("ffmpeg", ["-hide_banner", "-ss", String(ss), "-t", String(t), "-i", file, "-af", "volumedetect", "-f", "null", "-"]).catch((e) => e);
  const m = /mean_volume: (-?[\d.]+) dB/.exec(String(r.stderr || ""));
  return m ? Number(m[1]) : -120;
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TWO CLIPS OF ONE SONG (the develop. film repeats a bar in its breakdown:
// source 17.9-41.4 s, then 39.4 s on). A track's `duration` plays only that
// much of the source after trim_start; the render honoured trim_start already,
// Studio played every track from 0.
describe("music clips", () => {
  it("a track with duration stops at its clip end; the next clip takes over", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mix-clip-"));
    const silent = path.join(dir, "silent.mp4"), tone = path.join(dir, "tone.wav");
    await ff(["-f", "lavfi", "-i", "color=c=gray:s=160x120:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", silent]);
    await ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=10", tone]);
    const out = path.join(dir, "out.mp4");
    await mixAudio({ videoPath: silent, outputPath: out, totalDuration: 4, tracks: [
      { path: tone, type: "music", volume: 0.8, trimStart: 2, duration: 1 },
    ] });
    expect(await meanDb(out, 0.2, 0.6)).toBeGreaterThan(-40);   // inside the clip
    expect(await meanDb(out, 2.0, 1.5)).toBeLessThan(-60);      // past its end: silence
  }, 60000);

  it("is on the type, every render mix, the audio tool and Studio's player", async () => {
    const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");
    expect(await read("../src/core/types.ts")).toMatch(/duration\?: number;\n  loop\?: boolean;/);
    expect((await read("../src/core/render.ts")).match(/duration: t\.duration,/g)?.length).toBe(3);
    const sv = await read("../src/server.ts");
    expect(sv).toMatch(/duration: z\.number\(\)\.positive\(\)\.optional\(\)/);
    expect(sv).toContain("existing.duration = params.track.duration");
    const st = await read("../src/preview-app/preview-app.ts");
    expect(st).toContain("audio._trimStart = Number(track.trim_start) > 0");
    expect(st).toContain("syncElement(clip, el, trim + local, playing, false);");
  });
});
