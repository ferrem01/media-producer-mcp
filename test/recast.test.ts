import { describe, it, expect, afterAll, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// RECAST (core/recast.ts): the speaker take performed by a cast actor
// through a vendor (core/performers) -- the take stays the clock, the
// picture is the actor's, fitted back to the take's exact length, the voice
// converted when asked, and the speaker track pointed at it.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-recast-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
process.env.MP_ACTOR_POLL_MS = "20";
const T = "t", P = "proj_recast";

afterAll(async () => { vi.unstubAllGlobals(); delete process.env.FAL_KEY; delete process.env.ELEVENLABS_API_KEY; await fs.rm(DATA, { recursive: true, force: true }); });

const info = async (f: string) => { try { await run("ffmpeg", ["-hide_banner", "-i", f]); return ""; } catch (e: any) { return String(e.stderr || ""); } };
const dur = async (f: string) => { const m = (await info(f)).match(/Duration: (\d+):(\d+):([\d.]+)/)!; return +m[1] * 3600 + +m[2] * 60 + +m[3]; };

describe("recast: a take performed by a cast actor", () => {
  it("cuts the take at its pauses, never longer than a call, never leaving a sliver", async () => {
    const { planChunks } = await import("../src/core/recast.js");
    // Old Chimp's shape: ~32 s, a pause after most sentences; Runway's 15 s calls.
    const sil: Array<[number, number]> = [[4.7, 5.5], [8.2, 9.6], [13.5, 14.3], [17.9, 18.8], [20.8, 21.4], [25.3, 26.6], [31.0, 31.8]];
    const c = planChunks(31.95, sil, 15, 3);
    expect(c[0][0]).toBe(0);
    expect(c[c.length - 1][1]).toBe(31.95);
    for (let i = 1; i < c.length; i++) expect(c[i][0]).toBe(c[i - 1][1]);   // contiguous
    for (const [a, b] of c.slice(0, -1)) expect(b - a).toBeLessThanOrEqual(15 + 1e-9);
    expect(c[0][1]).toBeCloseTo((13.5 + 14.3) / 2, 5);                        // the last pause that fits
    expect(planChunks(9, [[3.0, 3.6]], 7.5, 2.5)[0]).toEqual([0, 3.3]);
    expect(planChunks(12, [], 7.5, 2.5)[0]).toEqual([0, 7.5]);               // no pause that fits: a hard cut at the limit
    expect(planChunks(3, [], 7.5, 2.5)).toEqual([[0, 3]]);
    expect(planChunks(15.4, [], 7.5, 2.5)).toEqual([[0, 7.5], [7.5, 15.4]]);   // the sliver folds back
    expect(planChunks(8.4, [], 7.5, 2.5)).toEqual([[0, 7.5], [7.5, 8.4]]);     // unless that would overrun a call
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

  it("recasts a film end to end: the vendor's picture fitted to the take, voice converted, clips pointed; reused, redone, undone", async () => {
    const assets = path.join(DATA, T, "projects", P, "assets");
    await fs.mkdir(assets, { recursive: true });
    // A 12 s take.
    const take = path.join(assets, "take-1.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=12",
      "-f", "lavfi", "-i", "sine=frequency=300:duration=12", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", take]);
    // Kling returns a little less than it is given.
    const back = path.join(DATA, "kling-back.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:s=360x640:r=30:d=11", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", back]);
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
    const mp4 = await fs.readFile(back);
    const mp3 = (await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=200:duration=12", "-f", "mp3", "-"], { encoding: "buffer" as any, maxBuffer: 1 << 24 })).stdout as unknown as Buffer;
    let klingCalls = 0, stsCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/fal-ai/kling-video/v3/pro/motion-control") { klingCalls++; return json({ status_url: "https://q/s", response_url: "https://q/r" }); }
      if (u === "https://q/s") return json({ status: "COMPLETED" });
      if (u === "https://q/r") return json({ video: { url: "https://cdn/k.mp4" } });
      if (u === "https://cdn/k.mp4") return new Response(mp4, { status: 200 });
      if (u.startsWith("https://api.elevenlabs.io/v1/speech-to-speech/roger-voice")) { stsCalls++; return new Response(mp3, { status: 200 }); }
      throw new Error("unexpected fetch " + u);
    }));
    const { addActor, listCast } = await import("../src/core/cast.js");
    await expect(addActor(T, { name: "Roger guy", image: "assets/p.png" })).rejects.toThrow(/consent/);  // a portrait is vouched for
    const actor = await addActor(T, { name: "Roger guy", image: "assets/p.png", voice_id: "roger-voice", voice_name: "Roger", consent: true });
    expect(actor.id).toBe("roger-guy");
    expect(actor.consent?.at).toBeTruthy();
    expect((await listCast(T)).map((a) => a.id)).toEqual(["roger-guy"]);
    await expect(fs.access(path.join(DATA, T, "cast", "roger-guy.jpg"))).resolves.toBeUndefined();

    const { startRecast, getRecastStatus } = await import("../src/core/recast.js");
    await expect(startRecast(T, P, "roger-guy", { performer: "wan" })).rejects.toThrow(/No performer "wan"/);
    const wait = async () => { for (let i = 0; i < 1200 && (await getRecastStatus(T, P))!.status === "running"; i++) await new Promise((r) => setTimeout(r, 100)); return (await getRecastStatus(T, P))!; };
    const st0 = await startRecast(T, P, "roger-guy");   // a portrait actor: Kling (the key is there)
    expect(st0.performer).toBe("kling");
    expect(st0.files).toHaveLength(1); // one take file behind both clips
    const st = await wait();
    expect(st.status, st.error || JSON.stringify(st.files)).toBe("done");
    expect(klingCalls).toBe(1);   // 12 s: one call
    expect(stsCalls).toBe(1);     // the voice converted once, the whole take
    const out = path.join(assets, "take-1.actor-roger-guy-kling.mp4");
    expect(Math.abs((await dur(out)) - 12)).toBeLessThan(0.1);                  // exactly the take's length
    expect((await info(out))).toMatch(/, 30 fps,/);
    expect((await info(out))).toMatch(/Video:.*360x640/);                         // at the take's resolution
    expect((await info(out))).toMatch(/Audio:.*stereo/);
    const proj = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8"));
    expect(proj.speaker_cast).toBe("roger-guy");
    expect(proj.speaker_track.clips.map((c: any) => c.source)).toEqual([src.replace(".mp4", ".actor-roger-guy-kling.mp4"), src.replace(".mp4", ".actor-roger-guy-kling.mp4")]);
    expect(proj.speaker_track.clips.map((c: any) => [c.trim_start, c.trim_end])).toEqual([[0, 5.5], [5.5, 12]]); // the timeline untouched
    expect(proj.takes.every((t: any) => t.actors["roger-guy"].voice_id === "roger-voice" && t.actors["roger-guy"].performer === "kling")).toBe(true);
    await expect(fs.access(path.join(DATA, T, "projects", P, "_work", "recast-roger-guy-kling-0"))).rejects.toThrow(); // pieces cleaned up

    // The same performance again is reused; another voice is another performance; fresh makes it again.
    expect((await startRecast(T, P, "roger-guy", { performer: "kling" })).files[0].status).toBe("reused");
    await wait();
    expect(klingCalls).toBe(1);
    expect((await startRecast(T, P, "roger-guy", { performer: "kling", voice_id: "mine" })).files[0].status).toBe("running");
    await wait();
    expect(klingCalls).toBe(2);
    expect((await startRecast(T, P, "roger-guy", { performer: "kling", voice_id: "mine", fresh: true })).files[0].status).toBe("running");
    await wait();
    expect(klingCalls).toBe(3);
    // null puts the recording back.
    await startRecast(T, P, null);
    const back2 = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8"));
    expect(back2.speaker_cast).toBeUndefined();
    expect(back2.speaker_track.clips.map((c: any) => c.source)).toEqual([src, src]);

    // A status left "running" by a dead server reads as interrupted.
    const sf = path.join(DATA, T, "projects", P, "recast.json");
    const cur = JSON.parse(await fs.readFile(sf, "utf8"));
    await fs.writeFile(sf, JSON.stringify({ ...cur, status: "running" }));
    expect((await getRecastStatus(T, P))!.status).toBe("interrupted");
    delete process.env.FAL_KEY; delete process.env.ELEVENLABS_API_KEY;
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
    const out = path.join(assets, "take-1.actor-marc-at-his-desk-heygen.mp4");
    expect(Math.abs((await dur(out)) - 6)).toBeLessThan(0.1);               // exactly the take's length
    expect(await info(out)).toMatch(/Video:.*360x640/);                     // covered to the take's frame
    expect(await info(out)).toMatch(/, 30 fps,/);
    const proj = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P2, "project.json"), "utf8"));
    expect(proj.speaker_cast).toBe("marc-at-his-desk");
    expect(proj.speaker_track.clips[0].source).toBe(src.replace(".mp4", ".actor-marc-at-his-desk-heygen.mp4"));
    expect(proj.takes[0].actors["marc-at-his-desk"].heygen_look_id).toBe("lk_twin");

    // RESUME: a video HeyGen already has is collected, not paid for twice.
    const { performTakeFile } = await import("../src/core/recast.js");
    const { getPerformer } = await import("../src/core/performers/index.js");
    const heygenRecastFile = (o: { rawAbs: string; outAbs: string; workDir: string; lookId: string }) => performTakeFile({
      rawAbs: o.rawAbs, outAbs: o.outAbs, performer: getPerformer("heygen")!,
      ctx: { tenant: T, actor: { id: "a", name: "a", portrait: "", heygen_look_id: o.lookId, created_at: "" }, portraitAbs: "", workDir: o.workDir, width: 360, height: 640 },
    });
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

describe("performers: the vendor is a choice", () => {
  it("lists every vendor with what it keeps and whether it is set up; picks a default per actor", async () => {
    const { performerList, defaultPerformer } = await import("../src/core/performers/index.js");
    process.env.FAL_KEY = "fk"; delete process.env.HEYGEN_API_KEY;
    const list = performerList();
    expect(list.map((p) => p.id)).toEqual(["heygen", "kling", "runway"]);   // Wan never held: gone
    expect(list.find((p) => p.id === "heygen")).toMatchObject({ drivenBy: "audio", generate: true, available: false });
    // Kling and Runway copy a recording's motion AND can animate a portrait from a voice.
    expect(list.find((p) => p.id === "kling")).toMatchObject({ drivenBy: "video", generate: true, available: true, maxSeconds: 29 });
    expect(list.find((p) => p.id === "runway")).toMatchObject({ generate: true, available: false });
    const base = { id: "a", name: "a", portrait: "cast/a.jpg", created_at: "" };
    expect(defaultPerformer({ ...base, heygen_look_id: "lk" }).id).toBe("heygen");   // a HeyGen look: HeyGen
    expect(defaultPerformer(base).id).toBe("kling");                                   // a portrait: the best video-driven vendor with a key
    delete process.env.FAL_KEY;
  });

  it("a video-driven vendor gets the take cut at its pauses, each stretch held to its length, the take's own sound under it", async () => {
    const d = path.join(DATA, "kling"); await fs.mkdir(d, { recursive: true });
    // A 40 s take (over Kling's 29 s a call) with a pause at 20-21 s.
    const take = path.join(d, "take.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=180x320:rate=30:duration=40",
      "-f", "lavfi", "-i", "sine=frequency=300:duration=40", "-af", "volume='if(between(t,20,21),0,1)':eval=frame",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", take]);
    const portrait = path.join(d, "p.png");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=256x384", "-frames:v", "1", portrait]);
    // Kling returns a little less than it is given, in its own size.
    const back = path.join(d, "back.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:s=292x444:r=24:d=15", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", back]);
    const mp4 = await fs.readFile(back);
    const sent: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/fal-ai/kling-video/v3/pro/motion-control") { sent.push(JSON.parse(init.body)); return json({ status_url: "https://q/ks", response_url: "https://q/kr" }); }
      if (u === "https://q/ks") return json({ status: "COMPLETED" });
      if (u === "https://q/kr") return json({ video: { url: "https://cdn/k.mp4" } });
      if (u === "https://cdn/k.mp4") return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.FAL_KEY = "fk";
    const { performTakeFile } = await import("../src/core/recast.js");
    const { getPerformer } = await import("../src/core/performers/index.js");
    const chunks: Array<[number, number]> = [];
    const out = path.join(d, "out.mp4");
    await performTakeFile({
      rawAbs: take, outAbs: out, performer: getPerformer("kling")!,
      ctx: { tenant: T, actor: { id: "a", name: "a", portrait: "", created_at: "" }, portraitAbs: portrait, workDir: path.join(d, "work"), width: 180, height: 320 },
      onChunk: (done, total) => chunks.push([done, total]),
    });
    expect(sent).toHaveLength(2);                                             // cut once, at the pause
    expect(sent[0]).toMatchObject({ character_orientation: "video" });
    expect(sent[0].video_url).toMatch(/^data:video\/mp4;base64,/);          // no public address here: inline
    expect(chunks[chunks.length - 1]).toEqual([2, 2]);
    expect(Math.abs((await dur(out)) - 40)).toBeLessThan(0.1);               // exactly the take's length
    expect(await info(out)).toMatch(/Video:.*180x320/);
    expect(await info(out)).toMatch(/, 30 fps,/);
    delete process.env.FAL_KEY;
  }, 180000);
});
