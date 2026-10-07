import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// TAKE EDITS (core/take-edits.ts). Marc reshot seven per-scene takes and
// wanted 0.3 s off the start of one -- Studio could cut a screencast's
// narration but not a camera take. A take now carries the speaker lane's
// cut list: the window trims, the cuts are baked into copies of every file
// of the take (raw, blur, alpha, recasts -- one clock), the clip points at
// them, and the scene re-times to what is left.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-take-edits-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
const T = "t", P = "proj_takeedit";

afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });

const info = async (f: string) => { try { await run("ffmpeg", ["-hide_banner", "-i", f]); return ""; } catch (e: any) { return String(e.stderr || ""); } };
const dur = async (f: string) => { const m = (await info(f)).match(/Duration: (\d+):(\d+):([\d.]+)/)!; return +m[1] * 3600 + +m[2] * 60 + +m[3]; };

describe("the take clock", () => {
  it("maps the recording through the cuts and back", async () => {
    const { cutClock, sourceClock, keptSeconds, wordsThroughCuts } = await import("../src/core/take-clock.js");
    const cuts = [{ src_start: 2, src_end: 3 }, { src_start: 5, src_end: 5.5 }];
    expect(cutClock(cuts, 1)).toBe(1);
    expect(cutClock(cuts, 2.5)).toBe(2);   // inside a cut: the seam
    expect(cutClock(cuts, 4)).toBe(3);
    expect(cutClock(cuts, 6)).toBe(4.5);
    expect(sourceClock(cuts, 3)).toBe(4);
    expect(sourceClock(cuts, 4.5)).toBe(6);
    expect(keptSeconds({ trim_start: 0.5, trim_end: 6, cuts })).toBe(4);
    const words = [{ text: "a", start: 1, end: 1.4 }, { text: "gone", start: 2.2, end: 2.8 }, { text: "b", start: 3.5, end: 3.9 }];
    expect(wordsThroughCuts(words, cuts)).toEqual([{ text: "a", start: 1, end: 1.4 }, { text: "b", start: 2.5, end: 2.9 }]);
  });

  it("trims and cuts in what plays, merges a cut that touches another, never below half a second", async () => {
    const { trimTake, cutTake, restoreTakeCut } = await import("../src/core/take-edits.js");
    const take: any = { id: "k", scene_index: 0, source: "/x.mp4", recorded_at: "", duration: 8 };
    trimTake(take, 0.3, 0, 8);
    expect([take.trim_start, take.trim_end, take.duration, take.edited]).toEqual([0.3, 8, 7.7, true]);
    cutTake(take, 1, 2);           // scene seconds 1..2 = recording 1.3..2.3
    expect(take.cuts).toEqual([{ src_start: 1.3, src_end: 2.3 }]);
    cutTake(take, 1, 1.5);         // right after the seam: merges
    expect(take.cuts).toEqual([{ src_start: 1.3, src_end: 2.8 }]);
    expect(take.duration).toBe(6.2);
    trimTake(take, -0.3, 0, 8);    // gives the head back
    expect(take.trim_start).toBe(0);
    expect(() => cutTake(take, 0, 6.5)).toThrow(/below/);
    expect(restoreTakeCut(take, 1.3, 2.8)).toBe(1.5);
    expect(take.cuts).toBeUndefined();
    expect(() => trimTake(take, 0, 7.8, 8)).toThrow(/shorter/);
  });
});

