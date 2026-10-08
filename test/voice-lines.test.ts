import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { retimeSoundTracks, sceneWindows } from "../src/core/narration-fit.js";
import { revoiceLine, attachRecordedLine, paceRecordedLine, fitFilmToVoice, lineText } from "../src/core/voice-lines.js";

const run = promisify(execFile);
const tone = (out: string, seconds: number) =>
  run("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=f=220:d=${seconds}`, "-af", "volume=0.2", out]);
const probe = async (f: string) => parseFloat(String((await run("ffprobe", ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", f])).stdout));

function film(): any {
  return {
    project_id: "p", tenant_id: "t", canvas: { width: 1080, height: 1920 },
    scenes: [
      { id: "a", duration_seconds: 4, components: [] },
      { id: "b", duration_seconds: 6, components: [] },
    ],
    audio: { tracks: [
      { id: "vo_scene_0", type: "voiceover", source: "", volume: 0.7, start_time: 0, text: "Line one.", voice: "marc", speed: 1.2 },
      { id: "vo_scene_1", type: "voiceover", source: "", volume: 0.7, start_time: 4, text: "Line two is longer.", voice: "marc", speed: 1.2 },
      { id: "sfx_hit", type: "sfx", source: "x.wav", volume: 0.3, start_time: 5.5 },
    ] },
  };
}

// Marc, Oct 8 (proj_f5c104bb): a voice-only film's lines are edited like a
// take -- pace, re-read, record it yourself -- and the film re-fits.
describe("voice lines", () => {
  it("a sound effect keeps its place in its scene when the scenes re-time", () => {
    const p = film();
    const before = sceneWindows(p);
    p.scenes[0].duration_seconds = 2;
    retimeSoundTracks(p, before);
    expect(p.audio.tracks[2].start_time).toBe(3.5);
  });

  it("re-reads a line at a new pace with the words and voice it was read with, then the film fits it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vl-"));
    const p = film();
    for (const i of [0, 1]) { const f = path.join(dir, `l${i}.mp3`); await tone(f, i ? 3 : 1.5); p.audio.tracks[i].source = f; }
    const calls: any[] = [];
    const fake = (async (o: any) => { calls.push(o); await tone(o.out, 1.2); return o.out; }) as any;
    await revoiceLine(p, 0, { speed: 1.1 }, { tenant: "t", audioDir: dir, speak: fake });
    expect(calls[0]).toMatchObject({ text: "Line one.", voice: "marc", speed: 1.1 });
    expect(p.audio.tracks[0]).toMatchObject({ text: "Line one.", voice: "marc", speed: 1.1 });
    expect(p.scenes[0].audio_hints.voiceover_text).toBe("Line one.");
    const fitted = await fitFilmToVoice(p, dir, dir);
    expect(fitted).not.toBeNull();
    expect(p.scenes[0].duration_seconds).toBeCloseTo(1.2 + 0.45, 1);
    // The second line now starts where scene 1 does, and the hit rides with it.
    expect(p.audio.tracks[1].start_time).toBeCloseTo(p.scenes[0].duration_seconds, 2);
    expect(p.audio.tracks[2].start_time).toBeCloseTo(p.scenes[0].duration_seconds + 1.5, 1);
    await fs.rm(dir, { recursive: true, force: true });
  }, 30000);

  it("a recording becomes the line, keeps the script's words, and re-paces from the recording", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vl-rec-"));
    const p = film();
    const rec = path.join(dir, "rec.wav");
    await tone(rec, 3);
    await attachRecordedLine(p, 1, rec, { audioDir: dir });
    const tr = p.audio.tracks[1];
    expect(tr.take).toBe(rec);
    expect(tr.voice).toBeUndefined();
    expect(lineText(p, 1)).toBe("Line two is longer.");
    expect(await probe(tr.source)).toBeCloseTo(3, 0);
    await paceRecordedLine(p, 1, 1.2, { audioDir: dir });
    expect(tr.speed).toBe(1.2);
    expect(await probe(tr.source)).toBeCloseTo(2.5, 0);
    await fs.rm(dir, { recursive: true, force: true });
  }, 30000);
});
