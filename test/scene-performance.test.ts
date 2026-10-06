import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// SCENES PERFORMED BY A CAST ACTOR (core/scene-performance.ts) -- the
// pipeline Marc asked for on Oct 4 ("do them all"): an actor defined by a
// model sheet, a start frame drawn for the scene's shot, the scene's line
// voiced, Seedance 2.5 performing it, the result the scene's take; scenes
// cast one by one (a recast of some, a performance of others); b-roll of the
// actor with no speech.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-scene-perf-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
process.env.MP_PUBLIC_URL = "https://mm.example";
process.env.MP_ACTOR_POLL_MS = "2";
const T = "t", P = "proj_perf";

afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });
afterEach(() => { vi.unstubAllGlobals(); });

const until = async (fn: () => Promise<boolean>, ms = 20000) => {
  const t0 = Date.now();
  while (!(await fn())) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 25)); }
};

async function media(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  const png = path.join(dir, "frame.png"), mp3 = path.join(dir, "voice.mp3"), mp4 = path.join(dir, "out.mp4");
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=1024x1536", "-frames:v", "1", png]);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-c:a", "libmp3lame", mp3]);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=270x480:rate=24:duration=4", "-f", "lavfi", "-i", "sine=frequency=300:duration=4",
    "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", mp4]);
  return { png: await fs.readFile(png), mp3: await fs.readFile(mp3), mp4: await fs.readFile(mp4) };
}

