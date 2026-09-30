import { describe, it, expect, afterAll, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Marc: record anywhere and still ship a professional film -- performance
// transfer redraws the person from a portrait and keeps his timing. The
// actor test sends one scene of the take to Wan Animate (fal) and Runway
// Act-Two, converts the voice with ElevenLabs, and cuts a side-by-side.
// The providers are faked here: the test checks what is SENT and what is
// made from what comes back.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-actor-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
process.env.MP_ACTOR_POLL_MS = "20";
const T = "t", P = "p";
let firstId = "";

async function film(file: string, size: string, secs: number): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=30:duration=${secs}`, "-f", "lavfi", "-i", `sine=frequency=330:duration=${secs}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
}

afterAll(async () => { vi.unstubAllGlobals(); delete process.env.FAL_KEY; delete process.env.RUNWAYML_API_SECRET; delete process.env.ELEVENLABS_API_KEY; await fs.rm(DATA, { recursive: true, force: true }); });

describe("actor test: one scene of the take, performed by a synthetic actor", () => {
  it("sends the scene's slice and the portrait to both providers, converts the voice, and cuts a side-by-side", async () => {
    const projDir = path.join(DATA, T, "projects", P);
    await film(path.join(projDir, "assets", "take.mp4"), "360x640", 4);
    const result = path.join(DATA, "result.mp4");
    await film(result, "360x640", 2);
    await fs.mkdir(path.join(DATA, T, "assets", "generated"), { recursive: true });
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:s=512x768", "-frames:v", "1", path.join(DATA, T, "assets", "generated", "actor.png")]);
    await fs.writeFile(path.join(projDir, "project.json"), JSON.stringify({
      project_id: P, tenant_id: T, name: "x", format: "video", status: "generated", scenes: [], canvas: { width: 1080, height: 1920, fps: 30 },
      speaker_track: { clips: [{ source: `/assets/${T}/projects/${P}/assets/take.mp4`, start: 0, scene_index: 0, trim_start: 1, trim_end: 3 }] },
    }));
    process.env.FAL_KEY = "fk"; process.env.RUNWAYML_API_SECRET = "rk"; process.env.ELEVENLABS_API_KEY = "ek";

    const mp4 = await fs.readFile(result);
    const mp3 = (await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=500:duration=2", "-f", "mp3", "-"], { encoding: "buffer" as any, maxBuffer: 1 << 24 })).stdout as unknown as Buffer;
    const sent: Record<string, any> = {};
    let falPolls = 0, rwPolls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace") { sent.fal = { auth: init.headers.Authorization, body: JSON.parse(init.body) }; return json({ request_id: "r1", status_url: "https://q/status", response_url: "https://q/result" }); }
      if (u === "https://q/status") return json({ status: ++falPolls < 2 ? "IN_PROGRESS" : "COMPLETED" });
      if (u === "https://q/result") return json({ video: { url: "https://cdn/wan.mp4" } });
      if (u === "https://api.dev.runwayml.com/v1/character_performance") { sent.runway = { headers: init.headers, body: JSON.parse(init.body) }; return json({ id: "task1" }); }
      if (u === "https://api.dev.runwayml.com/v1/tasks/task1") return json(++rwPolls < 2 ? { status: "RUNNING" } : { status: "SUCCEEDED", output: ["https://cdn/rw.mp4"] });
      if (u === "https://api.elevenlabs.io/v1/voices") return json({ voices: [{ voice_id: "m1", name: "Adam", category: "premade", labels: { gender: "male" } }, { voice_id: "f1", name: "Sarah", category: "premade", labels: { gender: "female" } }] });
      if (u.startsWith("https://api.elevenlabs.io/v1/speech-to-speech/")) { sent.voice = { url: u, key: init.headers["xi-api-key"], model: init.body.get("model_id") }; return new Response(mp3, { status: 200 }); }
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));

    const { startActorTest, getActorTest } = await import("../src/core/actor-test.js");
    const t = await startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png" });
    expect(t.providers).toEqual(["wan", "runway"]);
    firstId = t.id;
    let st = t;
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, t.id))!; }
    expect(st.status, (st.error || "") + JSON.stringify(st.steps)).toBe("done");

    // What went out: the scene's slice (2s, not the whole 4s take) and the portrait as data URIs.
    expect(sent.fal.auth).toBe("Key fk");
    expect(sent.fal.body.video_url).toMatch(/^data:video\/mp4;base64,/);
    expect(sent.fal.body.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(sent.fal.body.resolution).toBe("720p");
    expect(sent.runway.headers["X-Runway-Version"]).toBe("2024-11-06");
    expect(sent.runway.body).toMatchObject({ model: "act_two", ratio: "720:1280", bodyControl: true, character: { type: "image" }, reference: { type: "video" } });
    expect(sent.voice.url).toContain("/speech-to-speech/f1"); // a stock female voice, not a clone
    expect(sent.voice.model).toBe("eleven_multilingual_sts_v2");
    const dir = path.join(projDir, "output", "actor-tests", t.id);
    // ffmpeg -i reports the file on stderr (no ffprobe needed).
    const info = async (f: string) => { try { await run("ffmpeg", ["-hide_banner", "-i", path.join(dir, f)]); return ""; } catch (e: any) { return String(e.stderr || ""); } };
    const dur = async (f: string) => { const m = (await info(f)).match(/Duration: (\d+):(\d+):([\d.]+)/)!; return +m[1] * 3600 + +m[2] * 60 + +m[3]; };
    expect(await dur("source.mp4")).toBeCloseTo(2, 0);
    for (const f of ["wan.mp4", "runway.mp4", "voice.mp3", "compare.mp4", "status.json"]) await expect(fs.access(path.join(dir, f))).resolves.toBeUndefined();
    const [, w, h] = ((await info("compare.mp4")).match(/Video:.*?, (\d{2,5})x(\d{2,5})/) || []).map(Number);
    expect(h).toBe(960);
    expect(w).toBeGreaterThan(3 * 500); // you | wan | runway
  }, 60000);

  it("the voice lineup lays several voices on one earlier picture; \"move\" goes to Wan's move endpoint", async () => {
    const calls: string[] = [];
    const mp3 = (await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=200:duration=2", "-f", "mp3", "-"], { encoding: "buffer" as any, maxBuffer: 1 << 24 })).stdout as unknown as Buffer;
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url); calls.push(u);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://api.elevenlabs.io/v1/voices") return json({ voices: [{ voice_id: "b1", name: "Brian - Deep", category: "premade" }, { voice_id: "e1", name: "Eric - Smooth", category: "premade" }] });
      if (u.startsWith("https://api.elevenlabs.io/v1/speech-to-speech/")) return new Response(mp3, { status: 200 });
      if (u === "https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/move") return json({ request_id: "m", status_url: "https://q/s2", response_url: "https://q/r2" });
      if (u === "https://q/s2") return json({ status: "COMPLETED" });
      if (u === "https://q/r2") return json({ video: { url: "https://cdn/move.mp4" } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    const { startVoiceLineup, startActorTest, getActorTest } = await import("../src/core/actor-test.js");
    const wait = async (id: string) => { let st = (await getActorTest(T, P, id))!; for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, id))!; } return st; };

    const lu = await wait((await startVoiceLineup({ tenant: T, project: P, from: firstId, voices: ["Brian", "Eric", "Nobody"] })).id);
    expect(lu.status).toBe("done");
    expect(Object.keys(lu.files).sort()).toEqual(["voice-brian", "voice-eric", "wan-brian", "wan-eric"]);
    expect(lu.steps["voice:Nobody"].status).toBe("failed");
    expect(calls.filter((c) => c.includes("/speech-to-speech/b1")).length).toBe(1);
    expect(calls.some((c) => c.includes("fal.run"))).toBe(false); // no new video generation

    const mv = await wait((await startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png", providers: ["wan-move"], voice: false })).id);
    expect(mv.status, mv.error || JSON.stringify(mv.steps)).toBe("done");
    expect(calls).toContain("https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/move");
    expect(mv.files["wan-move"]).toBe("wan-move.mp4");
  }, 60000);

  it("seedance invents the shot from the portrait, lip-synced to the converted voice", async () => {
    let body: any = null;
    const mp3 = (await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=200:duration=2", "-f", "mp3", "-"], { encoding: "buffer" as any, maxBuffer: 1 << 24 })).stdout as unknown as Buffer;
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    process.env.ELEVENLABS_API_KEY = "ek"; process.env.FAL_KEY = "fk";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://api.elevenlabs.io/v1/voices") return json({ voices: [] });
      if (u.startsWith("https://api.elevenlabs.io/v1/speech-to-speech/r1")) return new Response(mp3, { status: 200 });
      if (u === "https://queue.fal.run/bytedance/seedance-2.0/reference-to-video") { body = JSON.parse(init.body); return json({ request_id: "s", status_url: "https://q/s3", response_url: "https://q/r3" }); }
      if (u === "https://q/s3") return json({ status: "COMPLETED" });
      if (u === "https://q/r3") return json({ video: { url: "https://cdn/seed.mp4" } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    const { startActorTest, getActorTest, SEEDANCE_DEFAULT_PROMPT } = await import("../src/core/actor-test.js");
    const t = await startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png", providers: ["seedance"], voice_id: "r1" });
    let st = t;
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, t.id))!; }
    expect(st.status, st.error || JSON.stringify(st.steps)).toBe("done");
    expect(body.image_urls[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.audio_urls[0]).toMatch(/^data:audio\/mpeg;base64,/); // the converted voice, not the take
    expect(body).toMatchObject({ duration: "4", aspect_ratio: "9:16", prompt: SEEDANCE_DEFAULT_PROMPT });
    expect(SEEDANCE_DEFAULT_PROMPT).toMatch(/@Image1[\s\S]*@Audio1/);
    expect(st.files.seedance).toBe("seedance.mp4");
  }, 60000);

  it("seedance from text: no portrait, the scene's line in the prompt; a refusal reads as one short line", async () => {
    const projFile = path.join(DATA, T, "projects", P, "project.json");
    const pj = JSON.parse(await fs.readFile(projFile, "utf8"));
    pj.storyboard = { scenes: [{ voiceover_text: "Are you really still sending your email with this guy?" }] };
    await fs.writeFile(projFile, JSON.stringify(pj));
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    let body: any = null, refuse = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/bytedance/seedance-2.0/text-to-video") { body = JSON.parse(init.body); return json({ request_id: "t", status_url: "https://q/s4", response_url: "https://q/r4" }); }
      if (u === "https://q/s4") return json({ status: "COMPLETED" });
      if (u === "https://q/r4") return refuse
        ? json({ detail: [{ loc: ["body", "image_urls"], msg: "may contain likenesses of real people", type: "content_policy_violation", input: { image_urls: ["data:image/jpeg;base64," + "A".repeat(5000)] } }] }, 422)
        : json({ video: { url: "https://cdn/t2v.mp4" } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.FAL_KEY = "fk";
    const { startActorTest, getActorTest } = await import("../src/core/actor-test.js");
    const wait = async (id: string) => { let st = (await getActorTest(T, P, id))!; for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, id))!; } return st; };
    const ok = await wait((await startActorTest({ tenant: T, project: P, scene_index: 0, image: "", providers: ["seedance-t2v"], voice: false })).id);
    expect(ok.status, ok.error || JSON.stringify(ok.steps)).toBe("done");
    expect(body.image_urls).toBeUndefined();
    expect(body.prompt).toContain('He says: "Are you really still sending your email with this guy?"');
    expect(body).toMatchObject({ aspect_ratio: "9:16", generate_audio: true });
    expect(ok.files.actor).toBeUndefined();
    refuse = true;
    const bad = await wait((await startActorTest({ tenant: T, project: P, scene_index: 0, image: "", providers: ["seedance-t2v"], voice: false })).id);
    const err = bad.steps["seedance-t2v"].error || "";
    expect(err).toContain("likenesses of real people");
    expect(err.length).toBeLessThan(400);
    expect(err).not.toContain("AAAAAAAA");
  }, 60000);

  it("wan-s2v: one still from an earlier test + the voice; video_from swaps the performance source", async () => {
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    const bodies: Record<string, any> = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/fal-ai/wan/v2.2-14b/speech-to-video") { bodies.s2v = JSON.parse(init.body); return json({ request_id: "a", status_url: "https://q/s5", response_url: "https://q/r5" }); }
      if (u === "https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace") { bodies.rep = JSON.parse(init.body); return json({ request_id: "b", status_url: "https://q/s5", response_url: "https://q/r5" }); }
      if (u === "https://q/s5") return json({ status: "COMPLETED" });
      if (u === "https://q/r5") return json({ video: { url: "https://cdn/x.mp4" } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.FAL_KEY = "fk";
    const { startActorTest, getActorTest } = await import("../src/core/actor-test.js");
    const wait = async (id: string) => { let st = (await getActorTest(T, P, id))!; for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, id))!; } return st; };
    const s2v = await wait((await startActorTest({ tenant: T, project: P, scene_index: 0, image: "", image_from: { test: firstId, file: "wan.mp4", at: 0.5 }, providers: ["wan-s2v"], voice: false })).id);
    expect(s2v.status, s2v.error || JSON.stringify(s2v.steps)).toBe("done");
    expect(s2v.image).toBe(`${firstId}/wan.mp4@0.5`);
    expect(bodies.s2v.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(bodies.s2v.audio_url).toMatch(/^data:audio\/mpeg;base64,/);
    expect(bodies.s2v.num_frames % 4).toBe(0);
    expect(bodies.s2v.num_frames).toBeLessThanOrEqual(120);
    const rep = await wait((await startActorTest({ tenant: T, project: P, scene_index: 7, image: "", image_from: { test: firstId, file: "wan.mp4", at: 0.2 }, video_from: { test: s2v.id, file: "wan-s2v.mp4" }, providers: ["wan"], voice: false })).id);
    expect(rep.status, rep.error || JSON.stringify(rep.steps)).toBe("done"); // scene 8 has no speaker clip: video_from stands in
    expect(bodies.rep.video_url).toMatch(/^data:video\/mp4;base64,/);
    await expect(startActorTest({ tenant: T, project: P, scene_index: 0, image: "", image_from: { test: "../../x", file: "a" }, providers: ["wan-s2v"] })).rejects.toThrow(/bad reference/);
  }, 60000);

  it("source_range and fps: a span of the take at a chosen frame rate (how long can one Wan call run?)", async () => {
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.startsWith("https://queue.fal.run/fal-ai/wan/")) return json({ request_id: "x", status_url: "https://q/s9", response_url: "https://q/r9" });
      if (u === "https://q/s9") return json({ status: "COMPLETED" });
      if (u === "https://q/r9") return json({ video: { url: "https://cdn/x.mp4" } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.FAL_KEY = "fk";
    const { startActorTest, getActorTest } = await import("../src/core/actor-test.js");
    let st = await startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png", providers: ["wan"], voice: false, source_range: { start: 0.5, end: 3.5 }, fps: 16 });
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, st.id))!; }
    expect(st.status, st.error || JSON.stringify(st.steps)).toBe("done");
    let err = "";
    try { await run("ffmpeg", ["-hide_banner", "-i", path.join(DATA, T, "projects", P, "output", "actor-tests", st.id, "source.mp4")]); } catch (e: any) { err = String(e.stderr || ""); }
    const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/)!;
    expect(+m[3]).toBeCloseTo(3, 0);            // the span, not the scene's 2 s trim
    expect(err).toMatch(/, 16 fps,/);
  }, 60000);

  it("kling: one call of up to 30 s, the take's motion on the character image", async () => {
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    let body: any = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/fal-ai/kling-video/v3/pro/motion-control") { body = JSON.parse(init.body); return json({ request_id: "k", status_url: "https://q/sk", response_url: "https://q/rk" }); }
      if (u === "https://q/sk") return json({ status: "COMPLETED" });
      if (u === "https://q/rk") return json({ video: { url: "https://cdn/k.mp4" } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.FAL_KEY = "fk";
    const { startActorTest, getActorTest } = await import("../src/core/actor-test.js");
    let st = await startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png", providers: ["kling"], voice: false });
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, st.id))!; }
    expect(st.status, st.error || JSON.stringify(st.steps)).toBe("done");
    expect(body).toMatchObject({ character_orientation: "video", keep_original_sound: true });
    expect(body.video_url).toMatch(/^data:video\/mp4;base64,/); // no public address in a test: inlined
    expect(body.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(st.files.kling).toBe("kling.mp4");
  }, 60000);

  it("heygen: the portrait and the voice uploaded, an Avatar IV video generated and collected", async () => {
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    const seen: Record<string, any> = {}; let uploads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://upload.heygen.com/v1/asset") { uploads++; seen[init.headers["Content-Type"]] = init.headers["X-Api-Key"]; return json({ code: 100, data: init.headers["Content-Type"].startsWith("image") ? { id: "img1", image_key: "image/abc/original" } : { id: "aud1" } }); }
      if (u === "https://api.heygen.com/v2/video/av4/generate") { seen.gen = JSON.parse(init.body); return json({ data: { video_id: "v1" } }); }
      if (u.startsWith("https://api.heygen.com/v1/video_status.get?video_id=v1")) return json({ data: { status: "completed", video_url: "https://cdn/h.mp4" } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.HEYGEN_API_KEY = "hk";
    const { startActorTest, getActorTest } = await import("../src/core/actor-test.js");
    let st = await startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png", providers: ["heygen"], voice: false });
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, st.id))!; }
    expect(st.status, st.error || JSON.stringify(st.steps)).toBe("done");
    expect(uploads).toBe(2);
    expect(seen["image/jpeg"]).toBe("hk");
    expect(seen.gen).toMatchObject({ image_key: "image/abc/original", audio_asset_id: "aud1", video_orientation: "portrait" });
    expect(st.files.heygen).toBe("heygen.mp4");
    delete process.env.HEYGEN_API_KEY;
  }, 60000);

  it("heygen-avatar: a saved HeyGen avatar (a digital twin) lip-synced to the take's own voice, no portrait needed", async () => {
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    let gen: any = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://upload.heygen.com/v1/asset") return json({ code: 100, data: { id: "aud9" } });
      if (u === "https://api.heygen.com/v2/video/generate") { gen = JSON.parse(init.body); return json({ data: { video_id: "v9" } }); }
      if (u.startsWith("https://api.heygen.com/v1/video_status.get?video_id=v9")) return json({ data: { status: "completed", video_url: "https://cdn/a.mp4" } });
      if (u === "https://api.heygen.com/v2/avatars") return json({ data: { avatars: [{ avatar_id: "marc_twin", avatar_name: "Marc", preview_image_url: "p" }], talking_photos: [{ talking_photo_id: "tp1", talking_photo_name: "Photo" }] } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.HEYGEN_API_KEY = "hk";
    const { startActorTest, getActorTest, listHeygenAvatars } = await import("../src/core/actor-test.js");
    expect(await listHeygenAvatars()).toEqual([{ id: "marc_twin", name: "Marc", kind: "avatar", preview: "p" }, { id: "tp1", name: "Photo", kind: "talking_photo", preview: undefined }]);
    await expect(startActorTest({ tenant: T, project: P, scene_index: 0, image: "", providers: ["heygen-avatar"], voice: false })).rejects.toThrow(/heygen_avatar_id/);
    let st = await startActorTest({ tenant: T, project: P, scene_index: 0, image: "", providers: ["heygen-avatar"], voice: false, heygen_avatar_id: "marc_twin" });
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, st.id))!; }
    expect(st.status, st.error || JSON.stringify(st.steps)).toBe("done");
    expect(gen.video_inputs[0]).toEqual({ character: { type: "avatar", avatar_id: "marc_twin", avatar_style: "normal" }, voice: { type: "audio", audio_asset_id: "aud9" } });
    expect(gen.dimension).toEqual({ width: 720, height: 1280 });
    expect(st.files["heygen-avatar"]).toBe("heygen-avatar.mp4");
    delete process.env.HEYGEN_API_KEY;
  }, 60000);

  it("heygen-v3: a look or the portrait, with motion prompt and expressiveness; looks listed and generated from a prompt", async () => {
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    const gens: any[] = []; let assets = 0; let created: any = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://api.heygen.com/v3/assets") { assets++; expect(init.body).toBeInstanceOf(FormData); return json({ data: { asset_id: `as${assets}` } }); }
      if (u === "https://api.heygen.com/v3/videos") { gens.push(JSON.parse(init.body)); return json({ data: { video_id: `v${gens.length}` } }); }
      if (u.startsWith("https://api.heygen.com/v3/videos/v")) return json({ data: { status: "completed", video_url: "https://cdn/v3.mp4" } });
      if (u.startsWith("https://api.heygen.com/v3/avatars/looks?ownership=private")) return json({ data: [{ id: "lk_green", name: "Marc in green shirt", avatar_type: "photo_avatar", group_id: "ag_1", supported_api_engines: ["avatar_iv"], status: "completed" }], has_more: false });
      if (u === "https://api.heygen.com/v3/avatars") { created = JSON.parse(init.body); return json({ data: { avatar_item: { id: "lk_couch", name: "Couch", avatar_type: "photo_avatar", status: "processing" }, avatar_group: { id: "ag_1" } } }); }
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.HEYGEN_API_KEY = "hk";
    const { startActorTest, getActorTest, listHeygenLooks, createHeygenLook } = await import("../src/core/actor-test.js");
    expect((await listHeygenLooks()).map((l) => [l.id, l.type, l.group_id])).toEqual([["lk_green", "photo_avatar", "ag_1"]]);
    expect(await createHeygenLook({ prompt: "on a couch in a grey sweater", avatar_id: "lk_green" })).toMatchObject({ id: "lk_couch", status: "processing", group_id: "ag_1" });
    expect(created).toMatchObject({ type: "prompt", prompt: "on a couch in a grey sweater", avatar_id: "lk_green", aspect_ratio: "9:16" });
    const wait = async (st: any) => { for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, st.id))!; } return st; };
    // A look: no portrait, the audio uploaded, the look named.
    let st = await wait(await startActorTest({ tenant: T, project: P, scene_index: 0, image: "", providers: ["heygen-v3"], voice: false, heygen_avatar_id: "lk_couch", prompt: "soft eyes", expressiveness: "low" }));
    expect(st.status, st.error || JSON.stringify(st.steps)).toBe("done");
    expect(gens[0]).toMatchObject({ type: "avatar", avatar_id: "lk_couch", audio_asset_id: "as1", aspect_ratio: "9:16", motion_prompt: "soft eyes", expressiveness: "low" });
    // The portrait: uploaded as an image asset.
    st = await wait(await startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png", providers: ["heygen-v3"], voice: false, engine: "avatar_iv" }));
    expect(st.status, st.error || JSON.stringify(st.steps)).toBe("done");
    expect(gens[1]).toMatchObject({ type: "image", image: { type: "asset_id" }, engine: { type: "avatar_iv" } });
    expect(gens[1].motion_prompt).toBeUndefined();
    expect(st.files["heygen-v3"]).toBe("heygen-v3.mp4");
    delete process.env.HEYGEN_API_KEY;
  }, 60000);

  it("seedance25: the take as @Video1 and the portrait as @Image1 in one reference call (a recast, the Genjutsu idea)", async () => {
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    let body: any = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/bytedance/seedance-2.5/reference-to-video") { body = JSON.parse(init.body); return json({ status_url: "https://q/s25", response_url: "https://q/r25" }); }
      if (u === "https://q/s25") return json({ status: "COMPLETED" });
      if (u === "https://q/r25") return json({ video: { url: "https://cdn/s25.mp4" } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.FAL_KEY = "fk";
    const { startActorTest, getActorTest } = await import("../src/core/actor-test.js");
    let st = await startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png", providers: ["seedance25"], voice: false });
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P, st.id))!; }
    expect(st.status, st.error || JSON.stringify(st.steps)).toBe("done");
    expect(body.prompt).toMatch(/@Video1/);
    expect(body.prompt).toMatch(/@Image1/);
    expect(body.video_urls).toHaveLength(1);
    expect(body.image_urls).toHaveLength(1);
    expect(body).toMatchObject({ resolution: "720p", generate_audio: false });
    expect(st.files.seedance25).toBe("seedance25.mp4");
  }, 60000);

  it("a film cast as an actor: the test is fed the RECORDING, never the actor's recast of it", async () => {
    const P2 = "pcast";
    const projDir = path.join(DATA, T, "projects", P2);
    await film(path.join(projDir, "assets", "take.mp4"), "360x640", 4);
    const raw = `/assets/${T}/projects/${P2}/assets/take.mp4`;
    const recast = `/assets/${T}/projects/${P2}/assets/take.actor-sofa-heygen.mp4`;   // not on disk: reading it would fail
    await fs.writeFile(path.join(projDir, "project.json"), JSON.stringify({
      project_id: P2, tenant_id: T, name: "x", format: "video", status: "generated", scenes: [], canvas: { width: 1080, height: 1920, fps: 30 },
      takes: [{ id: "t0", scene_index: 0, source: raw, actors: { sofa: { file: recast, performer: "heygen" } } }], speaker_cast: "sofa",
      speaker_track: { clips: [{ source: recast, start: 0, scene_index: 0, trim_start: 0, trim_end: 4 }] },
    }));
    const mp4 = await fs.readFile(path.join(DATA, "result.mp4"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://queue.fal.run/fal-ai/kling-video/v3/pro/motion-control") return json({ status_url: "https://q/ks", response_url: "https://q/kr" });
      if (u === "https://q/ks") return json({ status: "COMPLETED" });
      if (u === "https://q/kr") return json({ video: { url: "https://cdn/k.mp4" } });
      if (u.startsWith("https://cdn/")) return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.FAL_KEY = "fk";
    const { startActorTest, getActorTest } = await import("../src/core/actor-test.js");
    await expect(startActorTest({ tenant: T, project: P2, scene_index: 0, image: "assets/generated/actor.png", providers: ["genjutsu"], voice: false, scene_image: "../../etc/passwd" })).rejects.toThrow(/inside the tenant|HF_API_KEY/);
    let st = await startActorTest({ tenant: T, project: P2, scene_index: 0, image: "assets/generated/actor.png", providers: ["kling"], voice: false });
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getActorTest(T, P2, st.id))!; }
    expect(st.status, st.error || JSON.stringify(st.steps)).toBe("done");   // the recast file does not exist: only the recording could be read
    expect(st.files.source).toBe("source.mp4");
  }, 60000);

  it("refuses without a provider key, and an image outside the tenant", async () => {
    const { startActorTest } = await import("../src/core/actor-test.js");
    delete process.env.FAL_KEY; delete process.env.RUNWAYML_API_SECRET;
    await expect(startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png" })).rejects.toThrow(/No provider key/);
    process.env.FAL_KEY = "fk";
    await expect(startActorTest({ tenant: T, project: P, scene_index: 0, image: "../../etc/passwd" })).rejects.toThrow(/inside the tenant/);
    await expect(startActorTest({ tenant: T, project: P, scene_index: 5, image: "assets/generated/actor.png" })).rejects.toThrow(/no speaker clip/);
  });
});
