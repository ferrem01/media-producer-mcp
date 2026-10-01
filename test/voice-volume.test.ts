import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mixAudio } from "../src/audio/mixer.js";

const run = promisify(execFile);
const ff = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
async function meanDb(file: string): Promise<number> {
  const r = await run("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"]).catch((e) => e);
  const m = /mean_volume: (-?[\d.]+) dB/.exec(String(r.stderr || ""));
  return m ? Number(m[1]) : -120;
}

// THE VOICE HAS A LEVEL (speaker_track.volume). Marc on the email-signals
// film: "can you lower the volume on the audio a little bit? It's very
// loud." The take is normalised to -16 LUFS and nothing could turn it down:
// not the render (the mix only ran with added tracks, and kept the voice
// untouched), not Studio (its slider reached the audio tracks, never the
// speaker element that carries the voice).
describe("the voice's level", () => {
  it("the mix scales the video's own sound, with no other track to add", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voice-vol-"));
    const voiced = path.join(dir, "voiced.mp4"), out = path.join(dir, "out.mp4");
    await ff(["-f", "lavfi", "-i", "color=c=gray:s=160x120:d=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", voiced]);
    await mixAudio({ videoPath: voiced, outputPath: out, tracks: [], totalDuration: 2, baseVolume: 0.5 });
    const drop = (await meanDb(voiced)) - (await meanDb(out));
    expect(drop).toBeGreaterThan(5);   // 0.5 is about -6 dB
    expect(drop).toBeLessThan(7);
    // At 1 (the default) it is a straight copy.
    const same = path.join(dir, "same.mp4");
    await mixAudio({ videoPath: voiced, outputPath: same, tracks: [], totalDuration: 2 });
    expect(Math.abs((await meanDb(voiced)) - (await meanDb(same)))).toBeLessThan(0.3);
  }, 60000);

  it("the render, the update tool, a take attach and Studio all carry it", async () => {
    const render = await fs.readFile("src/core/render.ts", "utf-8");
    expect(render).toMatch(/\|\| voiceVol !== 1\) \{/);
    expect(render).toMatch(/baseVolume: voiceVol,/);
    const server = await fs.readFile("src/server.ts", "utf-8");
    // {volume} alone keeps the clips (it used to read as "no clips" and clear the track).
    expect(server).toMatch(/if \(st && !st\.clips && vol !== undefined\) \{\s*if \(!project\.speaker_track\) return err/);
    expect(server).toMatch(/const keepVol = vol !== undefined \? vol : project\.speaker_track\?\.volume;/);
    const needs = await fs.readFile("src/core/take-needs.ts", "utf-8");
    expect(needs).toMatch(/project\.speaker_track = \{ \.\.\.project\.speaker_track, clips \};/);
    const studio = await fs.readFile("src/preview-app/preview-app.ts", "utf-8");
    expect(studio).toMatch(/var spkVol = speakerVoiceLevel\(\);/);
    expect(studio).toMatch(/\[els\.speakerBg, els\.speakerBg2\]\.forEach\(function\(v\) \{ if \(v\) \{ try \{ v\.volume = speakerVoiceLevel\(\); \}/);
  });
});
