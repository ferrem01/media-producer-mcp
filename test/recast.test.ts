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
process.env.MP_RECAST_INTERP = "blend"; // the fast in-betweens: the look is measured on the server, the plumbing here
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
    // 16 fps chunks of up to 7.5 s: Old Chimp is 6 chunks (was 9), cut in its pauses.
    expect(c.length).toBeLessThanOrEqual(6);
    expect(c[0][1]).toBeCloseTo((4.7 + 5.5) / 2, 5);
    // A pause inside the window: the cut lands in its middle.
    expect(planChunks(9, [[3.0, 3.6]])[0]).toEqual([0, 3.3]);
    // No pause that fits: a hard cut at the limit.
    expect(planChunks(12, [])[0]).toEqual([0, CHUNK_MAX]);
    expect(planChunks(3, [])).toEqual([[0, 3]]);
    expect(planChunks(15.4, [])).toEqual([[0, 7.5], [7.5, 15.4]]);          // the sliver folds back
    expect(planChunks(8.4, [])).toEqual([[0, 7.5], [7.5, 8.4]]);            // unless that would overrun a call
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
    // A 12 s take with a pause at 5-6 s: speech, silence, speech.
    const take = path.join(assets, "take-1.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=12",
      "-f", "lavfi", "-i", "sine=frequency=300:duration=12", "-af", "volume='if(between(t,5,6),0,1)':eval=frame",
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
      speaker_track: { clips: [{ source: src, start: 0, scene_index: 0, trim_start: 0, trim_end: 5.5 }, { source: src, start: 0, scene_index: 1, trim_start: 5.5, trim_end: 12 }] },
    }));
    process.env.FAL_KEY = "fk"; process.env.ELEVENLABS_API_KEY = "ek";
    const mp4 = await fs.readFile(wanOut);
    const mp3 = (await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=200:duration=12", "-f", "mp3", "-"], { encoding: "buffer" as any, maxBuffer: 1 << 24 })).stdout as unknown as Buffer;
    let wanCalls = 0, stsCalls = 0; const seeds: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace") { wanCalls++; seeds.push(JSON.parse(init.body).seed); return json({ request_id: "r", status_url: "https://q/s", response_url: "https://q/r" }); }
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
    for (let i = 0; i < 1200 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getRecastStatus(T, P))!; }
    expect(st.status, st.error || JSON.stringify(st.files)).toBe("done");
    expect(wanCalls).toBe(3);   // the reference pass + two chunks (cut at the pause)
    expect(new Set(seeds).size).toBe(1); // one seed for every call of the take
    expect(seeds[0]).toBeTypeOf("number");
    expect(stsCalls).toBe(1);   // the voice converted once, the whole take
    const out = path.join(assets, "take-1.actor-roger-guy.mp4");
    expect(Math.abs((await dur(out)) - 12)).toBeLessThan(0.1);                  // exactly the take's length
    expect((await info(out))).toMatch(/, 30 fps,/);                               // interpolated back from Wan's 16
    expect((await info(out))).toMatch(/Video:.*360x640/);                         // at the take's resolution
    expect((await info(out))).toMatch(/Audio:.*stereo/);
    const proj = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8"));
    expect(proj.speaker_cast).toBe("roger-guy");
    expect(proj.speaker_track.clips.map((c: any) => c.source)).toEqual([src.replace(".mp4", ".actor-roger-guy.mp4"), src.replace(".mp4", ".actor-roger-guy.mp4")]);
    expect(proj.speaker_track.clips.map((c: any) => [c.trim_start, c.trim_end])).toEqual([[0, 5.5], [5.5, 12]]); // the timeline untouched
    expect(proj.takes.every((t: any) => t.actors["roger-guy"].voice_id === "roger-voice")).toBe(true);
    await expect(fs.access(path.join(DATA, T, "projects", P, "_work", "recast-roger-guy-0"))).rejects.toThrow(); // pieces cleaned up

    // A second recast as the same actor reuses the file; null puts the recording back.
    const again = await startRecast(T, P, "roger-guy");
    expect(again.files[0].status).toBe("reused");
    for (let i = 0; i < 100 && (await getRecastStatus(T, P))!.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
    expect(wanCalls).toBe(3);
    const freshSt = await startRecast(T, P, "roger-guy", { fresh: true });
    expect(freshSt.files[0].status).toBe("running");                    // fresh: made again
    for (let i = 0; i < 1200 && (await getRecastStatus(T, P))!.status === "running"; i++) await new Promise((r) => setTimeout(r, 100));
    wanCalls = 3;
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
    await recastFile({ rawAbs: take, outAbs: path.join(DATA, "first.mp4"), workDir: work, portraitAbs: portrait, interpolate: "blend" });
    await fs.rm(path.join(work, "chunk-1.mp4")); await fs.rm(path.join(work, "wan-1.mp4"));
    await fs.writeFile(path.join(work, "wan-1.json"), JSON.stringify({ status_url: "https://q/s-old", response_url: "https://q/r-old" }));
    calls.length = 0;
    await recastFile({ rawAbs: take, outAbs: path.join(DATA, "resumed.mp4"), workDir: work, portraitAbs: portrait, interpolate: "blend" });
    expect(calls.filter((c) => c.endsWith("/animate/replace"))).toHaveLength(0); // nothing paid for twice
    expect(calls).toContain("https://q/r-old");                                    // the queued request collected
    expect(Math.abs((await dur(path.join(DATA, "resumed.mp4"))) - 12)).toBeLessThan(0.1);

    // PREVIEW: the finished chunks stitched while one is still out.
    const projWork = path.join(DATA, T, "projects", P, "_work", "recast-roger-guy-0");
    await fs.mkdir(projWork, { recursive: true });
    await fs.cp(work, projWork, { recursive: true });
    await fs.rm(path.join(projWork, "chunk-1.mp4"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).startsWith("https://api.elevenlabs.io/v1/speech-to-speech/roger-voice")) return new Response(mp3, { status: 200 });
      throw new Error("unexpected fetch " + url);
    }));
    const { previewRecast } = await import("../src/core/recast.js");
    const pv = await previewRecast(T, P, "roger-guy");
    expect(pv).toMatchObject({ chunks: 1, of: 2, file: "recast-preview-roger-guy.mp4" });
    expect(Math.abs((await dur(path.join(DATA, T, "projects", P, "output", pv.file))) - pv.seconds)).toBeLessThan(0.1);
    expect(pv.seconds).toBeCloseTo(5.5, 0);

    // A status left "running" by a dead server reads as interrupted.
    const sf = path.join(DATA, T, "projects", P, "recast.json");
    const cur = JSON.parse(await fs.readFile(sf, "utf8"));
    await fs.writeFile(sf, JSON.stringify({ ...cur, status: "running" }));
    expect((await getRecastStatus(T, P))!.status).toBe("interrupted");
  }, 180000);
});

