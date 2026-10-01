import { describe, it, expect, afterAll, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// A GENERATED TAKE (core/generated-take.ts): no recording -- the script read
// in a generated voice (HeyGen or ElevenLabs), a HeyGen look lip-synced to
// it in one call, and the file attached like a booth take of every scene.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-gentake-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
process.env.MP_ACTOR_POLL_MS = "20";
const T = "t", P = "proj_gen";

afterAll(async () => { vi.unstubAllGlobals(); delete process.env.HEYGEN_API_KEY; delete process.env.ELEVENLABS_API_KEY; await fs.rm(DATA, { recursive: true, force: true }); });

const info = async (f: string) => { try { await run("ffmpeg", ["-hide_banner", "-i", f]); return ""; } catch (e: any) { return String(e.stderr || ""); } };
const dur = async (f: string) => { const m = (await info(f)).match(/Duration: (\d+):(\d+):([\d.]+)/)!; return +m[1] * 3600 + +m[2] * 60 + +m[3]; };

describe("generated take: the script performed with no recording", () => {
  it("voices the whole read in one pass; a voice that refuses pause marks is read line by line", async () => {
    await fs.mkdir(DATA, { recursive: true });
    const line = path.join(DATA, "fb.mp3");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=1", "-c:a", "libmp3lame", line]);
    const mp3 = await fs.readFile(line);
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
      if (u.startsWith("https://api.heygen.com/v3/voices?type=private")) return json({ data: [], has_more: false });
      if (u === "https://api.heygen.com/v3/voices/speech") {
        const b = JSON.parse(init.body); bodies.push(b);
        return b.input_type === "ssml" ? json({ error: { message: "ssml not supported for this voice" } }, 400) : json({ data: { audio_url: "https://cdn/fb.mp3" } });
      }
      if (u === "https://cdn/fb.mp3") return new Response(mp3, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.HEYGEN_API_KEY = "hk";
    const { speakScript } = await import("../src/core/generated-take.js");
    const wd = path.join(DATA, "fb-work"); await fs.mkdir(wd, { recursive: true });
    const wav = await speakScript(["One.", "Two.\n(pause)\nThree."], { provider: "heygen", id: "v_fb" }, wd);
    expect(bodies[0].input_type).toBe("ssml");                                     // tried as one read first
    expect(bodies.slice(1).map((b) => b.text)).toEqual(["One.", "Two.", "Three."]);  // then line by line
    expect(Math.abs((await dur(wav)) - 4.6)).toBeLessThan(0.15);                     // 3 lines + 0.6 s + 1 s
  }, 60000);

  it("names a speech engine the HeyGen voice allows: its saved default, else the best it offers", async () => {
    const { pickHeygenEngine } = await import("../src/core/generated-take.js");
    expect(pickHeygenEngine({ engines: ["starfish", "elevenlabs_v3"], default_engine: "starfish" })).toBe("starfish");
    expect(pickHeygenEngine({ engines: ["starfish", "elevenlabs_v3"] })).toBe("elevenlabs_v3");
    expect(pickHeygenEngine({ engines: ["orca"], default_engine: "elevenlabs" })).toBe("orca");   // a saved engine it no longer allows
    expect(pickHeygenEngine(undefined)).toBeNull();                                               // unknown: HeyGen's choice
  });

  it("reads lines, not marks: (pause) lines split a scene, asterisks go", async () => {
    const { spokenParts } = await import("../src/core/generated-take.js");
    expect(spokenParts("Old chimps *know* things.\n(pause)\nThey remember.\n\nAll of it.")).toEqual([["Old chimps know things."], ["They remember.", "All of it."]]);
    expect(spokenParts("  \n(pause)\n")).toEqual([]);
  });

  it("voices every scene, sends the read to HeyGen once, attaches the file as the whole film's take", async () => {
    const pdir = path.join(DATA, T, "projects", P);
    await fs.mkdir(pdir, { recursive: true });
    await fs.writeFile(path.join(pdir, "project.json"), JSON.stringify({
      project_id: P, tenant_id: T, name: "x", format: "video", status: "generated", canvas: { width: 1080, height: 1920, fps: 30 },
      treatment: { filmGrammar: "speaker" },
      storyboard: { scenes: [{ voiceover_text: "First line." }, { voiceover_text: "" }, { voiceover_text: "Second.\n(pause)\nThird." }] },
      scenes: [],
    }));
    await fs.mkdir(path.join(DATA, T, "cast"), { recursive: true });
    await fs.writeFile(path.join(DATA, T, "cast", "cast.json"), JSON.stringify([
      { id: "sofa", name: "Marc on the sofa", portrait: "cast/sofa.jpg", heygen_look_id: "lk_sofa", created_at: "x" },
      { id: "painter", name: "Painter", portrait: "cast/p.jpg", created_at: "x" },
    ]));
    const line = path.join(DATA, "line.mp3");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=1", "-c:a", "libmp3lame", line]);
    const hg = path.join(DATA, "hg.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:s=540x960:r=25:d=6", "-f", "lavfi", "-i", "sine=frequency=500:duration=6",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", hg]);
    const mp3 = await fs.readFile(line), mp4 = await fs.readFile(hg);
    const speech: any[] = [], tts: string[] = [], gens: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u === "https://api.heygen.com/v3/avatars/looks/lk_sofa") return json({ data: { id: "lk_sofa", avatar_type: "photo_avatar", supported_api_engines: ["avatar_v"], default_voice_id: "marc_voice", status: "completed" } });
      if (u.startsWith("https://api.heygen.com/v3/voices?type=private")) return json({ data: [{ voice_id: "marc_voice", name: "Marc", available_engines: ["starfish", "elevenlabs"], default_engine: null }], has_more: false });
      if (u === "https://api.heygen.com/v3/voices/speech") { speech.push(JSON.parse(init.body)); return json({ data: { audio_url: "https://cdn/line.mp3", duration: 1 } }); }
      if (u.startsWith("https://api.elevenlabs.io/v1/text-to-speech/roger")) { tts.push(JSON.parse(init.body).text); return new Response(mp3, { status: 200 }); }
      if (u === "https://cdn/line.mp3") return new Response(mp3, { status: 200 });
      if (u === "https://api.heygen.com/v3/assets") return json({ data: { asset_id: "aud1" } });
      if (u === "https://api.heygen.com/v3/videos") { gens.push(JSON.parse(init.body)); return json({ data: { video_id: "v1" } }); }
      if (u === "https://api.heygen.com/v3/videos/v1") return json({ data: { status: "completed", video_url: "https://cdn/hg.mp4" } });
      if (u === "https://cdn/hg.mp4") return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.HEYGEN_API_KEY = "hk"; process.env.ELEVENLABS_API_KEY = "ek";
    const { startGeneratedTake, getGeneratedTakeStatus } = await import("../src/core/generated-take.js");
    const attached: string[] = [];
    const attach = async (url: string) => { attached.push(url); return { status: 200, body: { ok: true } }; };
    await expect(startGeneratedTake(T, P, { actor: "painter" }, attach)).rejects.toThrow(/HeyGen voice/);          // a portrait has no HeyGen voice of its own
    await expect(startGeneratedTake(T, P, { actor: "sofa", voice: "elevenlabs" }, attach)).rejects.toThrow(/ElevenLabs voice/);

    // HeyGen's voice: the look's own when none is named.
    let st = await startGeneratedTake(T, P, { actor: "sofa" }, attach);
    expect(st.voice).toEqual({ provider: "heygen", id: "marc_voice" });
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getGeneratedTakeStatus(T, P))!; }
    expect(st.status, st.error).toBe("done");
    // ONE call for the whole read, pauses marked: the empty scene skipped, 0.6 s between scenes, 1 s at a pause.
    expect(speech).toHaveLength(1);
    expect(speech[0]).toMatchObject({ voice_id: "marc_voice", engine: "elevenlabs", input_type: "ssml" });   // an engine the voice allows, named
    expect(speech[0].text).toBe('<speak>First line. <break time="0.6s"/> Second. <break time="1.0s"/> Third.</speak>');
    expect(gens).toHaveLength(1);
    expect(gens[0]).toMatchObject({ type: "avatar", avatar_id: "lk_sofa", audio_asset_id: "aud1", aspect_ratio: "9:16", engine: { type: "avatar_v" }, resolution: "1080p" });
    // Avatar V gets a direction for its invented movement: a grounded presenter by default.
    const { DEFAULT_MOTION } = await import("../src/core/generated-take.js");
    expect(gens[0].motion_prompt).toBe(DEFAULT_MOTION);
    expect(st.motion).toBe(DEFAULT_MOTION);
    expect(attached).toHaveLength(1);
    expect(attached[0]).toMatch(new RegExp(`^/assets/${T}/projects/${P}/assets/take-generated-.*\\.mp4$`));
    const file = path.join(DATA, T, "projects", P, "assets", path.basename(attached[0]));
    // Our read (one pass) under HeyGen's picture.
    expect(Math.abs((await dur(file)) - 1)).toBeLessThan(0.15);
    expect(st.url).toBe(attached[0]);

    // ElevenLabs: a named voice, the same one call to HeyGen.
    st = await startGeneratedTake(T, P, { actor: "sofa", voice: "elevenlabs", voice_id: "roger" }, attach);
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getGeneratedTakeStatus(T, P))!; }
    expect(st.status, st.error).toBe("done");
    expect(tts).toEqual(['First line. <break time="0.6s"/> Second. <break time="1.0s"/> Third.']);   // ElevenLabs: one call, break tags, no SSML wrapper
    expect(gens).toHaveLength(2);

    // A failed attach is a failed take.
    st = await startGeneratedTake(T, P, { actor: "sofa", voice_id: "other" }, async () => ({ status: 400, body: { error: "not a person film" } }));
    for (let i = 0; i < 300 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getGeneratedTakeStatus(T, P))!; }
    expect(st).toMatchObject({ status: "failed", error: "not a person film" });
  }, 120000);

  it("Kling and Runway perform a script too: the portrait animated from the voice (Kling in pieces of at most a minute; Runway through an avatar made once)", async () => {
    const pdir = path.join(DATA, T, "projects", "proj_kr");
    await fs.mkdir(pdir, { recursive: true });
    // A long read: 70 s of lines -- over Kling's minute a call.
    const long = Array.from({ length: 7 }, (_, i) => `Line ${i + 1}.`).join("\n(pause)\n");
    await fs.writeFile(path.join(pdir, "project.json"), JSON.stringify({
      project_id: "proj_kr", tenant_id: T, name: "x", format: "video", status: "generated", canvas: { width: 360, height: 640, fps: 30 },
      treatment: { filmGrammar: "speaker" }, storyboard: { scenes: [{ voiceover_text: long }] }, scenes: [],
    }));
    const portrait = path.join(DATA, T, "cast", "p.jpg");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=256x320", "-frames:v", "1", portrait]);
    await fs.writeFile(path.join(DATA, T, "cast", "cast.json"), JSON.stringify([{ id: "cust", name: "Customer", portrait: "cast/p.jpg", consent: { at: "x" }, created_at: "x" }]));
    // The one-pass read comes back as 69 s of voice with its pauses in it (silence at each break).
    const line = path.join(DATA, "read69.mp3");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=69",
      "-af", "volume='if(lt(mod(t,10),9),1,0)':eval=frame", "-c:a", "libmp3lame", line]);
    const clip = path.join(DATA, "clip.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:s=256x320:r=25:d=40", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", clip]);
    const mp3 = await fs.readFile(line), mp4 = await fs.readFile(clip);
    const kav: any[] = []; let avatarsMade = 0, avatarVideos = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.startsWith("https://api.elevenlabs.io/v1/text-to-speech/roger")) return new Response(mp3, { status: 200 });
      if (u === "https://queue.fal.run/fal-ai/kling-video/ai-avatar/v2/pro") { kav.push(JSON.parse(init.body)); return json({ status_url: "https://q/as", response_url: "https://q/ar" }); }
      if (u === "https://q/as") return json({ status: "COMPLETED" });
      if (u === "https://q/ar") return json({ video: { url: "https://cdn/clip.mp4" } });
      if (u === "https://api.dev.runwayml.com/v1/avatars" && init?.method === "POST") { avatarsMade++; const b = JSON.parse(init.body); expect(b.referenceImage).toMatch(/^data:image\/jpeg;base64,/); return json({ id: "av1", status: "PROCESSING" }); }
      if (u === "https://api.dev.runwayml.com/v1/avatars/av1") return json({ id: "av1", status: "READY" });
      if (u === "https://api.dev.runwayml.com/v1/avatar_videos") { avatarVideos++; const b = JSON.parse(init.body); expect(b).toMatchObject({ model: "gwm1_avatars", avatar: { type: "custom", avatarId: "av1" }, speech: { type: "audio" } }); return json({ id: "task1" }); }
      if (u === "https://api.dev.runwayml.com/v1/tasks/task1") return json({ status: "SUCCEEDED", output: ["https://cdn/clip.mp4"] });
      if (u === "https://cdn/clip.mp4") return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.FAL_KEY = "fk"; process.env.RUNWAYML_API_SECRET = "rk"; process.env.ELEVENLABS_API_KEY = "ek";
    const { startGeneratedTake, getGeneratedTakeStatus } = await import("../src/core/generated-take.js");
    const attached: string[] = [];
    const attach = async (url: string) => { attached.push(url); return { status: 200, body: { ok: true } }; };
    const finish = async (st: any) => { for (let i = 0; i < 600 && st.status === "running"; i++) { await new Promise((r) => setTimeout(r, 100)); st = (await getGeneratedTakeStatus(T, "proj_kr"))!; } return st; };

    let st = await finish(await startGeneratedTake(T, "proj_kr", { actor: "cust", performer: "kling", voice: "elevenlabs", voice_id: "roger" }, attach));
    expect(st.status, st.error).toBe("done");
    // 69 s of read (7 lines with their pauses), voiced in one pass: two Kling calls, cut at a pause.
    expect(kav.length).toBe(2);
    expect(kav[0].image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(kav[0].audio_url).toMatch(/^data:audio\/mpeg;base64,/);
    const file = path.join(DATA, T, "projects", "proj_kr", "assets", path.basename(attached[0]));
    expect(Math.abs((await dur(file)) - 69)).toBeLessThan(0.3);

    st = await finish(await startGeneratedTake(T, "proj_kr", { actor: "cust", performer: "runway", voice: "elevenlabs", voice_id: "roger" }, attach));
    expect(st.status, st.error).toBe("done");
    expect([avatarsMade, avatarVideos]).toEqual([1, 1]);
    // The avatar is remembered beside the portrait: the next film reuses it.
    expect(JSON.parse(await fs.readFile(path.join(DATA, T, "cast", "p.runway.json"), "utf8"))).toEqual({ avatar_id: "av1" });
    st = await finish(await startGeneratedTake(T, "proj_kr", { actor: "cust", performer: "runway", voice: "elevenlabs", voice_id: "roger", }, attach));
    expect(st.status, st.error).toBe("done");
    delete process.env.FAL_KEY; delete process.env.RUNWAYML_API_SECRET;
  }, 180000);
});