async function seed() {
  const tdir = path.join(DATA, T);
  await fs.mkdir(path.join(tdir, "assets"), { recursive: true });
  for (const [n, s] of [["dana.png", "752x1344"], ["sheet.png", "2048x1152"]] as const) {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=gray:s=${s}`, "-frames:v", "1", path.join(tdir, "assets", n)]);
  }
  const { addActor } = await import("../src/core/cast.js");
  await addActor(T, { name: "Dana", image: "assets/dana.png", sheet: "assets/sheet.png", fictional: true, voice_id: "v_bella", voice_name: "Bella" });
  const pdir = path.join(tdir, "projects", P);
  await fs.mkdir(path.join(pdir, "assets"), { recursive: true });
  await fs.writeFile(path.join(pdir, "project.json"), JSON.stringify({
    project_id: P, tenant_id: T, name: "Perf", format: "video", status: "generated", canvas: { width: 1080, height: 1920, fps: 30 },
    created_at: "2026-10-04T00:00:00.000Z", updated_at: "2026-10-04T00:00:00.000Z",
    treatment: { filmGrammar: "speaker" },
    storyboard: { scenes: [
      { label: "Hook", purpose: "", template: "", voiceover_text: "Someone fills out your form. Then what?", components: [] },
      { label: "Proof", purpose: "", template: "", voiceover_text: "Quotient follows up with every lead.", components: [] },
    ] },
    scenes: [{ id: "s1", duration_seconds: 4, components: [] }, { id: "s2", duration_seconds: 4, components: [] }],
  }));
}

describe("the Seedance client (Atlas)", () => {
  it("names the references, drafts at 480p, finishes a draft at 1080p, and resumes a kept job", async () => {
    process.env.ATLASCLOUD_API_KEY = "ak";
    const sent: any[] = [];
    let polls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      if (init?.method === "POST") { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: `p${sent.length}` } })); }
      polls++;
      return new Response(JSON.stringify({ data: polls % 2 ? { status: "processing" } : { status: "completed", outputs: ["https://cdn/v.mp4"], draft_id: "d1" } }));
    }));
    const sd = await import("../src/core/seedance.js");
    const ids: string[] = [];
    const r = await sd.seedanceShot({ images: ["https://x/f.jpg", "https://x/s.jpg"], audio: "https://x/v.mp3", prompt: sd.speakingPrompt("Walks toward the camera"), seconds: 9.4, ratio: "9:16", onSubmit: (id) => { ids.push(id); } });
    expect(r).toMatchObject({ url: "https://cdn/v.mp4", draftId: "d1", predictionId: "p1" });
    expect(ids).toEqual(["p1"]);
    expect(sent[0]).toMatchObject({ model: "bytedance/seedance-2.5/reference-to-video", reference_images: ["https://x/f.jpg", "https://x/s.jpg"], reference_audios: ["https://x/v.mp3"],
      duration: 10, ratio: "9:16", resolution: "480p", draft: true, generate_audio: true, watermark: false });
    expect(sent[0].prompt).toMatch(/^@Image1 is the first frame of the video\. @Image2 is the character sheet \(the same person\)\. @Audio1 is the reference audio\. /);
    expect(sent[0].prompt).toMatch(/Walks toward the camera\. They speak exactly the words in the reference audio/);
    await sd.seedanceFinal("d1");
    expect(sent[1]).toEqual({ model: "bytedance/seedance-2.5/draft-complete", draft_id: "d1", watermark: false });
    // A kept prediction is polled, never paid for again.
    await sd.seedanceShot({ images: ["https://x/f.jpg"], prompt: "x", seconds: 5, ratio: "9:16", resume: "p9" });
    expect(sent).toHaveLength(2);
    expect(sd.seedanceRatio(1920, 1080)).toBe("16:9");
  });
});

describe("a scene performed by a cast actor", () => {
  it("draws a frame from the portrait and sheet, voices the line in the actor's voice, drafts, attaches as the scene's take, then finishes the draft at 1080p", async () => {
    await seed();
    process.env.ATLASCLOUD_API_KEY = "ak"; process.env.OPENAI_API_KEY = "ok"; process.env.ELEVENLABS_API_KEY = "ek";
    const m = await media(path.join(DATA, "_media"));
    const calls = { edits: 0, edit_images: 0, tts: [] as string[], atlas: [] as any[] };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u === "https://api.openai.com/v1/images/edits") {
        calls.edits++; calls.edit_images = (init.body as FormData).getAll("image[]").length;
        return new Response(JSON.stringify({ data: [{ b64_json: m.png.toString("base64") }] }));
      }
      if (u.startsWith("https://api.elevenlabs.io/v1/text-to-speech/v_bella")) { calls.tts.push(JSON.parse(init.body).text); return new Response(m.mp3); }
      if (u === "https://api.atlascloud.ai/api/v1/model/generateVideo") { calls.atlas.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: `pred${calls.atlas.length}` } })); }
      if (u.startsWith("https://api.atlascloud.ai/api/v1/model/prediction/")) return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn/perf.mp4"], draft_id: "draft-9" } }));
      if (u === "https://cdn/perf.mp4") return new Response(m.mp4);
      throw new Error("unexpected fetch " + u);
    }));
    const sp = await import("../src/core/scene-performance.js");
    const attached: any[] = [];
    sp.registerSceneAttacher(async (tenant, project, url, si, extra) => { attached.push({ tenant, project, url, si, extra }); return { status: 200, body: { ok: true } }; });

    // The frame first (cheap, redrawn until right).
    await sp.startSceneFrame(T, P, 0, { actor: "dana", shot: "Walks toward the camera down a bright office hallway, medium-wide" });
    await until(async () => (await sp.getScenePerformances(T, P))[0].performance?.status === "done");
    let s0 = (await sp.getScenePerformances(T, P))[0];
    expect(calls.edit_images).toBe(2);                         // the portrait and the sheet
    const { framePrompt } = await import("../src/core/scene-performance.js");
    expect(framePrompt("Sitting on a couch, wide shot", true, true)).toMatch(/Sitting on a couch, wide shot\. A vertical photograph from a real camera, framed exactly as described/);
    expect(framePrompt("x", true, true)).not.toMatch(/head and shoulders/);
    expect(s0.performance.frames).toHaveLength(1);
    expect(s0.performance.frame).toMatch(/^\/assets\/t\/projects\/proj_perf\/assets\/frame-dana-.*\.jpg$/);
    const probe = await run("ffmpeg", ["-hide_banner", "-i", path.join(DATA, s0.performance.frame.replace(/^\/assets\//, ""))]).then(() => "", (e: any) => String(e.stderr));
    expect(probe).toMatch(/720x1280/);                         // cut to the film's 9:16

    // The draft.
    await sp.startScenePerformance(T, P, 0, {});
    await until(async () => (await sp.getScenePerformances(T, P))[0].performance?.status === "done" && attached.length === 1);
    s0 = (await sp.getScenePerformances(T, P))[0];
    expect(calls.tts[0]).toBe("Someone fills out your form. Then what?");
    expect(calls.atlas[0].reference_images).toHaveLength(2);
    expect(calls.atlas[0].reference_images[0]).toMatch(/^https:\/\/mm\.example\/output\/t\/projects\/proj_perf\/_perform\/.*frame-dana-/);
    expect(calls.atlas[0].reference_audios[0]).toMatch(/_perform\/.*voice\.mp3$/);
    expect(calls.atlas[0]).toMatchObject({ draft: true, resolution: "480p", ratio: "9:16", duration: 4 });
    expect(calls.atlas[0].prompt).toMatch(/Walks toward the camera down a bright office hallway, medium-wide\./);
    expect(attached[0]).toMatchObject({ si: 0, extra: { performed_by: { actor: "dana", engine: "seedance", quality: "draft" } } });
    expect(attached[0].url).toMatch(/^\/assets\/t\/projects\/proj_perf\/assets\/take-performed-dana-s1-draft-/);
    expect(s0.performance.draft).toMatchObject({ draft_id: "draft-9" });

    // The final: the same shot from the draft's id, nothing sent again.
    await sp.startScenePerformance(T, P, 0, { quality: "final" });
    await until(async () => attached.length === 2 && (await sp.getScenePerformances(T, P))[0].performance?.status === "done");
    expect(calls.atlas[1]).toEqual({ model: "bytedance/seedance-2.5/draft-complete", draft_id: "draft-9", watermark: false });
    expect(calls.tts).toHaveLength(1);                         // the final reuses the voice the draft was made to
    expect(attached[1].extra.performed_by.quality).toBe("final");
    expect((await sp.getScenePerformances(T, P))[0].performance.final.url).toMatch(/-final-/);

    // A new shot is a new performance: the draft no longer stands.
    await sp.startScenePerformance(T, P, 0, { shot: "Close-up at her desk", quality: "final" });
    await until(async () => attached.length === 3);
    expect(calls.atlas[2].model).toBe("bytedance/seedance-2.5/reference-to-video");
    expect(calls.atlas[2]).toMatchObject({ draft: false, resolution: "1080p" });
  }, 60000);

  it("b-roll of the actor: a silent 720p shot laid over the scene from `at` for its length", async () => {
    const m = await media(path.join(DATA, "_media2"));
    const atlas: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.endsWith("/images/edits")) return new Response(JSON.stringify({ data: [{ b64_json: m.png.toString("base64") }] }));
      if (u.endsWith("/generateVideo")) { atlas.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: "c1" } })); }
      if (u.includes("/prediction/")) return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn/clip.mp4"] } }));
      if (u === "https://cdn/clip.mp4") return new Response(m.mp4);
      throw new Error("unexpected fetch " + u);
    }));
    const sp = await import("../src/core/scene-performance.js");
    await sp.startActorClip(T, P, 1, { actor: "dana", shot: "Sips a coffee at her desk, looking out the window", seconds: 6, at: 1.5 });
    await until(async () => (await sp.getScenePerformances(T, P))[1].actor_clips?.[0]?.status === "done");
    expect(atlas[0]).toMatchObject({ draft: false, resolution: "720p", duration: 6 });
    expect(atlas[0].reference_audios).toBeUndefined();
    expect(atlas[0].prompt).toMatch(/move naturally the whole time, from the very first frame/);   // a silent cutaway still moves
    expect(atlas[0].prompt).toMatch(/no music/);
    const proj = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8"));
    const comp = proj.scenes[1].components.find((c: any) => c.data?.actor_clip === "dana");
    expect(comp).toMatchObject({ type: "video", enter: { effect: "cut", at: 1.5 }, exit: { effect: "cut", at: 7.5 }, data: { object_fit: "cover", at: 1.5, exit_at: 7.5 } });
    // The video component times itself from data.at / exit_at: the clip plays from its own first frame.
    const vid = await fs.readFile(path.join(process.cwd(), "src/components/media/video.component.html"), "utf8");
    expect(vid).toMatch(/var timedStart = timed && \(at > 0 \|\| clipIn > 0\) \? clipIn - at : startAt;/);
    expect(comp.data.clip_in).toBeUndefined();                 // shown for its whole 6 s: nothing to skip
    const clipFile = path.join(DATA, comp.data.src.replace(/^\/assets\//, ""));
    const info = await run("ffmpeg", ["-hide_banner", "-i", clipFile]).then(() => "", (e: any) => String(e.stderr));
    expect(info).not.toMatch(/Audio:/);                        // silent: the scene's voice plays under it
    expect(proj.storyboard.scenes[1].components.filter((c: any) => c.data?.actor_clip)).toHaveLength(1);

    // A MONTAGE: several clips in one scene, each a 4 s shot shown for a beat,
    // a one-off place with no location; a new clip at the same start replaces that one.
    await sp.startActorClip(T, P, 1, { actor: "dana", shot: "Talks into her phone while driving", at: 0, show: 0.6, location: "" });
    await until(async () => ((await sp.getScenePerformances(T, P))[1].actor_clips || []).filter((c: any) => c.status === "done").length === 2);
    expect(atlas[1]).toMatchObject({ duration: 4 });           // Seedance's minimum, shown 0.6 s
    expect(atlas[1].reference_images).toHaveLength(2);         // the frame and the sheet: no room
    let p2 = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8"));
    let clips = p2.storyboard.scenes[1].components.filter((c: any) => c.data?.actor_clip);
    expect(clips.map((c: any) => [c.enter.at, c.exit.at])).toEqual([[1.5, 7.5], [0, 0.6]]);
    expect(clips[1].data.clip_in).toBe(1);                     // a 4 s shot shown 0.6 s starts 1 s in: past Seedance's ease-in
    expect(p2.scenes[1].components.filter((c: any) => c.data?.actor_clip)).toHaveLength(2);
    await sp.startActorClip(T, P, 1, { actor: "dana", shot: "Walks in a park, phone at her mouth", at: 0, show: 1.2, location: "" });
    await until(async () => { const x = (await sp.getScenePerformances(T, P))[1].actor_clips.find((c: any) => c.at === 0); return x?.status === "done" && x.show === 1.2; });
    p2 = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8"));
    clips = p2.storyboard.scenes[1].components.filter((c: any) => c.data?.actor_clip);
    expect(clips.map((c: any) => [c.enter.at, c.exit.at])).toEqual([[1.5, 7.5], [0, 1.2]]);
    expect(p2.storyboard.scenes[1].actor_clips.map((c: any) => c.at)).toEqual([0, 1.5]);
    // A clip timed to words keeps its words when it is made again.
    const pj = path.join(DATA, T, "projects", P, "project.json");
    const disk = JSON.parse(await fs.readFile(pj, "utf8"));
    const atZero = (c: any) => c.data?.actor_clip && c.data.clip_at === 0;
    for (const list of [disk.storyboard.scenes[1].components, disk.scenes[1].components]) {
      const c = list.find(atZero); c.anchors = { at: { word: "coffee" } }; c.data.at = 2.2; c.enter.at = 2.2;
    }
    await fs.writeFile(pj, JSON.stringify(disk));
    await sp.startActorClip(T, P, 1, { actor: "dana", shot: "Walks faster in the park, phone at her mouth", at: 0, show: 1.2, location: "" });
    await until(async () => { const x = (await sp.getScenePerformances(T, P))[1].actor_clips.find((c: any) => c.at === 0); return x?.status === "done" && /faster/.test(x.shot); });
    const remade = JSON.parse(await fs.readFile(pj, "utf8")).scenes[1].components.find(atZero);
    expect(remade.anchors).toEqual({ at: { word: "coffee" } });
    expect([remade.data.at, remade.enter.at]).toEqual([2.2, 2.2]);
    expect(p2.storyboard.scenes[1].actor_clip).toBeUndefined();   // one list, no "last one touched" copy
  }, 60000);
});

describe("any prompt for any scene", () => {
  it("a written frame or video prompt is used in full, a draft made on another prompt is not finished, and '' goes back to the default", async () => {
    process.env.ATLASCLOUD_API_KEY = "ak"; process.env.OPENAI_API_KEY = "ok"; process.env.ELEVENLABS_API_KEY = "ek";
    const m = await media(path.join(DATA, "_media3"));
    const prompts: string[] = [], atlas: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.endsWith("/images/edits")) { prompts.push(String((init.body as FormData).get("prompt"))); return new Response(JSON.stringify({ data: [{ b64_json: m.png.toString("base64") }] })); }
      if (u.includes("/text-to-speech/")) return new Response(m.mp3);
      if (u.endsWith("/generateVideo")) { atlas.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: `q${atlas.length}` } })); }
      if (u.includes("/prediction/")) return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn/p.mp4"], draft_id: "dd" } }));
      if (u === "https://cdn/p.mp4") return new Response(m.mp4);
      throw new Error("unexpected fetch " + u);
    }));
    const sp = await import("../src/core/scene-performance.js");
    sp.registerSceneAttacher(async () => ({ status: 200, body: {} }));
    const done = async () => (await sp.getScenePerformances(T, P))[1].performance?.status === "done";
    // The defaults are shown, built from the shot.
    let s1 = (await sp.getScenePerformances(T, P))[1];
    expect(s1.defaults.video_prompt).toMatch(/^@Image1 is the first frame of the video\. @Image2 is the character sheet/);
    const FP = "Dana sits on a grey couch in a sunlit loft, wide shot, whole body in frame, the room sharp and in focus.";
    await sp.startSceneFrame(T, P, 1, { actor: "dana", shot: "On a couch, wide", frame_prompt: FP });
    await until(done);
    expect(prompts.at(-1)).toBe(FP);
    s1 = (await sp.getScenePerformances(T, P))[1];
    expect(s1.performance.frame_prompt).toBe(FP);
    expect(s1.performance.frames.at(-1).prompt).toBe(FP);
    const VP = "@Image1 is the first frame. @Image2 is her sheet. @Audio1 is her voice. She sits back on the couch and talks to the camera, the room in focus.";
    await sp.startScenePerformance(T, P, 1, { video_prompt: VP });
    await until(done);
    expect(atlas.at(-1).prompt).toBe(VP);                     // used in full, the references not named twice
    // Another video prompt: the draft made on the old one is not finished.
    await sp.startScenePerformance(T, P, 1, { video_prompt: "She laughs, then talks to the camera.", quality: "final" });
    await until(async () => atlas.length === 2 && await done());
    expect(atlas[1].model).toBe("bytedance/seedance-2.5/reference-to-video");
    expect(atlas[1].prompt).toMatch(/^@Image1 is the first frame of the video\. .*She laughs, then talks to the camera\.$/);
    // '' goes back to the default.
    await sp.startScenePerformance(T, P, 1, { frame_prompt: "", video_prompt: "" });
    await until(async () => atlas.length === 3 && await done());
    s1 = (await sp.getScenePerformances(T, P))[1];
    expect(s1.performance.frame_prompt).toBeUndefined();
    expect(s1.performance.video_prompt).toBeUndefined();
    expect(atlas[2].prompt).toBe(s1.defaults.video_prompt);
  }, 60000);
});

describe("linking scenes: start from the last frame", () => {
  it("cuts the frame the previous scene ends on (at its trim, in the film's shape) and makes it this scene's start frame", async () => {
    const m = await media(path.join(DATA, "_media4"));
    const pdir = path.join(DATA, T, "projects", P);
    await fs.writeFile(path.join(pdir, "assets", "s1take.mp4"), m.mp4);
    const pf = path.join(pdir, "project.json");
    const disk = JSON.parse(await fs.readFile(pf, "utf8"));
    const src = `/assets/${T}/projects/${P}/assets/s1take.mp4`;
    disk.takes = [{ id: "take_0", scene_index: 0, source: src, recorded_at: "", performed_by: { actor: "dana", engine: "seedance", quality: "draft" } }];
    disk.speaker_track = { clips: [{ source: src, scene_index: 0, start: 0, trim_start: 0, trim_end: 3 }] };
    await fs.writeFile(pf, JSON.stringify(disk));
    const sp = await import("../src/core/scene-performance.js");
    const perf = await sp.continueSceneFrom(T, P, 1, { actor: "dana", from_scene: 0 });
    expect(perf.frame).toMatch(/frame-dana-from-s1-.*\.jpg$/);
    expect(perf.frames!.at(-1)).toMatchObject({ from_scene: 0, url: perf.frame });
    const info = await run("ffmpeg", ["-hide_banner", "-i", path.join(DATA, perf.frame!.replace(/^\/assets\//, ""))]).then(() => "", (e: any) => String(e.stderr));
    expect(info).toMatch(/720x1280/);                          // 270x480 take, cut and scaled to the 9:16 frame
    await expect(sp.continueSceneFrom(T, P, 1, { actor: "dana", from_scene: 1 })).rejects.toThrow(/another scene/);
    await expect(sp.continueSceneFrom(T, P, 0, { actor: "dana", from_scene: 1 })).rejects.toThrow(/no take to continue from/);
  }, 60000);
});

describe("the pitch check, before Seedance is paid", () => {
  it("measures the voice, compares it with the actor's other scenes, stops a voice 10%+ off without calling Seedance, and force makes it anyway", async () => {
    process.env.ATLASCLOUD_API_KEY = "ak"; process.env.OPENAI_API_KEY = "ok"; process.env.ELEVENLABS_API_KEY = "ek";
    const d = path.join(DATA, "_pitchcheck"); await fs.mkdir(d, { recursive: true });
    const tone = (hz: number) => `aevalsrc='0.5*sin(2*PI*${hz}*t)+0.25*sin(2*PI*${2 * hz}*t)':s=44100:d=3`;
    const low = path.join(d, "low.mp3");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", tone(160), "-c:a", "libmp3lame", low]);
    // Scene 1's take: Dana at ~200 Hz.
    const pdir = path.join(DATA, T, "projects", P);
    const s1 = path.join(pdir, "assets", "take-performed-dana-s1-draft-pc.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=270x480:rate=24:duration=3", "-f", "lavfi", "-i", tone(200),
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", s1]);
    const sp = await import("../src/core/scene-performance.js");
    expect(Math.abs((await sp.voicePitch(low, d)) - 160)).toBeLessThan(6);
    const pf = path.join(pdir, "project.json");
    const disk = JSON.parse(await fs.readFile(pf, "utf8"));
    const src = `/assets/${T}/projects/${P}/assets/take-performed-dana-s1-draft-pc.mp4`;
    disk.storyboard.scenes[0].performance = { actor: "dana", shot: "couch", voice_source: "script", draft: { url: src, inputs: "", made_at: "" }, status: "done" };
    disk.storyboard.scenes[1].performance = { actor: "dana", shot: "couch", voice_source: "script", frame: disk.storyboard.scenes[0].performance.frame, status: "done" };
    disk.takes = [{ id: "take_pc", scene_index: 0, source: src, recorded_at: "", performed_by: { actor: "dana", engine: "seedance", quality: "draft" } }];
    disk.speaker_track = { clips: [{ source: src, scene_index: 0, start: 0 }] };
    await fs.writeFile(pf, JSON.stringify(disk));
    const m = await media(path.join(d, "m"));
    const atlas: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.includes("/text-to-speech/")) return new Response(await fs.readFile(low));
      if (u.endsWith("/images/edits")) return new Response(JSON.stringify({ data: [{ b64_json: m.png.toString("base64") }] }));
      if (u.endsWith("/generateVideo")) { atlas.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: "pc1" } })); }
      if (u.includes("/prediction/")) return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn/pc.mp4"], draft_id: "pcd" } }));
      if (u === "https://cdn/pc.mp4") return new Response(m.mp4);
      throw new Error("unexpected fetch " + u);
    }));
    sp.registerSceneAttacher(async () => ({ status: 200, body: {} }));
    const { updateActor } = await import("../src/core/cast.js");
    await updateActor(T, "dana", { voice_id: "v_bella", voice_name: "Bella" });
    await sp.startScenePerformance(T, P, 1, { actor: "dana", voice_source: "script" });
    await until(async () => (await sp.getScenePerformances(T, P))[1].performance?.status !== "running", 40000);
    let p2 = (await sp.getScenePerformances(T, P))[1].performance;
    expect(p2.status).toBe("failed");
    expect(p2.error).toMatch(/^Pitch check: the voice is 1[56]\d Hz, 1\d% lower than Dana's other scenes \((19|20)\d Hz\)\. Nothing was sent to Seedance\./);
    expect(p2.pitch_check).toMatchObject({ hz: expect.any(Number), reference: expect.any(Number) });
    expect(atlas).toHaveLength(0);                              // nothing paid
    expect((await sp.getScenePerformances(T, P))[0].performance.voice_hz).toBeGreaterThan(190);   // the reference, measured once and kept
    await sp.startScenePerformance(T, P, 1, { actor: "dana", voice_source: "script", force: true });
    await until(async () => (await sp.getScenePerformances(T, P))[1].performance?.status !== "running", 40000);
    p2 = (await sp.getScenePerformances(T, P))[1].performance;
    expect(p2.status).toBe("done");
    expect(p2.pitch_check).toBeUndefined();
    expect(atlas).toHaveLength(1);
  }, 120000);
});

describe("delivery: how the line is said (ElevenLabs v4)", () => {
  it("the script voice reads the delivery with v4 (tags, pauses, CAPS kept), the line when none; hear_voice makes the voice alone", async () => {
    const sp = await import("../src/core/scene-performance.js");
    expect(sp.SCRIPT_VOICE_MODEL).toBe("eleven_v4");
    expect(sp.deliveryText("Then what?\n(pause)\nFor most *teams*... nothing.")).toBe("Then what? ... For most teams... nothing.");
    expect(sp.deliveryText("ignored", "[curious] Then what? [excited] SEND more of that.")).toBe("[curious] Then what? [excited] SEND more of that.");
    process.env.ELEVENLABS_API_KEY = "ek";
    const m = await media(path.join(DATA, "_media8"));
    const tts: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      if (String(url).includes("/text-to-speech/")) { tts.push(JSON.parse(init.body)); return new Response(m.mp3); }
      throw new Error("unexpected fetch " + url);
    }));
    const D = "[curious] Your best email isn't on your calendar... [excited] It's waiting for a SIGNAL.";
    const r = await sp.previewSceneVoice(T, P, 1, { actor: "dana", voice_source: "script", delivery: D });
    expect(tts[0]).toEqual({ text: D, model_id: "eleven_v4" });
    expect(r.url).toMatch(/voice-preview-dana-s2-.*\.mp3$/);
    expect(r.hz).toBeGreaterThan(200); expect(r.delivery).toBe(D);
    expect((await sp.getScenePerformances(T, P))[1].performance.delivery).toBe(D);   // kept for the draft
    // "" goes back to the plain line.
    await sp.previewSceneVoice(T, P, 1, { voice_source: "script", delivery: "" });
    expect((await sp.getScenePerformances(T, P))[1].performance.delivery).toBeUndefined();
    expect(tts[1].text).not.toMatch(/\[/);
  }, 60000);
});

describe("the room reference: the same room in every scene", () => {
  it("labels the room (a location's plate) as the last reference image", async () => {
    const sd = await import("../src/core/seedance.js");
    expect(sd.seedanceRefs(3, true, false, true)).toBe("@Image1 is the first frame of the video. @Image2 is the character sheet (the same person). @Image3 is the room: keep this exact room, furniture, plants, windows and light throughout. @Audio1 is the reference audio.");
    expect(sd.seedanceRefs(2, true, false, true)).toBe("@Image1 is the first frame of the video. @Image2 is the room: keep this exact room, furniture, plants, windows and light throughout. @Audio1 is the reference audio.");
  });
});

describe("locations: a clean plate per set, the room of every take made there", () => {
  it("draws a plate from a prompt, cleans one from a frame (or keeps it), and a scene set there draws its frame in it and sends the plate as the room", async () => {
    process.env.ATLASCLOUD_API_KEY = "ak"; process.env.OPENAI_API_KEY = "ok"; process.env.ELEVENLABS_API_KEY = "ek";
    const m = await media(path.join(DATA, "_media_loc"));
    const pdir = path.join(DATA, T, "projects", P);
    await fs.writeFile(path.join(pdir, "assets", "frame-s1.png"), m.png);
    const calls = { gens: [] as any[], edits: [] as Array<{ prompt: string; images: number }>, atlas: [] as any[] };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.endsWith("/images/generations")) { calls.gens.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: [{ b64_json: m.png.toString("base64") }] })); }
      if (u.endsWith("/images/edits")) {
        const f = init.body as FormData;
        calls.edits.push({ prompt: String(f.get("prompt")), images: f.getAll("image[]").length });
        return new Response(JSON.stringify({ data: [{ b64_json: m.png.toString("base64") }] }));
      }
      if (u.includes("/text-to-speech/")) return new Response(m.mp3);
      if (u.endsWith("/generateVideo")) { calls.atlas.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: `lc${calls.atlas.length}` } })); }
      if (u.includes("/prediction/")) return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn/lc.mp4"], draft_id: "lcd" } }));
      if (u === "https://cdn/lc.mp4") return new Response(m.mp4);
      throw new Error("unexpected fetch " + u);
    }));
    const loc = await import("../src/core/locations.js");
    await expect(loc.addLocation(T, { name: "Nowhere" })).rejects.toThrow(/prompt .* or an image/);
    await expect(loc.addLocation(T, { name: "Out", image: "../other/x.png" })).rejects.toThrow(/file of this workspace/);

    // From a prompt: listed at once as drawing, the plate lands.
    const lounge = await loc.addLocation(T, { name: "Loft lounge", prompt: "A bright loft lounge, a grey linen couch, plants by tall windows" });
    expect(lounge).toMatchObject({ id: "loft-lounge", made_from: "prompt", status: "drawing" });
    await until(async () => !!(await loc.getLocation(T, "loft-lounge"))?.image);
    expect(calls.gens[0].prompt).toMatch(/^A bright loft lounge.*windows\. An empty set with nobody in it/);
    expect(calls.gens[0].size).toBe("1536x1024");
    expect((await loc.getLocation(T, "loft-lounge"))!.status).toBeUndefined();

    // From a frame (an asset url): the person removed, in the frame's shape.
    const frameUrl = `/assets/${T}/projects/${P}/assets/frame-s1.png`;
    await loc.addLocation(T, { name: "Office", image: frameUrl });
    await until(async () => !!(await loc.getLocation(T, "office"))?.image);
    expect(calls.edits[0]).toEqual({ prompt: loc.CLEAN_PROMPT, images: 1 });
    // Kept as it is: nothing drawn.
    const kept = await loc.addLocation(T, { name: "Office", image: frameUrl, clean: false });
    expect(kept.id).toMatch(/^office-[0-9a-f]{4}$/);
    expect(kept).toMatchObject({ made_from: "upload" });
    expect(kept.image).toBe(path.join("locations", `${kept.id}.jpg`));
    expect(calls.edits).toHaveLength(1);
    expect((await loc.listLocations(T)).map((l) => l.id)).toEqual(["loft-lounge", "office", kept.id]);

    // A scene set there: the frame is drawn in the plate.
    const sp = await import("../src/core/scene-performance.js");
    sp.registerSceneAttacher(async () => ({ status: 200, body: {} }));
    await expect(sp.setSceneLocation(T, P, 1, "attic")).rejects.toThrow(/No location "attic"/);
    const set = await sp.setSceneLocation(T, P, 1, "loft-lounge");
    expect(set.location).toBe("loft-lounge");
    expect(set.frame).toBeUndefined();
    expect(set.draft).toBeUndefined();
    const s1 = (await sp.getScenePerformances(T, P))[1];
    expect(s1.defaults.frame_prompt).toMatch(/The last reference image is the room they are in/);
    expect(s1.defaults.video_prompt).toMatch(/@Image3 is the room/);
    await sp.startScenePerformance(T, P, 1, { actor: "dana", voice_source: "script", video_prompt: "", frame_prompt: "", force: true });
    await until(async () => (await sp.getScenePerformances(T, P))[1].performance?.status !== "running", 40000);
    const done = (await sp.getScenePerformances(T, P))[1].performance;
    expect(done.error).toBeUndefined();
    expect(calls.edits[1].images).toBe(3);                  // portrait, sheet, plate
    expect(calls.edits[1].prompt).toMatch(/first two reference images .* The last reference image is the room/);
    expect(done.frames.at(-1)).toMatchObject({ url: done.frame, location: "loft-lounge" });
    expect(calls.atlas[0].reference_images).toHaveLength(3);
    expect(calls.atlas[0].reference_images[2]).toMatch(/_perform\/.*loft-lounge\.jpg$/);
    expect(calls.atlas[0].prompt).toMatch(/@Image3 is the room/);
    expect(done.draft.inputs).toMatch(/\|loft-lounge$/);

    // The same location again keeps the frame; another drops it.
    expect((await sp.setSceneLocation(T, P, 1, "loft-lounge")).frame).toBe(done.frame);
    expect((await sp.setSceneLocation(T, P, 1, "office")).frame).toBeUndefined();

    // Removed: the plate goes, and a scene still set there says so.
    expect(await loc.removeLocation(T, "office")).toBe(true);
    expect(await loc.removeLocation(T, "office")).toBe(false);
    await expect(fs.access(path.join(DATA, T, "locations", "office.jpg"))).rejects.toThrow();
    await expect(sp.startScenePerformance(T, P, 1, { actor: "dana" })).rejects.toThrow(/No location "office"/);
    expect((await sp.setSceneLocation(T, P, 1, "")).location).toBeUndefined();
  }, 90000);
});

describe("an earlier performance back as the scene's take", () => {
  it("re-attaches a take-performed file of this scene, Seedance's sound, its draft id kept for the final", async () => {
    const m = await media(path.join(DATA, "_media7"));
    const pdir = path.join(DATA, T, "projects", P);
    const name = "take-performed-dana-s1-draft-2026-10-04T13-31-36-436Z.mp4";
    await fs.writeFile(path.join(pdir, "assets", name), m.mp4);
    const sp = await import("../src/core/scene-performance.js");
    const attached: any[] = [];
    sp.registerSceneAttacher(async (tenant, proj, url, si, extra) => { attached.push({ url, si, extra }); return { status: 200, body: {} }; });
    const url = `/assets/${T}/projects/${P}/assets/${name}`;
    const perf = await sp.restoreSceneTake(T, P, 0, { url, draft_id: "d-old" });
    expect(attached[0]).toEqual({ url, si: 0, extra: { performed_by: { actor: "dana", engine: "seedance", quality: "draft" } } });
    expect(perf.draft).toMatchObject({ url, draft_id: "d-old" });
    expect(perf.final).toBeUndefined();
    await expect(sp.restoreSceneTake(T, P, 1, { url })).rejects.toThrow(/not a performance of scene 2/);
    await expect(sp.restoreSceneTake(T, P, 0, { url: `/assets/${T}/projects/${P}/assets/take-performed-dana-s1-draft-gone.mp4` })).rejects.toThrow(/gone/);
  }, 60000);
});

describe("the recording back after a performance", () => {
  it("finds the recording under a performance, converts it when asked, and re-attaches it for 'My recording'", async () => {
    const sp = await import("../src/core/scene-performance.js");
    const rec = { id: "take_0", scene_index: 0, source: "/assets/t/projects/proj_perf/assets/rec.mp4", recorded_at: "", capture: "canvas", look: "soft" };
    const perf = { id: "take_1", scene_index: 0, source: "/assets/t/projects/proj_perf/assets/perf.mp4", recorded_at: "", performed_by: { actor: "dana", engine: "seedance", quality: "draft" } };
    const project: any = { takes: [rec, perf], speaker_track: { clips: [{ source: perf.source, scene_index: 0, start: 0 }] } };
    expect(sp.sceneRecording(project, 0)).toBe(rec);
    expect(sp.sceneRecording({ takes: [perf], speaker_track: project.speaker_track }, 0)).toBeNull();
    // On disk: 'My recording' re-attaches it (its own capture and look), then casts the scene as the recording.
    const pf = path.join(DATA, T, "projects", P, "project.json");
    const disk = JSON.parse(await fs.readFile(pf, "utf8"));
    disk.takes = [rec, perf]; disk.speaker_track = project.speaker_track;
    await fs.writeFile(pf, JSON.stringify(disk));
    const attached: any[] = [];
    sp.registerSceneAttacher(async (tenant, proj, url, si, extra) => { attached.push({ url, si, extra }); return { status: 200, body: {} }; });
    expect(await sp.useSceneRecording(T, P, 0)).toEqual({ reattached: true });
    expect(attached[0]).toMatchObject({ url: rec.source, si: 0, extra: { capture: "canvas", look: "soft", correct: true, performed_by: undefined } });
    expect(JSON.parse(await fs.readFile(pf, "utf8")).storyboard.scenes[0].cast).toBeNull();
    await expect(sp.useSceneRecording(T, P, 1)).rejects.toThrow(/no recording/);
  });
});

describe("cast scene by scene", () => {
  it("a scene's cast overrides the film's: an actor, the recording (null), or the film's (absent)", async () => {
    const { syncSpeakerClips, sceneCastOf } = await import("../src/core/speaker-layer.js");
    const project: any = {
      speaker_cast: "dana",
      storyboard: { scenes: [{}, { cast: null }, { cast: "office-guy" }] },
      takes: [0, 1, 2].map((i) => ({ id: `t${i}`, scene_index: i, source: `/a/t${i}.mp4`, recorded_at: "", actors: { dana: { file: `/a/t${i}.dana.mp4`, made_at: "" }, "office-guy": { file: `/a/t${i}.og.mp4`, made_at: "" } } })),
      speaker_track: { clips: [0, 1, 2].map((i) => ({ source: `/a/t${i}.mp4`, scene_index: i, start: 0 })) },
    };
    expect([0, 1, 2].map((i) => sceneCastOf(project, i))).toEqual(["dana", null, "office-guy"]);
    syncSpeakerClips(project);
    expect(project.speaker_track.clips.map((c: any) => c.source)).toEqual(["/a/t0.dana.mp4", "/a/t1.mp4", "/a/t2.og.mp4"]);
  });

  it("setSceneCast writes the scene's cast; a recast never redraws a performed scene; clearing some scenes leaves the rest", async () => {
    const { setSceneCast, startRecast } = await import("../src/core/recast.js");
    let scenes = await setSceneCast(T, P, [1], "dana");
    expect(scenes[1]).toEqual({ scene_index: 1, cast: "dana", follows_film: false });
    scenes = await setSceneCast(T, P, [1], undefined);
    expect(scenes[1].follows_film).toBe(true);
    // Scene 1's take is a performance: nobody to recast there.
    const pf = path.join(DATA, T, "projects", P, "project.json");
    const proj = JSON.parse(await fs.readFile(pf, "utf8"));
    proj.takes = [{ id: "take_0", scene_index: 0, source: `/assets/${T}/projects/${P}/assets/p.mp4`, recorded_at: "", performed_by: { actor: "dana", engine: "seedance", quality: "draft" } }];
    proj.speaker_track = { clips: [{ source: proj.takes[0].source, scene_index: 0, start: 0 }] };
    await fs.writeFile(pf, JSON.stringify(proj));
    process.env.FAL_KEY = "fk";
    await expect(startRecast(T, P, "dana", { scenes: [0], performer: "kling" })).rejects.toThrow(/no recording to recast/);
    delete process.env.FAL_KEY;
    const st = await startRecast(T, P, null, { scenes: [0] });
    expect(st).toMatchObject({ status: "done", scenes: [0] });
    const after = JSON.parse(await fs.readFile(pf, "utf8"));
    expect(after.storyboard.scenes[0].cast).toBeNull();
    expect(after.storyboard.scenes[1].cast).toBeUndefined();
  });
});

describe("the cast plan: who, how, engine, where -- on the storyboard", () => {
  it("resolves a scene's own plan (an old film-level plan moved onto the scenes on load), picks engines, writes a line, and says ready / todo / stale", async () => {
    const cp = await import("../src/core/cast-plan.js");
    const { migrateProject } = await import("../src/persistence/project.js");
    const actors: any[] = [{ id: "dana", name: "Dana" }, { id: "marc-look", name: "Marc look", heygen_look_id: "hl1" }];
    const locs = [{ id: "loft", name: "Loft lounge" }];
    const proj: any = migrateProject({ storyboard: { cast_plan: { actor: "dana", how: "generate", location: "loft" }, scenes: [
      {}, { performer: { location: null } }, { performer: { actor: null } }, { performer: { how: "recast" } }, { performer: { actor: "marc-look" } },
    ] } });
    expect(proj.storyboard.cast_plan).toBeUndefined();                       // plans live on the scenes
    expect(proj.storyboard.scenes[1].performer).toEqual({ actor: "dana", how: "generate", location: null });   // a scene's own field wins
    const r0 = cp.resolvePlan(proj, 0, actors);
    expect(r0).toMatchObject({ actor: "dana", how: "generate", engine: "seedance", location: "loft" });
    expect(cp.planLine(r0, actors, locs)).toBe("Dana · Generate · Seedance · Loft lounge");
    expect(cp.resolvePlan(proj, 1, actors).location).toBeUndefined();          // none
    expect(cp.resolvePlan(proj, 2, actors)).toMatchObject({ actor: null });
    expect(cp.planLine(cp.resolvePlan(proj, 3, actors), actors)).toBe("Dana · Recast · Genjutsu");   // a location means nothing to a recast
    expect(cp.resolvePlan(proj, 4, actors)).toMatchObject({ actor: "marc-look", engine: "heygen" });  // a look is its own setting
    expect(cp.resolvePlan(proj, 4, actors).location).toBeUndefined();
    // No how anywhere: a cast member recasts a recording, else generates; nobody is me recording.
    const bare: any = { storyboard: { scenes: [{ performer: { actor: "dana" } }, {}] } };
    expect(cp.resolvePlan(bare, 0, actors, true).how).toBe("recast");
    expect(cp.resolvePlan(bare, 0, actors, false).how).toBe("generate");
    expect(cp.planLine(cp.resolvePlan(bare, 1, actors, true))).toBe("Me · Record");

    // No plan anywhere (a film made before plans): read off what each scene plays.
    const legacy: any = { speaker_cast: null, storyboard: { scenes: [
      { performance: { actor: "dana", draft: { url: "x" } } }, { cast: "dana" }, {},
    ] } };
    expect(cp.resolvePlan(legacy, 0, actors)).toMatchObject({ actor: "dana", how: "generate", engine: "seedance", inferred: true });
    expect(cp.planState(legacy, 0, cp.resolvePlan(legacy, 0, actors), { performed_by: { actor: "dana", engine: "seedance" } }, true).state).toBe("ready");
    expect(cp.resolvePlan(legacy, 1, actors, true)).toMatchObject({ actor: "dana", how: "recast", inferred: true });
    expect(cp.resolvePlan(legacy, 2, actors, true)).toMatchObject({ actor: null, how: "record" });
    expect(cp.resolvePlan(legacy, 2, actors, true).inferred).toBeUndefined();

    // State.
    const gen = cp.resolvePlan(proj, 0, actors);
    const sc = proj.storyboard.scenes[0];
    expect(cp.planState(proj, 0, gen, null, false).state).toBe("todo");
    expect(cp.planState(proj, 0, gen, { recast_by: [] }, true)).toMatchObject({ state: "stale" });
    sc.performance = { made_with: { actor: "dana", engine: "seedance", location: "loft" } };
    expect(cp.planState(proj, 0, gen, { performed_by: { actor: "dana", engine: "seedance" } }, true).state).toBe("ready");
    sc.performance.made_with.location = "office";
    expect(cp.planState(proj, 0, gen, { performed_by: { actor: "dana", engine: "seedance" } }, true)).toMatchObject({ state: "stale", why: expect.stringMatching(/another location/) });
    const rec = cp.resolvePlan(proj, 3, actors);
    expect(cp.planState(proj, 3, rec, { recast_by: [] }, false).state).toBe("todo");
    proj.storyboard.scenes[3].cast = "dana";
    expect(cp.planState(proj, 3, rec, { recast_by: ["dana"] }, true).state).toBe("ready");

    // Edits: checked, '' back to the default, null kept.
    expect(() => cp.cleanPlan({ actor: "nobody" }, actors, locs)).toThrow(/No cast actor "nobody"/);
    expect(() => cp.cleanPlan({ location: "attic" }, actors, locs)).toThrow(/No location "attic"/);
    expect(() => cp.cleanPlan({ how: "dance" }, actors, locs)).toThrow(/how must be/);
    expect(() => cp.writePlan({ how: "recast" }, cp.cleanPlan({ engine: "seedance" }, actors, locs))).toThrow(/Seedance cannot recast/);
    expect(cp.writePlan({ actor: "dana", location: "loft" }, cp.cleanPlan({ location: "" }, actors, locs))).toEqual({ actor: "dana" });
    expect(cp.writePlan(undefined, cp.cleanPlan({ location: "none" }, actors, locs))).toEqual({ location: null });
    expect(cp.writePlan({ actor: "dana" }, cp.cleanPlan({ how: "record" }, actors, locs))).toEqual({ actor: null, how: "record" });
    expect(cp.writePlan({ engine: "kling" }, cp.cleanPlan({ engine: "" }, actors, locs))).toBeUndefined();
  });

  it("a plan edit makes nothing; a perform with no actor or location uses the plan; choosing in a perform writes the plan; a changed plan reads stale", async () => {
    process.env.ATLASCLOUD_API_KEY = "ak"; process.env.OPENAI_API_KEY = "ok"; process.env.ELEVENLABS_API_KEY = "ek";
    const m = await media(path.join(DATA, "_media_plan"));
    const loc = await import("../src/core/locations.js");
    await fs.writeFile(path.join(DATA, T, "projects", P, "assets", "plate.png"), m.png);
    const plate = await loc.addLocation(T, { name: "Den", image: `/assets/${T}/projects/${P}/assets/plate.png`, clean: false });
    const atlas: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.includes("/text-to-speech/")) return new Response(m.mp3);
      if (u.endsWith("/images/edits")) return new Response(JSON.stringify({ data: [{ b64_json: m.png.toString("base64") }] }));
      if (u.endsWith("/generateVideo")) { atlas.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: `pl${atlas.length}` } })); }
      if (u.includes("/prediction/")) return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn/pl.mp4"], draft_id: "pld" } }));
      if (u === "https://cdn/pl.mp4") return new Response(m.mp4);
      throw new Error("unexpected fetch " + u);
    }));
    const sp = await import("../src/core/scene-performance.js");
    const takes: any[] = [];
    sp.registerSceneAttacher(async (_t, _p, url, si, extra) => { takes.push({ url, si, extra }); return { status: 200, body: {} }; });
    const { loadProject: lp, saveProject: svp } = await import("../src/persistence/project.js");
    // A fresh scene with nothing performed: clear scene 0's earlier state.
    const pr: any = await lp(T, P); delete pr.storyboard.scenes[0].performance; delete pr.storyboard.scenes[0].performer; await svp(pr);

    await expect(sp.editCastPlan(T, P, { cast_plan: { actor: "ghost" } })).rejects.toThrow(/No cast actor "ghost"/);
    await sp.editCastPlan(T, P, { cast_plan: { actor: "dana", how: "generate", location: plate.id } });
    expect(atlas).toHaveLength(0);                                   // nothing made
    let s0 = (await sp.getScenePerformances(T, P))[0];
    expect(s0.plan_line).toBe("Dana · Generate · Seedance · Den");
    expect(s0.plan).toMatchObject({ actor: "dana", how: "generate", engine: "seedance", location: plate.id });

    // Perform with nothing named: the plan's actor and location.
    await sp.startScenePerformance(T, P, 0, { voice_source: "script", force: true });
    await until(async () => (await sp.getScenePerformances(T, P))[0].performance?.status !== "running", 40000);
    s0 = (await sp.getScenePerformances(T, P))[0];
    expect(s0.performance.error).toBeUndefined();
    expect(s0.performance.location).toBe(plate.id);
    expect(s0.performance.made_with).toEqual({ actor: "dana", engine: "seedance", voice_id: "v_bella", location: plate.id });
    expect(atlas[0].reference_images[2]).toMatch(new RegExp(`${plate.id}\\.jpg$`));
    // A film-wide edit is written onto each scene: the film keeps no plan of its own.
    expect(s0.performer).toMatchObject({ actor: "dana", how: "generate", location: plate.id });
    expect(JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8")).storyboard.cast_plan).toBeUndefined();
    // (the attacher here is a stub, so the take is read from the scene's own record)

    // The film's location changes: the scene no longer matches -- stale, never remade by itself.
    const den2 = await loc.addLocation(T, { name: "Den two", image: `/assets/${T}/projects/${P}/assets/plate.png`, clean: false });
    await sp.editCastPlan(T, P, { cast_plan: { location: den2.id } });
    expect(atlas).toHaveLength(1);
    const pr2: any = await lp(T, P);
    const cp = await import("../src/core/cast-plan.js");
    const plan = cp.resolvePlan(pr2, 0, [{ id: "dana", name: "Dana" } as any]);
    expect(cp.planState(pr2, 0, plan, { performed_by: { actor: "dana", engine: "seedance" } }, false)).toMatchObject({ state: "stale" });

    // A scene's own plan: choosing a location in the perform writes it there.
    await sp.startScenePerformance(T, P, 0, { voice_source: "script", force: true, location: plate.id });
    await until(async () => (await sp.getScenePerformances(T, P))[0].performance?.status !== "running", 40000);
    s0 = (await sp.getScenePerformances(T, P))[0];
    expect(s0.performer).toMatchObject({ location: plate.id });
    expect(s0.plan_line).toBe("Dana · Generate · Seedance · Den");
    // null clears the scene's plan.
    await sp.editCastPlan(T, P, { scenes: [{ index: 0, performer: null }] });
    expect((await sp.getScenePerformances(T, P))[0].performer).toBeNull();
    await sp.editCastPlan(T, P, { cast_plan: null });
  }, 120000);
});

describe("a scene's state follows its own plan", () => {
  it("a scene performed reads ready; a changed plan reads stale; a draft finishes at 1080p from its id", async () => {
    process.env.ATLASCLOUD_API_KEY = "ak"; process.env.OPENAI_API_KEY = "ok"; process.env.ELEVENLABS_API_KEY = "ek";
    delete process.env.KLING_API_KEY; delete process.env.KLING_ACCESS_KEY;
    const m = await media(path.join(DATA, "_media_pp"));
    const P3 = "proj_pp";
    const pdir = path.join(DATA, T, "projects", P3);
    await fs.mkdir(path.join(pdir, "assets"), { recursive: true });
    await fs.writeFile(path.join(pdir, "assets", "rec.mp4"), m.mp4);
    const rec = (si: number) => ({ id: `tk${si}`, scene_index: si, source: `/assets/${T}/projects/${P3}/assets/rec.mp4`, created_at: "2026-10-04T00:00:00.000Z" });
    await fs.writeFile(path.join(pdir, "project.json"), JSON.stringify({
      project_id: P3, tenant_id: T, name: "PP", format: "video", status: "generated", canvas: { width: 1080, height: 1920, fps: 30 },
      created_at: "2026-10-04T00:00:00.000Z", updated_at: "2026-10-04T00:00:00.000Z", treatment: { filmGrammar: "speaker" },
      storyboard: { cast_plan: { actor: "dana", how: "generate" }, scenes: [
        { label: "Hook", voiceover_text: "One.", duration_seconds: 6, components: [] },
        { label: "Me", voiceover_text: "Two.", duration_seconds: 5, components: [], performer: { how: "record" } },
        { label: "Recast", voiceover_text: "Three.", duration_seconds: 5, components: [], performer: { how: "recast", engine: "kling" } },
      ] },
      scenes: [{ id: "a", duration_seconds: 9.2, components: [] }, { id: "b", duration_seconds: 5, components: [] }, { id: "c", duration_seconds: 5, components: [] }],
      takes: [rec(1), rec(2)],
      speaker_track: { clips: [{ scene_index: 1, source: rec(1).source }, { scene_index: 2, source: rec(2).source }] },
    }));
    const atlas: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.includes("/text-to-speech/")) return new Response(m.mp3);
      if (u.endsWith("/images/edits")) return new Response(JSON.stringify({ data: [{ b64_json: m.png.toString("base64") }] }));
      if (u.endsWith("/generateVideo")) { atlas.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: `pp${atlas.length}` } })); }
      if (u.includes("/prediction/")) return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn/pp.mp4"], draft_id: "ppd" } }));
      if (u === "https://cdn/pp.mp4") return new Response(m.mp4);
      throw new Error("unexpected fetch " + u);
    }));
    const sp = await import("../src/core/scene-performance.js");
    const { loadProject: lp, saveProject: svp } = await import("../src/persistence/project.js");
    // An attacher that does what index.ts does, enough for the state: the take and its clip.
    sp.registerSceneAttacher(async (tenant, project, url, si, extra) => {
      const pr: any = await lp(tenant, project);
      pr.takes = [...(pr.takes || []), { id: `perf${si}${pr.takes.length}`, scene_index: si, source: url, created_at: new Date().toISOString(), ...(extra.performed_by ? { performed_by: extra.performed_by } : {}) }];
      pr.speaker_track.clips = [...pr.speaker_track.clips.filter((c: any) => c.scene_index !== si), { scene_index: si, source: url }];
      await svp(pr);
      return { status: 200, body: {} };
    });
    let s0 = (await sp.getScenePerformances(T, P3)).map((r: any) => [r.scene_index, r.state]);
    expect(s0).toEqual([[0, "todo"], [1, "ready"], [2, "todo"]]);
    await sp.startScenePerformance(T, P3, 0, { quality: "draft" });
    await until(async () => (await sp.getScenePerformances(T, P3))[0].performance?.status === "done", 40000);
    let s = await sp.getScenePerformances(T, P3);
    expect(s[0]).toMatchObject({ state: "ready", plan_line: "Dana · Generate · Seedance" });
    expect(s[0].performer).toMatchObject({ actor: "dana", how: "generate" });   // the film's old plan, moved onto the scene on load

    // The plan for scene 1 becomes Dana generated: stale until performed. (The
    // save writes the moved plan: the file keeps no film-level one.)
    await sp.editCastPlan(T, P3, { scenes: [{ index: 1, performer: { actor: "dana", how: "generate" } }] });
    expect(JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P3, "project.json"), "utf8")).storyboard.cast_plan).toBeUndefined();
    s = await sp.getScenePerformances(T, P3);
    expect(s[1]).toMatchObject({ state: "stale", why: expect.stringMatching(/your recording plays/) });
    // ...and back to me: the recording is put back for free when it is not playing.
    await sp.editCastPlan(T, P3, { scenes: [{ index: 0, performer: { how: "record" } }] });
    expect((await sp.getScenePerformances(T, P3))[0]).toMatchObject({ state: "stale" });
    await sp.editCastPlan(T, P3, { scenes: [{ index: 0, performer: null }] });

    // The final: the draft's shot at 1080p, from its id.
    await sp.startScenePerformance(T, P3, 0, { quality: "final" });
    await until(async () => (await sp.getScenePerformances(T, P3))[0].performance?.status === "done" && !!(await sp.getScenePerformances(T, P3))[0].performance?.final, 40000);
    expect(atlas.at(-1)).toEqual({ model: "bytedance/seedance-2.5/draft-complete", draft_id: "ppd", watermark: false });
  }, 120000);
});

describe("HeyGen generates a scene: the look is the setting", () => {
  it("voices the line, HeyGen draws the person from the portrait, our voice laid under it, attached as the scene's take with no draft", async () => {
    process.env.HEYGEN_API_KEY = "hk"; process.env.ELEVENLABS_API_KEY = "ek"; process.env.ATLASCLOUD_API_KEY = "ak";
    const m = await media(path.join(DATA, "_media_hg"));
    const P3 = "proj_pp";
    const hey: any[] = [];
    let atlas = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.includes("/text-to-speech/")) return new Response(m.mp3);
      if (u.includes("api.atlascloud.ai")) { atlas++; throw new Error("no Seedance here"); }
      if (u.endsWith("/v3/assets")) { hey.push({ asset: true }); return new Response(JSON.stringify({ data: { asset_id: `a${hey.length}` } })); }
      if (u.endsWith("/v3/videos") && init?.method === "POST") { hey.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { video_id: "hv1" } })); }
      if (u.includes("/v3/videos/hv1")) return new Response(JSON.stringify({ data: { status: "completed", video_url: "https://cdn/hg.mp4" } }));
      if (u === "https://cdn/hg.mp4") return new Response(m.mp4);
      throw new Error("unexpected fetch " + u);
    }));
    const sp = await import("../src/core/scene-performance.js");
    await sp.editCastPlan(T, P3, { scenes: [{ index: 1, performer: { actor: "dana", how: "generate", engine: "heygen" } }] });
    // No engine named: the plan's (HeyGen).
    await sp.startScenePerformance(T, P3, 1, { voice_source: "script" });
    await until(async () => (await sp.getScenePerformances(T, P3))[1].performance?.status !== "running", 40000);
    const s1 = (await sp.getScenePerformances(T, P3))[1];
    expect(s1.performance.error).toBeUndefined();
    expect(atlas).toBe(0);
    const gen = hey.find((h) => h.audio_asset_id);
    expect(gen).toMatchObject({ type: "image", aspect_ratio: "9:16", resolution: "1080p" });
    expect(gen.motion_prompt).toMatch(/calm, grounded presenter/);
    expect(s1.performance.final.url).toMatch(/take-performed-dana-s2-final-heygen-.*\.mp4$/);
    expect(s1.performance.draft).toBeUndefined();
    expect(s1.performance.made_with).toEqual({ actor: "dana", engine: "heygen", voice_id: "v_bella" });
    expect(s1).toMatchObject({ state: "ready", plan_line: "Dana · Generate · HeyGen" });
  }, 90000);
});

describe("the voice heard is the voice sent, and the build voices the plan", () => {
  it("perform reuses the heard read (no second voice call); a changed delivery voices again; the build points the scratch read at the actor's voice", async () => {
    process.env.ATLASCLOUD_API_KEY = "ak"; process.env.OPENAI_API_KEY = "ok"; process.env.ELEVENLABS_API_KEY = "ek";
    const m = await media(path.join(DATA, "_media_vp"));
    const P4 = "proj_vp";
    const pdir = path.join(DATA, T, "projects", P4);
    await fs.mkdir(path.join(pdir, "assets"), { recursive: true });
    await fs.writeFile(path.join(pdir, "project.json"), JSON.stringify({
      project_id: P4, tenant_id: T, name: "VP", format: "video", status: "generated", canvas: { width: 1080, height: 1920, fps: 30 },
      created_at: "2026-10-05T00:00:00.000Z", updated_at: "2026-10-05T00:00:00.000Z", treatment: { filmGrammar: "creator-cut" },
      storyboard: { cast_plan: { actor: "dana", how: "generate" }, scenes: [
        { label: "A", voiceover_text: "One line.", duration_seconds: 4, components: [] },
        { label: "B", voiceover_text: "Two line.", duration_seconds: 4, components: [], performer: { actor: null, how: "record" } },
      ] },
      scenes: [{ id: "a", duration_seconds: 4, components: [] }, { id: "b", duration_seconds: 4, components: [] }],
      audio: { tracks: [{ id: "vo_scene_0", type: "voiceover", source: "/x/scratch0.mp3", start_time: 0 }, { id: "vo_scene_1", type: "voiceover", source: "/x/scratch1.mp3", start_time: 4 }] },
    }));
    const tts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.includes("/text-to-speech/")) { tts.push(JSON.parse(init.body).text); return new Response(m.mp3); }
      if (u.endsWith("/images/edits")) return new Response(JSON.stringify({ data: [{ b64_json: m.png.toString("base64") }] }));
      if (u.endsWith("/generateVideo")) return new Response(JSON.stringify({ data: { id: "vp1" } }));
      if (u.includes("/prediction/")) return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn/vp.mp4"], draft_id: "vpd" } }));
      if (u === "https://cdn/vp.mp4") return new Response(m.mp4);
      throw new Error("unexpected fetch " + u);
    }));
    const sp = await import("../src/core/scene-performance.js");
    sp.registerSceneAttacher(async () => ({ status: 200, body: {} }));

    // The build: scene 1 (Generate, Dana) voiced in Bella's voice; scene 2 (Me) left alone.
    expect(await sp.voicePlanScenes(T, P4)).toEqual([0]);
    expect(tts).toEqual(["One line."]);
    let pr = JSON.parse(await fs.readFile(path.join(pdir, "project.json"), "utf8"));
    const vp = pr.storyboard.scenes[0].performance.voice_preview;
    expect(vp).toMatchObject({ actor: "dana", source: "script", line: "One line." });
    expect(pr.audio.tracks[0]).toMatchObject({ voice_of: "dana" });
    expect(pr.audio.tracks[0].source).toMatch(/voice-preview-dana-s1-.*\.mp3$/);
    expect(pr.audio.tracks[1].source).toBe("/x/scratch1.mp3");
    // Again: already voiced, nothing new made.
    await sp.voicePlanScenes(T, P4);
    expect(tts).toHaveLength(1);

    // Perform: the heard read is sent, not a fresh one.
    await sp.startScenePerformance(T, P4, 0, { voice_source: "script", force: true });
    await until(async () => (await sp.getScenePerformances(T, P4))[0].performance?.status !== "running", 40000);
    expect((await sp.getScenePerformances(T, P4))[0].performance.error).toBeUndefined();
    expect(tts).toHaveLength(1);
    // A new delivery is a new read.
    await sp.startScenePerformance(T, P4, 0, { voice_source: "script", force: true, delivery: "[sighs] One line." });
    await until(async () => (await sp.getScenePerformances(T, P4))[0].performance?.status !== "running", 40000);
    expect(tts).toEqual(["One line.", "[sighs] One line."]);
  }, 90000);
});

describe("the voice picker", () => {
  it("hears the line in another voice without changing anything, and a scene made in the old voice reads stale once the actor's voice changes", async () => {
    process.env.ATLASCLOUD_API_KEY = "ak"; process.env.OPENAI_API_KEY = "ok"; process.env.ELEVENLABS_API_KEY = "ek";
    const m = await media(path.join(DATA, "_media_vpick"));
    const said: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const tts = u.match(/\/text-to-speech\/([^?]+)/);
      if (tts) { said.push(tts[1]); return new Response(m.mp3); }
      throw new Error("unexpected fetch " + u);
    }));
    const sp = await import("../src/core/scene-performance.js");
    const P4 = "proj_vp";
    const before = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P4, "project.json"), "utf8")).storyboard.scenes[0].performance;
    const r = await sp.previewSceneVoice(T, P4, 0, { voice_id: "abbyVoice1" });
    expect(said.at(-1)).toBe("abbyVoice1");
    expect(r.voice_id).toBe("abbyVoice1");
    expect(r.url).toMatch(/voice-preview-dana-s1-try-.*\.mp3$/);
    const after = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P4, "project.json"), "utf8")).storyboard.scenes[0].performance;
    expect(after.voice_preview).toEqual(before.voice_preview);       // only heard: nothing kept
    await expect(sp.previewSceneVoice(T, P4, 0, { voice_id: "../x" })).rejects.toThrow(/Not a voice id/);

    // Scene 1 was made in Bella's voice (made_with.voice_id): Dana now speaks as Abby -> stale.
    expect(after.made_with).toMatchObject({ voice_id: "v_bella" });
    // (its take on the film: performed by Dana -- the test attacher is a stub)
    const pj = path.join(DATA, T, "projects", P4, "project.json");
    const pr = JSON.parse(await fs.readFile(pj, "utf8"));
    pr.takes = [{ id: "tk0", scene_index: 0, source: after.draft.url, performed_by: { actor: "dana", engine: "seedance", quality: "draft" }, created_at: "2026-10-05T00:00:00.000Z" }];
    pr.speaker_track = { clips: [{ scene_index: 0, source: after.draft.url }] };
    await fs.writeFile(pj, JSON.stringify(pr));
    let s0 = (await sp.getScenePerformances(T, P4))[0];
    expect(s0.state).toBe("ready");
    const { updateActor } = await import("../src/core/cast.js");
    await updateActor(T, "dana", { voice_id: "abbyVoice1", voice_name: "Abby" });
    s0 = (await sp.getScenePerformances(T, P4))[0];
    expect(s0).toMatchObject({ state: "stale", why: "made in another voice" });
    await updateActor(T, "dana", { voice_id: "v_bella", voice_name: "Bella" });
    expect((await sp.getScenePerformances(T, P4))[0].state).toBe("ready");
  });
});

describe("the read speed", () => {
  it("speeds the voice up with its pitch kept, keeps it on the scene, and a heard read at another speed is not the one sent", async () => {
    process.env.ELEVENLABS_API_KEY = "ek";
    const m = await media(path.join(DATA, "_media_speed"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/text-to-speech/")) return new Response(m.mp3);
      throw new Error("unexpected fetch " + url);
    }));
    const sp = await import("../src/core/scene-performance.js");
    const P4 = "proj_vp";
    const slow = await sp.previewSceneVoice(T, P4, 1 - 1, { voice_speed: 1 });
    const fast = await sp.previewSceneVoice(T, P4, 0, { voice_speed: 1.2 });
    expect(fast.seconds).toBeLessThan(slow.seconds * 0.9);
    const perf = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P4, "project.json"), "utf8")).storyboard.scenes[0].performance;
    expect(perf.voice_speed).toBe(1.2);
    expect(perf.voice_preview.speed).toBe(1.2);
    expect(sp.voiceSpeedOf({ voice_speed: 3 } as any)).toBe(1.25);
    expect(sp.voiceSpeedOf({} as any)).toBe(1);
  });
});