describe("recast with a HeyGen look: one call, HeyGen draws the whole performance", () => {
  it("casts a look, sends the take's audio once, fits the video to the take, points the clips, and resumes a submitted video", async () => {
    const P2 = "proj_recast_hg";
    const assets = path.join(DATA, T, "projects", P2, "assets");
    await fs.mkdir(assets, { recursive: true });
    const take = path.join(assets, "take-1.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=6",
      "-f", "lavfi", "-i", "sine=frequency=300:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", take]);
    // HeyGen returns a landscape clip a little short of the take: covered and held.
    const hgOut = path.join(DATA, "hg.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:s=640x360:r=25:d=5.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", hgOut]);
    const preview = path.join(DATA, "look.png");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=640x360", "-frames:v", "1", preview]);
    const src = `/assets/${T}/projects/${P2}/assets/take-1.mp4`;
    await fs.writeFile(path.join(DATA, T, "projects", P2, "project.json"), JSON.stringify({
      project_id: P2, tenant_id: T, name: "x", format: "video", status: "generated", canvas: { width: 360, height: 640, fps: 30 },
      scenes: [{ id: "s1", components: [] }], takes: [{ id: "t0", source: src, scene_index: 0 }],
      speaker_track: { clips: [{ source: src, start: 0, scene_index: 0, trim_start: 0, trim_end: 6 }] },
    }));
    process.env.HEYGEN_API_KEY = "hk";
    const mp4 = await fs.readFile(hgOut), png = await fs.readFile(preview);
    const gens: any[] = []; const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url); calls.push(u);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://api.heygen.com/v3/avatars/looks/lk_twin") return json({ data: { id: "lk_twin", name: "Marc at his desk", avatar_type: "digital_twin", supported_api_engines: ["avatar_v", "avatar_iv"], preview_image_url: "https://files2.heygen.ai/look/p.png", status: "completed" } });
      if (u === "https://files2.heygen.ai/look/p.png") return new Response(png, { status: 200 });
      if (u === "https://api.heygen.com/v3/assets") return json({ data: { asset_id: "aud1" } });
      if (u === "https://api.heygen.com/v3/videos") { gens.push(JSON.parse(init.body)); return json({ data: { video_id: "v1" } }); }
      if (u === "https://api.heygen.com/v3/videos/v1") return json({ data: { status: "completed", video_url: "https://cdn/hg.mp4" } });
      if (u === "https://cdn/hg.mp4") return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    const { addActor } = await import("../src/core/cast.js");
    const actor = await addActor(T, { heygen_look_id: "lk_twin" });
    expect(actor).toMatchObject({ id: "marc-at-his-desk", name: "Marc at his desk", heygen_look_id: "lk_twin" });
    await expect(fs.access(path.join(DATA, T, "cast", "marc-at-his-desk.jpg"))).resolves.toBeUndefined();
    expect((await fs.readdir(path.join(DATA, T, "cast"))).some((f) => f.startsWith("_look-"))).toBe(false); // the download cleaned up

    const { startRecast, getRecastStatus } = await import("../src/core/recast.js");
    let st = await startRecast(T, P2, actor.id);
    for (let i = 0; i < 600 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getRecastStatus(T, P2))!; }
    expect(st.status, st.error || JSON.stringify(st.files)).toBe("done");
    expect(gens).toHaveLength(1);                                           // one call for the whole take
    expect(gens[0]).toMatchObject({ type: "avatar", avatar_id: "lk_twin", audio_asset_id: "aud1", aspect_ratio: "9:16", resolution: "1080p", engine: { type: "avatar_v" } });
    expect(calls.some((c) => c.includes("queue.fal.run"))).toBe(false);     // no Wan
    const out = path.join(assets, "take-1.actor-marc-at-his-desk.mp4");
    expect(Math.abs((await dur(out)) - 6)).toBeLessThan(0.1);               // exactly the take's length
    expect(await info(out)).toMatch(/Video:.*360x640/);                     // covered to the take's frame
    expect(await info(out)).toMatch(/, 30 fps,/);
    const proj = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P2, "project.json"), "utf8"));
    expect(proj.speaker_cast).toBe("marc-at-his-desk");
    expect(proj.speaker_track.clips[0].source).toBe(src.replace(".mp4", ".actor-marc-at-his-desk.mp4"));
    expect(proj.takes[0].actors["marc-at-his-desk"].heygen_look_id).toBe("lk_twin");

    // RESUME: a video HeyGen already has is collected, not paid for twice.
    const { heygenRecastFile } = await import("../src/core/recast.js");
    const work = path.join(DATA, "hg-resume");
    await fs.mkdir(work, { recursive: true });
    await fs.writeFile(path.join(work, "heygen.json"), JSON.stringify({ video_id: "v1" }));
    gens.length = 0;
    await heygenRecastFile({ rawAbs: take, outAbs: path.join(DATA, "hg-resumed.mp4"), workDir: work, lookId: "lk_twin" });
    expect(gens).toHaveLength(0);
    expect(Math.abs((await dur(path.join(DATA, "hg-resumed.mp4"))) - 6)).toBeLessThan(0.1);

    // A photo look that offers Avatar V gets it too; one that does not, HeyGen's default.
    for (const [engines, want] of [[["avatar_v", "avatar_iv"], { type: "avatar_v" }], [["avatar_iv"], undefined]] as const) {
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
        const u = String(url);
        const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
        if (u === "https://api.heygen.com/v3/avatars/looks/lk_sofa") return json({ data: { id: "lk_sofa", avatar_type: "photo_avatar", supported_api_engines: engines, status: "completed" } });
        if (u === "https://api.heygen.com/v3/assets") return json({ data: { asset_id: "aud2" } });
        if (u === "https://api.heygen.com/v3/videos") { gens.push(JSON.parse(init.body)); return json({ data: { video_id: "v2" } }); }
        if (u === "https://api.heygen.com/v3/videos/v2") return json({ data: { status: "completed", video_url: "https://cdn/hg.mp4" } });
        if (u === "https://cdn/hg.mp4") return new Response(mp4, { status: 200 });
        throw new Error("unexpected fetch " + u);
      }));
      gens.length = 0;
      const wd = path.join(DATA, `hg-sofa-${engines.length}`);
      await heygenRecastFile({ rawAbs: take, outAbs: path.join(wd, "out.mp4"), workDir: wd, lookId: "lk_sofa" });
      expect(gens[0].engine).toEqual(want);
    }
    delete process.env.HEYGEN_API_KEY;
  }, 120000);
});

