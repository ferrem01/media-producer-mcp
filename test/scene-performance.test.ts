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
    await until(async () => (await sp.getScenePerformances(T, P))[1].actor_clip?.status === "done");
    expect(atlas[0]).toMatchObject({ draft: false, resolution: "720p", duration: 6 });
    expect(atlas[0].reference_audios).toBeUndefined();
    expect(atlas[0].prompt).toMatch(/no music, no speech/);
    const proj = JSON.parse(await fs.readFile(path.join(DATA, T, "projects", P, "project.json"), "utf8"));
    const comp = proj.scenes[1].components.find((c: any) => c.data?.actor_clip === "dana");
    expect(comp).toMatchObject({ type: "video", enter: { effect: "cut", at: 1.5 }, exit: { effect: "cut", at: 7.5 }, data: { object_fit: "cover" } });
    const clipFile = path.join(DATA, comp.data.src.replace(/^\/assets\//, ""));
    const info = await run("ffmpeg", ["-hide_banner", "-i", clipFile]).then(() => "", (e: any) => String(e.stderr));
    expect(info).not.toMatch(/Audio:/);                        // silent: the scene's voice plays under it
    expect(proj.storyboard.scenes[1].components.filter((c: any) => c.data?.actor_clip)).toHaveLength(1);
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
