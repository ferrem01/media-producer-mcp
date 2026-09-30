import { describe, it, expect, afterAll, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// RECAST (core/recast.ts): the speaker take performed by a cast actor. The
// actor tests on Old Chimp settled the route -- Wan "replace" on the real
// recording looked the most real -- and this turns it into the film's take:
// chunked at pauses, redrawn in parallel, stitched back to the take's exact
// length, the voice converted, and the speaker track pointed at it.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-recast-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
process.env.MP_ACTOR_POLL_MS = "20";
const T = "t", P = "proj_recast";

afterAll(async () => { vi.unstubAllGlobals(); delete process.env.FAL_KEY; delete process.env.ELEVENLABS_API_KEY; await fs.rm(DATA, { recursive: true, force: true }); });

const info = async (f: string) => { try { await run("ffmpeg", ["-hide_banner", "-i", f]); return ""; } catch (e: any) { return String(e.stderr || ""); } };
const dur = async (f: string) => { const m = (await info(f)).match(/Duration: (\d+):(\d+):([\d.]+)/)!; return +m[1] * 3600 + +m[2] * 60 + +m[3]; };

describe("recast: a take performed by a cast actor", () => {
  it("cuts the take at its pauses, never longer than a chunk, never leaving a sliver", async () => {
    const { planChunks, CHUNK_MAX } = await import("../src/core/recast.js");
    // Old Chimp's shape: ~32 s, a pause after most sentences.
    const sil: Array<[number, number]> = [[4.7, 5.5], [8.2, 9.6], [13.5, 14.3], [17.9, 18.8], [20.8, 21.4], [25.3, 26.6], [31.0, 31.8]];
    const c = planChunks(31.95, sil);
    expect(c[0][0]).toBe(0);
    expect(c[c.length - 1][1]).toBe(31.95);
    for (let i = 1; i < c.length; i++) expect(c[i][0]).toBe(c[i - 1][1]);   // contiguous
    for (const [a, b] of c.slice(0, -1)) expect(b - a).toBeLessThanOrEqual(CHUNK_MAX + 1e-9);
    // A pause inside the window: the cut lands in its middle.
    expect(planChunks(8, [[3.0, 3.6]])[0]).toEqual([0, 3.3]);
    // No pause that fits: a hard cut at the limit.
    expect(c[0]).toEqual([0, CHUNK_MAX]);
    expect(planChunks(3, [])).toEqual([[0, 3]]);
    const tail = planChunks(8.4, []);                                         // 4 + 4 + 0.4 -> the sliver folds back
    expect(tail).toEqual([[0, 4], [4, 8.4]]);
  });

  it("the cast actor plays every clip; clearing the cast puts the recording back", async () => {
    const { syncSpeakerClips } = await import("../src/core/speaker-layer.js");
    const project: any = {
      scenes: [{ components: [] }, { components: [] }],
      takes: [{ source: "/a/take.mp4", alpha: "/a/take-alpha.webm", scene_index: 0, actors: { roger: { file: "/a/take.actor-roger.mp4" } } },
              { source: "/a/take.mp4", scene_index: 1, actors: { roger: { file: "/a/take.actor-roger.mp4" } } }],
      speaker_track: { clips: [{ source: "/a/take.mp4", alpha: "/a/take-alpha.webm", scene_index: 0 }, { source: "/a/take.mp4", scene_index: 1 }] },
      speaker_cast: "roger",
    };
    syncSpeakerClips(project);
    expect(project.speaker_track.clips.map((c: any) => c.source)).toEqual(["/a/take.actor-roger.mp4", "/a/take.actor-roger.mp4"]);
    expect(project.speaker_track.clips[0].alpha).toBeUndefined(); // the matte's alpha is of the person who recorded
    delete project.speaker_cast;
    syncSpeakerClips(project);
    expect(project.speaker_track.clips.map((c: any) => c.source)).toEqual(["/a/take.mp4", "/a/take.mp4"]);
    expect(project.speaker_track.clips[0].alpha).toBe("/a/take-alpha.webm");
  });

  it("recasts a film end to end: chunks redrawn, stitched to the take's exact length, voice converted, clips pointed", async () => {
    const assets = path.join(DATA, T, "projects", P, "assets");
    await fs.mkdir(assets, { recursive: true });
    // A 7 s take with a pause at 3-4 s: speech, silence, speech.
    const take = path.join(assets, "take-1.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=7",
      "-f", "lavfi", "-i", "sine=frequency=300:duration=7", "-af", "volume='if(between(t,3,4),0,1)':eval=frame",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", take]);
    // Wan returns less than it is given: a 1.5 s clip for every chunk.
    const wanOut = path.join(DATA, "wan.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:s=360x640:r=30:d=1.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", wanOut]);
    const portrait = path.join(DATA, T, "assets", "p.png");
    await fs.mkdir(path.dirname(portrait), { recursive: true });
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=512x768", "-frames:v", "1", portrait]);
    const src = `/assets/${T}/projects/${P}/assets/take-1.mp4`;
    await fs.writeFile(path.join(DATA, T, "projects", P, "project.json"), JSON.stringify({
      project_id: P, tenant_id: T, name: "x", format: "video", status: "generated", canvas: { width: 360, height: 640, fps: 30 },
      scenes: [{ id: "s1", components: [] }, { id: "s2", components: [] }],
      takes: [{ id: "t0", source: src, scene_index: 0 }, { id: "t1", source: src, scene_index: 1 }],
      speaker_track: { clips: [{ source: src, start: 0, scene_index: 0, trim_start: 0, trim_end: 3.5 }, { source: src, start: 0, scene_index: 1, trim_start: 3.5, trim_end: 7 }] },
    }));
    process.env.FAL_KEY = "fk"; process.env.ELEVENLABS_API_KEY = "ek";
    const mp4 = await fs.readFile(wanOut);
    const mp3 = (await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=200:duration=7", "-f", "mp3", "-"], { encoding: "buffer" as any, maxBuffer: 1 << 24 })).stdout as unknown as Buffer;
    let wanCalls = 0, stsCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace") { wanCalls++; return json({ request_id: "r", status_url: "https://q/s", response_url: "https://q/r" }); }
      if (u === "https://q/s") return json({ status: "COMPLETED" });
      if (u === "https://q/r") return json({ video: { url: "https://cdn/w.mp4" } });
      if (u === "https://cdn/w.mp4") return new Response(mp4, { status: 200 });
      if (u.startsWith("https://api.elevenlabs.io/v1/speech-to-speech/roger-voice")) { stsCalls++; return new Response(mp3, { status: 200 }); }
      throw new Error("unexpected fetch " + u);
    }));
    const { addActor, listCast } = await import("../src/core/cast.js");
    const actor = await addActor(T, { name: "Roger guy", image: "assets/p.png", voice_id: "roger-voice", voice_name: "Roger" });
    expect(actor.id).toBe("roger-guy");
    expect((await listCast(T)).map((a) => a.id)).toEqual(["roger-guy"]);
    await expect(fs.access(path.join(DATA, T, "cast", "roger-guy.jpg"))).resolves.toBeUndefined();

    const { startRecast, getRecastStatus } = await import("../src/core/recast.js");
    const st0 = await startRecast(T, P, "roger-guy");
    expect(st0.files).toHaveLength(1); // one take file behind both clips
    let st = st0;
    for (let i = 0; i < 400 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getRecastStatus(T, P))!; }
    expect(st.status, st.error || JSON.stringify(st.files)).toBe("done");
    expect(wanCalls).toBe(2);   // cut at the pause: two chunks
    expect(stsCalls).toBe(1);   // the voice converted once, the whole take
    const out = path.join(assets, "take-1.actor-roger-guy.mp4");
    expect(Math.abs((await dur(out)) - 7)).toBeLessThan(0.1);                   // exactly the take's length
    expect((await info(out))).toMatch(/Video:.*360x640/);                         // at the take's resolution
    expect((await info(out))).toMatch(/Audio:.*stereo/);
    const proj = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8"));
    expect(proj.speaker_cast).toBe("roger-guy");
    expect(proj.speaker_track.clips.map((c: any) => c.source)).toEqual([src.replace(".mp4", ".actor-roger-guy.mp4"), src.replace(".mp4", ".actor-roger-guy.mp4")]);
    expect(proj.speaker_track.clips.map((c: any) => [c.trim_start, c.trim_end])).toEqual([[0, 3.5], [3.5, 7]]); // the timeline untouched
    expect(proj.takes.every((t: any) => t.actors["roger-guy"].voice_id === "roger-voice")).toBe(true);
    await expect(fs.access(path.join(DATA, T, "projects", P, "_work", "recast-roger-guy-0"))).rejects.toThrow(); // pieces cleaned up

    // A second recast as the same actor reuses the file; null puts the recording back.
    const again = await startRecast(T, P, "roger-guy");
    expect(again.files[0].status).toBe("reused");
    for (let i = 0; i < 100 && (await getRecastStatus(T, P))!.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
    expect(wanCalls).toBe(2);
    await startRecast(T, P, null);
    const back = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8"));
    expect(back.speaker_cast).toBeUndefined();
    expect(back.speaker_track.clips.map((c: any) => c.source)).toEqual([src, src]);

    // RESUME (measured: a restart killed a pilot at "8 of 9", its chunks on
    // disk). A second run keeps the finished chunks and collects a request
    // fal already has instead of paying for it again.
    const { recastFile } = await import("../src/core/recast.js");
    const work = path.join(DATA, "resume-work");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url); calls.push(u);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace") return json({ request_id: "n", status_url: "https://q/s-new", response_url: "https://q/r-new" });
      if (u === "https://q/s-old" || u === "https://q/s-new") return json({ status: "COMPLETED" });
      if (u === "https://q/r-old" || u === "https://q/r-new") return json({ video: { url: "https://cdn/w.mp4" } });
      if (u === "https://cdn/w.mp4") return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    // The first run: chunk 0 finished; chunk 1 submitted, then the server died.
    await recastFile({ rawAbs: take, outAbs: path.join(DATA, "first.mp4"), workDir: work, portraitAbs: portrait });
    await fs.rm(path.join(work, "chunk-1.mp4")); await fs.rm(path.join(work, "wan-1.mp4"));
    await fs.writeFile(path.join(work, "wan-1.json"), JSON.stringify({ status_url: "https://q/s-old", response_url: "https://q/r-old" }));
    calls.length = 0;
    await recastFile({ rawAbs: take, outAbs: path.join(DATA, "resumed.mp4"), workDir: work, portraitAbs: portrait });
    expect(calls.filter((c) => c.endsWith("/animate/replace"))).toHaveLength(0); // nothing paid for twice
    expect(calls).toContain("https://q/r-old");                                    // the queued request collected
    expect(Math.abs((await dur(path.join(DATA, "resumed.mp4"))) - 7)).toBeLessThan(0.1);

    // A status left "running" by a dead server reads as interrupted.
    const sf = path.join(DATA, T, "projects", P, "recast.json");
    const cur = JSON.parse(await fs.readFile(sf, "utf8"));
    await fs.writeFile(sf, JSON.stringify({ ...cur, status: "running" }));
    expect((await getRecastStatus(T, P))!.status).toBe("interrupted");
  }, 180000);
});