describe("editing a scene's take", () => {
  it("trims, cuts every copy of the take onto one clock, points the clip, re-times the scene, and restores", async () => {
    const assets = path.join(DATA, T, "projects", P, "assets");
    await fs.mkdir(assets, { recursive: true });
    const mk = (out: string, extra: string[] = []) => run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x568:rate=30:duration=6",
      "-f", "lavfi", "-i", "sine=frequency=300:duration=6", "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", ...extra, out]);
    await mk(path.join(assets, "take-1.mp4"));
    await mk(path.join(assets, "take-1-blur.mp4"));
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red@0.5:s=320x568:r=30:d=6,format=yuva420p",
      "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-an", path.join(assets, "take-1-alpha.webm")]);
    const A = `/assets/${T}/projects/${P}/assets/`;
    const project = {
      project_id: P, tenant_id: T, name: "Take edits", format: "video", status: "generated",
      canvas: { width: 1080, height: 1920, fps: 30 },
      created_at: "2026-10-02T00:00:00.000Z", updated_at: "2026-10-02T00:00:00.000Z",
      scenes: [{ id: "s1", duration_seconds: 6, components: [] }, { id: "s2", duration_seconds: 4, components: [] }],
      takes: [{ id: "take_1", scene_index: 0, source: A + "take-1.mp4", recorded_at: "", duration: 6, blur: A + "take-1-blur.mp4", alpha: A + "take-1-alpha.webm" }],
      speaker_track: { clips: [{ source: A + "take-1.mp4", alpha: A + "take-1-alpha.webm", scene_index: 0, start: 0 }] },
    };
    await fs.writeFile(path.join(DATA, T, "projects", P, "project.json"), JSON.stringify(project));
    const { editSceneTake } = await import("../src/core/take-edits.js");

    // 0.3 s off the start: only the window moves, no copy is made.
    let r = await editSceneTake(T, P, 0, { op: "trim", head: 0.3 }, DATA);
    let clip: any = r.project.speaker_track!.clips[0];
    expect(clip.source).toBe(A + "take-1.mp4");
    expect([clip.trim_start, clip.trim_end]).toEqual([0.3, 6]);
    expect(r.project.scenes![0].duration_seconds).toBe(5.7);
    expect(r.shortened).toBe(0.3);

    // A cut inside: every file of the take gets a cut copy on one clock.
    r = await editSceneTake(T, P, 0, { op: "cut", from: 2, to: 3 }, DATA);
    const take: any = r.project.takes![0];
    expect(take.cuts).toEqual([{ src_start: 2.3, src_end: 3.3 }]);
    expect(Object.keys(take.cut_files).sort()).toEqual([A + "take-1-alpha.webm", A + "take-1-blur.mp4", A + "take-1.mp4"].sort());
    clip = r.project.speaker_track!.clips[0];
    expect(clip.source).toBe(take.cut_files[A + "take-1.mp4"].file);
    expect(clip.alpha).toBe(take.cut_files[A + "take-1-alpha.webm"].file);
    expect([clip.trim_start, clip.trim_end]).toEqual([0.3, 5]);   // the window on the cut clock
    expect(r.project.scenes![0].duration_seconds).toBe(4.7);
    const local = (u: string) => path.join(DATA, u.replace(/^\/assets\//, ""));
    expect(Math.abs((await dur(local(clip.source))) - 5)).toBeLessThan(0.1);
    expect(Math.abs((await dur(local(take.cut_files[A + "take-1-blur.mp4"].file))) - 5)).toBeLessThan(0.1);
    expect(await info(local(clip.alpha))).toMatch(/alpha_mode\s*:\s*1|yuva420p/);
    expect(r.project.scenes![1].duration_seconds).toBe(4);       // other scenes untouched

    // Restore: back on the original files, the copies gone.
    const cutCopy = local(clip.source);
    r = await editSceneTake(T, P, 0, { op: "restore", src_start: 2.3, src_end: 3.3 }, DATA);
    clip = r.project.speaker_track!.clips[0];
    expect(clip.source).toBe(A + "take-1.mp4");
    expect(clip.alpha).toBe(A + "take-1-alpha.webm");
    expect([clip.trim_start, clip.trim_end]).toEqual([0.3, 6]);
    expect(r.project.scenes![0].duration_seconds).toBe(5.7);
    expect((r.project.takes![0] as any).cut_files).toBeUndefined();
    await expect(fs.access(cutCopy)).rejects.toThrow();

    await expect(editSceneTake(T, P, 1, { op: "trim", head: 0.2 }, DATA)).rejects.toThrow(/no take/);
  });
});

describe("take edits wiring", () => {
  it("Studio and the MCP tool reach the same edit", () => {
    const fsS = require("node:fs") as typeof import("node:fs");
    const read = (p: string) => fsS.readFileSync(path.join(__dirname, "..", p), "utf8");
    const index = read("src/index.ts");
    expect(index).toMatch(/\/api\\\/take-edit\\\//);
    expect(index).toMatch(/editSceneTake\(teTenant, teProject, si/);
    const server = read("src/server.ts");
    expect(server).toMatch(/action: z\.enum\(\["list", "cut", "restore", "look", "trim", "speed"\]\)/);
    expect(server).toMatch(/te\.editSceneTake\(/);
    const studio = read("src/preview-app/preview-app.ts");
    expect(studio).toMatch(/function takeLaneEdges\(/);
    expect(studio).toMatch(/function takePopOpen\(/);
    expect(studio).toMatch(/takeWordCutSelect\(seg, el\)/);
    expect(studio).toMatch(/'\/take-edit\/'/);
  });
});

describe("the speaker lane in Studio (Marc's first pass)", () => {
  const studio = () => (require("node:fs") as typeof import("node:fs")).readFileSync(path.join(__dirname, "..", "src/preview-app/preview-app.ts"), "utf8");
  it("reserves the lane for camera takes from the first paint (no jump when the transcript lands)", () => {
    expect(studio()).toMatch(/\(p\.speaker_track && p\.speaker_track\.clips && p\.speaker_track\.clips\.length\) \|\|/);
    expect(studio()).toMatch(/speakerTrackIsPerScene\(\) && total > 0 && y\.speaker >= 0/);
  });
  it("keeps the take under the words and the waveform; only its edges and seams rise", () => {
    expect(studio()).not.toMatch(/\.spk-clip\.spk-take \{ z-index/);
    expect(studio()).toMatch(/\.spk-clip \.spk-h \{[^}]*z-index: 6/);
  });
  it("re-seeks the speaker exactly after an edit, and re-parks the next take at its new start", () => {
    expect(studio()).toMatch(/state\._takeEditN = \(state\._takeEditN \|\| 0\) \+ 1/);
    expect(studio()).toMatch(/Math\.abs\(curT - cutT\) > \(edited \? 0\.02 : 0\.12\)/);
    expect(studio()).toMatch(/sby\._mpTrim !== nx\.trimStart/);
  });
});

describe("a scene click in Studio shows that scene's take", () => {
  const studio = () => (require("node:fs") as typeof import("node:fs")).readFileSync(path.join(__dirname, "..", "src/preview-app/preview-app.ts"), "utf8");
  it("selectScene syncs the media like a scrub, and a paused speaker shows the exact frame", () => {
    const s = studio();
    const sel = s.slice(s.indexOf("function selectScene(index) {"), s.indexOf("function preloadSceneVideos("));
    expect(sel).toMatch(/state\.forceSync = true;\s*syncMedia\(sceneStart, false\);/);
    expect(s).toMatch(/if \(!playing && el\.paused\) \{/);
    // The load-time seek holds its own element (the loop's `el` moves on).
    expect(s).toMatch(/var spkEl = el;\s*spkEl\._mpSeekOnMeta = spkEl\.src;/);
  });
});
