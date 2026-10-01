import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FOLEY_SET, ensureFoleyLibrary, renderFoley } from "../src/audio/foley.js";
import { normalizeSoundCues, cueStart, sceneSfxTracks, soundForRole, DEFAULT_SFX_PALETTE, SOUND_ROLES } from "../src/core/scene-sfx.js";

// THE SIX JOBS (the viewcci reel, Marc 2026-10-01): FAHHH for attention,
// camera flash for transitions, a metallic riser for tension, right and
// wrong for engagement, a boom for comedy, a bass impact for the payoff --
// "pick two or three and use them the same way every time".
describe("the sound jobs", () => {
  it("every job has a house sound; the found ones ship as CC0 files, the attention shout is made here", async () => {
    for (const role of SOUND_ROLES) {
      const id = DEFAULT_SFX_PALETTE[role].replace(/^house-/, "");
      expect(FOLEY_SET.some((f) => f.id === id), role).toBe(true);
    }
    const found = FOLEY_SET.filter((f) => f.found);
    expect(found.map((f) => f.id).sort()).toEqual(["bass-impact", "boom", "camera-flash", "right", "riser-metal", "wrong"]);
    for (const f of found) {
      expect(f.found!.url).toMatch(/^https:\/\/freesound\.org\/s\/\d+\/$/);
      expect(f.found!.credit).toMatch(/\(CC0\)$/);
      const wav = await fs.readFile(`src/sounds/sfx/${f.id}.wav`);
      // 48 kHz mono 16-bit, and as long as the spec says.
      expect(wav.readUInt32LE(24)).toBe(48000);
      expect(wav.readUInt16LE(22)).toBe(1);
      expect(Math.abs(wav.readUInt32LE(40) / 2 / 48000 - f.duration)).toBeLessThan(0.02);
    }
    // FAHHH: synthesized -- a hiss up front, then a loud voiced vowel.
    const a = renderFoley("attention");
    let peak = 0; for (const x of a) peak = Math.max(peak, Math.abs(x));
    expect(peak).toBeGreaterThan(0.5);
  });

  it("the library mints the found files beside the synthesized ones", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sfx-lib-"));
    const entries = await ensureFoleyLibrary(dir);
    for (const id of ["camera-flash", "riser-metal", "attention"]) {
      expect(entries.some((e) => e.id === id)).toBe(true);
      expect((await fs.stat(path.join(dir, `${id}.wav`))).size).toBeGreaterThan(10000);
    }
    expect(await fs.readFile(path.join(dir, "camera-flash.wav"))).toEqual(await fs.readFile("src/sounds/sfx/camera-flash.wav"));
  });

  it("a job picks the film's sound, the same for every cue; a cue with no job keeps its sound", () => {
    const cues = normalizeSoundCues([{ at: 1, role: "transition" }, { at: 4, role: "transition", id: "ding" }, { at: 2, id: "thud" }]);
    expect(cues.map((c) => c.id)).toEqual(["house-camera-flash", "house-thud", "house-camera-flash"]);
    const mine = normalizeSoundCues([{ at: 1, role: "transition", src: "/assets/x/sfx-camera-flash.wav" }], { transition: "whoosh-fast" });
    expect(mine[0].id).toBe("house-whoosh-fast");
    expect(mine[0].src).toBeUndefined(); // re-pointed: fetch the new sound's file
    expect(soundForRole("payoff", { payoff: "nope" })).toBe("house-bass-impact");
  });

  it("a riser LANDS on its moment: it starts its length before `at`", () => {
    const [r] = normalizeSoundCues([{ at: 6, role: "tension" }]);
    expect(r.lands).toBe(true);
    expect(r.duration).toBeCloseTo(3.98);
    expect(cueStart(r)).toBeCloseTo(2.02);
    expect(cueStart({ at: 1, lands: true, duration: 3.98 })).toBe(0);
    const [hit] = normalizeSoundCues([{ at: 6, role: "payoff" }]);
    expect(hit.lands).toBeUndefined();
    const tracks = sceneSfxTracks({ scenes: [{ duration_seconds: 8, sfx: [{ ...r, src: "/assets/r.wav" }, { ...hit, src: "/assets/h.wav" }] }] } as any, () => 10, (s) => s);
    expect(tracks.map((t) => t.startTime)).toEqual([12.02, 16]);
  });

  it("the writer and the update tool are told the jobs and the two-or-three rule; Studio plays a landing cue early", async () => {
    const sb = await fs.readFile("src/llm/storyboard-builder.ts", "utf-8");
    expect(sb).toMatch(/Pick TWO OR THREE jobs for the whole film and use each the same way every time/);
    expect(sb).toMatch(/role: \{ type: "string", enum: \["attention", "transition", "tension", "payoff", "right", "wrong", "comedy"\]/);
    const server = await fs.readFile("src/server.ts", "utf-8");
    expect(server).toMatch(/role: z\.enum\(\["attention", "transition", "tension", "payoff", "right", "wrong", "comedy"\]\)/);
    const studio = await fs.readFile("src/preview-app/preview-app.ts", "utf-8");
    expect(studio).toMatch(/cue\.lands && Number\(cue\.duration\) > 0 \? Number\(cue\.duration\) : 0/);
    const pkg = await fs.readFile("package.json", "utf-8");
    expect(pkg).toMatch(/cp -r src\/sounds dist\//);
  });
});