describe("keep the room: the redrawn person over the recording's own room", () => {
  it("outside both people the frame is the recording's; inside, the actor's", async () => {
    const { keepRoom, keepRoomGraph } = await import("../src/core/recast.js");
    expect(keepRoomGraph(360, 640)).toMatch(/blend=all_mode=lighten,dilation/);
    const d = path.join(DATA, "room"); await fs.mkdir(d, { recursive: true });
    const mk = (name: string, color: string) => run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${color}:s=360x640:r=30:d=1`, "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(d, name)]);
    await mk("orig.mp4", "red"); await mk("actor.mp4", "blue");
    // Alpha copies: the person a box in the middle (the recording's a little left, the actor's a little right).
    const alpha = (name: string, x: number) => run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=white:s=360x640:r=30:d=1", "-f", "lavfi", "-i", "color=c=black:s=360x640:r=30:d=1",
      "-filter_complex", `[1:v]drawbox=x=${x}:y=200:w=100:h=240:color=white:t=fill,format=gray[m];[0:v]format=rgba[c];[c][m]alphamerge,format=yuva420p[o]`,
      "-map", "[o]", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", path.join(d, name)]);
    await alpha("orig-alpha.webm", 110); await alpha("actor-alpha.webm", 150);
    await keepRoom(path.join(d, "orig.mp4"), path.join(d, "actor.mp4"), path.join(d, "orig-alpha.webm"), path.join(d, "actor-alpha.webm"), path.join(d, "out.mp4"));
    const px = async (x: number, y: number) => (await run("ffmpeg", ["-v", "error", "-i", path.join(d, "out.mp4"), "-vf", `crop=w=2:h=2:x=${x}:y=${y}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer" as any })).stdout as unknown as Buffer;
    const corner = await px(10, 10), middle = await px(190, 320), leftEdge = await px(115, 320);
    expect(corner[0]).toBeGreaterThan(180); expect(corner[2]).toBeLessThan(80);   // the room: the recording's red
    expect(middle[2]).toBeGreaterThan(180); expect(middle[0]).toBeLessThan(80);   // the person: the actor's blue
    expect(leftEdge[2]).toBeGreaterThan(120);                                      // the recording's own edge is covered too
  }, 60000);
});
