import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { buildSpeakerBase, speakerSlots, speakerSceneFilmStarts } from "../src/core/speaker-track.js";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

// PER-SCENE TAKES IN THEIR SLOTS (Marc, proj_b1f4b7cd, Oct 6: "start of scene
// 3 freezes for a second and then the audio scrambles"). The film puts a
// transition between scenes; the takes used to be glued end to end, so the
// voice ran ahead of the film by the transitions' length, and joins where a
// take's sound and picture ended apart jolted.
describe("the speaker base: one take per scene, each in its slot", () => {
  const scenes = [
    { duration_seconds: 2 },
    { duration_seconds: 3, transition_in: { type: "whip-pan", duration_seconds: 0.25 } },
    { duration_seconds: 2, transition_in: { type: "glitch-cut", duration_seconds: 0.2 } },
  ];

  it("gives each take its scene plus the transition after it", () => {
    const total = 7.45;
    expect(speakerSceneFilmStarts(scenes)).toEqual([0, 2.25, 5.45]);
    const slots = speakerSlots([{ scene_index: 0 }, { scene_index: 1 }, { scene_index: 2 }], scenes, total)!;
    expect(slots.map((s) => +s.length.toFixed(2))).toEqual([2.25, 3.2, 2]);
    // A film that opens on a scene with no take: black and silence first.
    expect(speakerSlots([{ scene_index: 1 }, { scene_index: 2 }], scenes, total)).toEqual([{ lead: 2.25, length: 3.2 }, { length: 2 }]);
    // Not one per scene (a continuous track): no slots.
    expect(speakerSlots([{}, {}], scenes, total)).toBeNull();
    expect(speakerSlots([{ scene_index: 0 }], scenes, total)).toBeNull();
  });

  it.skipIf(!hasFfmpeg)("lands every take's voice at its scene's film start, the base exactly the film's length", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slots-"));
    // Seedance-like takes: 24 fps, the sound a little shorter or longer than
    // the picture; a beep 0.5 s into each.
    const takes = [{ v: 2, a: 1.8 }, { v: 3, a: 3.3 }, { v: 2, a: 2 }].map((t, i) => {
      const f = path.join(dir, `take${i}.mp4`);
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", `color=c=gray:s=160x284:r=24:d=${t.v}`,
        "-f", "lavfi", "-i", `aevalsrc='0.5*sin(2*PI*440*t)*between(t,0.5,0.8)':s=44100:d=${t.a}`,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", f]);
      return f;
    });
    const total = 7.45;
    const clips = takes.map((source, i) => ({ source, start: 0, scene_index: i }));
    const out = path.join(dir, "base.mp4");
    await buildSpeakerBase({ speakerTrack: { clips } as any, totalDuration: total, width: 160, height: 284, outputPath: out, workDir: dir,
      slots: speakerSlots(clips, scenes, total)! });
    const err = String(spawnSync("ffmpeg", ["-hide_banner", "-i", out, "-af", "silencedetect=n=-30dB:d=0.1", "-f", "null", "-"], { encoding: "utf8" }).stderr);
    const dur = err.match(/Duration: 00:00:(\d+\.\d+)/);
    expect(Math.abs(Number(dur?.[1]) - total)).toBeLessThan(0.08);
    const beeps = [...err.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
    const want = speakerSceneFilmStarts(scenes).map((s) => s + 0.5);       // 0.5, 2.75, 5.95
    expect(beeps.length).toBeGreaterThanOrEqual(3);
    want.forEach((w, i) => expect(Math.abs(beeps[i] - w)).toBeLessThan(0.06));
    fs.rmSync(dir, { recursive: true, force: true });
  }, 120000);
});

// THE BASE COVERS THE FRAME, as Studio plays it (Oct 26: a 9:16 take in a
// 4:5 LinkedIn copy rendered with black bars beside the person).
describe("the speaker base covers the frame", () => {
  it.skipIf(!hasFfmpeg)("a tall take in a shorter frame fills it edge to edge, no black bars", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-"));
    const take = path.join(dir, "take.mp4");
    // A 9:16 take, bright all over.
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=white:s=180x320:r=24:d=1",
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", take]);
    const clips = [{ source: take, start: 0, scene_index: 0 }, { source: take, start: 0, scene_index: 1 }];
    for (const [i, slots] of [[0, speakerSlots(clips, [{ duration_seconds: 1 }, { duration_seconds: 1 }], 2)], [1, undefined]] as const) {
      const out = path.join(dir, `base${i}.mp4`);
      // 4:5, 160x200: a contained 9:16 picture would leave ~22 px black each side.
      await buildSpeakerBase({ speakerTrack: { clips: slots ? clips : clips.slice(0, 1) } as any, totalDuration: slots ? 2 : 1, width: 160, height: 200, outputPath: out, workDir: dir, ...(slots ? { slots } : {}) });
      const px = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", out, "-frames:v", "1", "-vf", "crop=6:200:0:0", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
      const mean = px.reduce((a, b) => a + b, 0) / px.length;
      expect(mean).toBeGreaterThan(200);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }, 120000);
});
