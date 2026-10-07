import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// THE TAKE'S PACE (Oct 7, Marc: "it seems like I'm not talking fast enough
// ... set it to 1.15x"). A take may play faster than recorded, pitch kept.
// The pace is baked into the edited copies with the cuts (one clock for raw,
// recast and alpha), the clip's window maps onto that clock, and the scene
// re-times so captions and word-timed graphics follow.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-take-speed-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
const T = "t", P = "proj_takespeed";
afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });
const info = async (f: string) => { try { await run("ffmpeg", ["-hide_banner", "-i", f]); return ""; } catch (e: any) { return String(e.stderr || ""); } };
const dur = async (f: string) => { const m = (await info(f)).match(/Duration: (\d+):(\d+):([\d.]+)/)!; return +m[1] * 3600 + +m[2] * 60 + +m[3]; };

describe("the take clock at a pace", () => {
  it("maps the recording through the cuts and the pace, and back", async () => {
    const tc = await import("../src/core/take-clock.js");
    const take = { trim_start: 1, trim_end: 7, cuts: [{ src_start: 3, src_end: 4 }], speed: 1.25 };
    expect(tc.bakes(take)).toBe(true);
    expect(tc.bakes({ speed: 1 })).toBe(false);
    expect(tc.bakes({ speed: 1.15 })).toBe(true);
    expect(tc.playClock(take, 5)).toBe(3.2);                     // (5 - 1 cut) / 1.25
    expect(tc.fromPlayClock(take, 3.2)).toBeCloseTo(5, 3);
    expect(tc.keptSeconds(take)).toBe(4);                        // (6 - 1) / 1.25
    expect(tc.editKey(take)).toMatch(/^[0-9a-f]{10}x1p25$/);
    expect(tc.editKey({ cuts: take.cuts })).toMatch(/^[0-9a-f]{10}$/);
    const w = tc.wordsThroughCuts([{ text: "a", start: 2, end: 2.5 }, { text: "b", start: 3.2, end: 3.6 }, { text: "c", start: 5, end: 5.5 }], take.cuts, 1.25);
    expect(w.map((x) => [x.text, x.start])).toEqual([["a", 1.6], ["c", 3.2]]);
  });
});

describe("pacing a scene's take", () => {
  it("bakes every copy at 1.15x, points the clip, re-times the scene, and goes back to 1x", async () => {
    const assets = path.join(DATA, T, "projects", P, "assets");
    await fs.mkdir(assets, { recursive: true });
    const mk = (out: string) => run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x568:rate=30:duration=6",
      "-f", "lavfi", "-i", "sine=frequency=300:duration=6", "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", out]);
    await mk(path.join(assets, "take-1.mp4"));
    await mk(path.join(assets, "take-1.actor-dana-heygen.mp4"));
    const A = `/assets/${T}/projects/${P}/assets/`;
    await fs.writeFile(path.join(DATA, T, "projects", P, "project.json"), JSON.stringify({
      project_id: P, tenant_id: T, name: "Pace", format: "video", status: "generated", canvas: { width: 1080, height: 1920, fps: 30 },
      created_at: "2026-10-07T00:00:00.000Z", updated_at: "2026-10-07T00:00:00.000Z",
      scenes: [{ id: "s1", duration_seconds: 6, components: [] }],
      storyboard: { scenes: [{ cast: "dana", voiceover_text: "One two three." }] },
      takes: [{ id: "take_1", scene_index: 0, source: A + "take-1.mp4", recorded_at: "", duration: 6, actors: { dana: { file: A + "take-1.actor-dana-heygen.mp4", made_at: "x" } } }],
      speaker_track: { clips: [{ source: A + "take-1.actor-dana-heygen.mp4", scene_index: 0, start: 0 }] },
    }));
    const { editSceneTake } = await import("../src/core/take-edits.js");
    let r = await editSceneTake(T, P, 0, { op: "speed", speed: 1.15 }, DATA);
    const take: any = r.project.takes![0];
    expect(take.speed).toBe(1.15);
    expect(Object.keys(take.cut_files).sort()).toEqual([A + "take-1.actor-dana-heygen.mp4", A + "take-1.mp4"].sort());
    const clip: any = r.project.speaker_track!.clips[0];
    expect(clip.source).toBe(take.cut_files[A + "take-1.actor-dana-heygen.mp4"].file);   // the recast keeps playing, paced
    expect(clip.source).toMatch(/\.cut-[0-9a-f]{10}x1p15\.mp4$/);
    expect(clip.trim_end).toBeCloseTo(6 / 1.15, 2);
    expect(r.seconds).toBeCloseTo(6 / 1.15, 2);
    expect(r.project.scenes![0].duration_seconds).toBeCloseTo(6 / 1.15, 1);
    const local = (u: string) => path.join(DATA, u.replace(/^\/assets\//, ""));
    expect(Math.abs((await dur(local(clip.source))) - 6 / 1.15)).toBeLessThan(0.12);
    expect(await info(local(clip.source))).toMatch(/Audio:/);
    // A trim at a pace is in seconds of what plays.
    r = await editSceneTake(T, P, 0, { op: "trim", head: 0.5 }, DATA);
    expect((r.project.takes![0] as any).trim_start).toBeCloseTo(0.575, 3);
    expect(r.seconds).toBeCloseTo(6 / 1.15 - 0.5, 2);
    // Back to as recorded: the original files, the copies gone.
    const paced = local(r.project.speaker_track!.clips[0].source);
    r = await editSceneTake(T, P, 0, { op: "speed", speed: 1 }, DATA);
    expect((r.project.takes![0] as any).speed).toBeUndefined();
    expect(r.project.speaker_track!.clips[0].source).toBe(A + "take-1.actor-dana-heygen.mp4");
    await expect(fs.access(paced)).rejects.toThrow();
    await expect(editSceneTake(T, P, 0, { op: "speed", speed: 3 }, DATA)).rejects.toThrow(/between/);
  }, 60000);
});
