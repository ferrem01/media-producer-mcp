import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// A REAL PERSON PERFORMS FROM THEIR FOUNDATION (SPEC-real-person.md phase 2):
// no start frame is drawn -- Seedance gets the stills of their own recording
// (who they are), its reference video (how they move), the location's room,
// and the scene's voice; the prompt leads with the framing and dresses them
// in the scene's look. Changing the look makes the take stale.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-real-perf-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
process.env.MP_PUBLIC_URL = "https://mm.example";
process.env.MP_ACTOR_POLL_MS = "2";
const T = "t", P = "proj_real";

afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });
afterEach(() => { vi.unstubAllGlobals(); });

const until = async (fn: () => Promise<boolean>, ms = 30000) => {
  const t0 = Date.now();
  while (!(await fn())) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 25)); }
};
const clip = (out: string, seconds: number) => run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=s=640x360:r=24:d=${seconds}`,
  "-f", "lavfi", "-i", `sine=f=220:d=${seconds}`, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", out]);

async function seed() {
  const tdir = path.join(DATA, T);
  const pdir = path.join(tdir, "projects", P);
  await fs.mkdir(path.join(pdir, "assets"), { recursive: true });
  await fs.writeFile(path.join(pdir, "project.json"), JSON.stringify({
    project_id: P, tenant_id: T, name: "Real", format: "video", status: "generated", canvas: { width: 1920, height: 1080, fps: 30 },
    created_at: "2026-10-14T00:00:00.000Z", updated_at: "2026-10-14T00:00:00.000Z",
    treatment: { filmGrammar: "speaker" },
    storyboard: { scenes: [{ label: "Hook", purpose: "", template: "", voiceover_text: "Small teams can sound like big ones.", components: [] }] },
    scenes: [{ id: "s1", duration_seconds: 4, components: [] }],
  }));
  const { addActor } = await import("../src/core/cast.js");
  await addActor(T, { name: "Marc", real: true, consent: true, voice_id: "v_marc", voice_name: "Marc" });
}

describe("a real person performs a scene from their foundation", () => {
  it("needs the whole foundation, draws no frame, sends the stills, the room and the reference video, and wears the scene's look", async () => {
    await seed();
    process.env.ATLASCLOUD_API_KEY = "ak"; process.env.OPENAI_API_KEY = "ok"; process.env.ELEVENLABS_API_KEY = "ek";
    const media = path.join(DATA, "_m"); await fs.mkdir(media, { recursive: true });
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=180:duration=3", "-c:a", "libmp3lame", path.join(media, "v.mp3")]);
    await clip(path.join(media, "out.mp4"), 4);
    const mp3 = await fs.readFile(path.join(media, "v.mp3")), mp4 = await fs.readFile(path.join(media, "out.mp4"));
    const calls = { atlas: [] as any[], openai: 0 };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      if (u.startsWith("https://api.openai.com/")) { calls.openai++; throw new Error("no frame is drawn for a real person"); }
      if (u.startsWith("https://api.elevenlabs.io/v1/text-to-speech/v_marc")) return new Response(mp3);
      if (u === "https://api.atlascloud.ai/api/v1/model/generateVideo") { calls.atlas.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { id: `pred${calls.atlas.length}` } })); }
      if (u.startsWith("https://api.atlascloud.ai/api/v1/model/prediction/")) return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn/real.mp4"], draft_id: "d1" } }));
      if (u === "https://cdn/real.mp4") return new Response(mp4);
      throw new Error("unexpected fetch " + u);
    }));
    const sp = await import("../src/core/scene-performance.js");
    const { saveFoundationClip, setLooks } = await import("../src/core/actor-foundation.js");
    const attached: any[] = [];
    sp.registerSceneAttacher(async (_t, _p, url, si, extra) => { attached.push({ url, si, extra }); return { status: 200, body: { ok: true } }; });

    // A foundation half recorded is not one.
    await clip(path.join(media, "close.mp4"), 9);
    await saveFoundationClip(T, "marc", "close", path.join(media, "close.mp4"));
    await expect(sp.startScenePerformance(T, P, 0, { actor: "marc" })).rejects.toThrow(/foundation is not finished/);
    await clip(path.join(media, "turn.mp4"), 6);
    await saveFoundationClip(T, "marc", "turn", path.join(media, "turn.mp4"));
    await clip(path.join(media, "far.mp4"), 22);
    await saveFoundationClip(T, "marc", "far", path.join(media, "far.mp4"));

    // There is no start frame to draw or continue.
    await expect(sp.startSceneFrame(T, P, 0, { actor: "marc", shot: "x" })).rejects.toThrow(/real person, made from their foundation/);
    await expect(sp.continueSceneFrom(T, P, 0, { actor: "marc", from_scene: 1 })).rejects.toThrow(/real person/);

    // Looks: a scene picks one; one it does not have is refused before anything is spent.
    await setLooks(T, "marc", [{ name: "Founder", wardrobe: "a plain black overshirt over a dark t-shirt" }, { name: "Keynote", wardrobe: "a navy suit, white open-collar shirt" }], "founder");
    await expect(sp.startScenePerformance(T, P, 0, { actor: "marc", look: "tuxedo" })).rejects.toThrow(/no look "tuxedo"/);

    // A location: its room goes after the stills.
    const loc = path.join(DATA, T, "locations"); await fs.mkdir(loc, { recursive: true });
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=tan:s=1536x1024", "-frames:v", "1", path.join(loc, "taupe.jpg")]);
    await fs.writeFile(path.join(loc, "locations.json"), JSON.stringify([{ id: "taupe", name: "Taupe studio", image: "locations/taupe.jpg", made_from: "upload", created_at: "x" }]));

    await sp.startScenePerformance(T, P, 0, { actor: "marc", look: "keynote", location: "taupe", shot: "A medium-wide shot at a wooden desk, framed from the knees up", voice_source: "script" });
    await until(async () => (await sp.getScenePerformances(T, P))[0].performance?.status === "done" && attached.length === 1);
    expect(calls.openai).toBe(0);
    const sent = calls.atlas[0];
    expect(sent.model).toBe("bytedance/seedance-2.5/reference-to-video");
    expect(sent.reference_images).toHaveLength(4);                          // front, left, right, the room
    expect(sent.reference_images[0]).toMatch(/_perform\/.*marc-still-front\.jpg$/);
    expect(sent.reference_images[1]).toMatch(/marc-still-left\.jpg$/);
    expect(sent.reference_images[2]).toMatch(/marc-still-right\.jpg$/);
    expect(sent.reference_images[3]).toMatch(/taupe\.jpg$/);
    expect(sent.reference_videos).toHaveLength(1);
    expect(sent.reference_videos[0]).toMatch(/marc-foundation-ref\.mp4$/);
    expect(sent.prompt).toMatch(/^THE SHOT: A medium-wide shot at a wooden desk, framed from the knees up\. Frame it exactly as described/);
    expect(sent.prompt).toMatch(/@Image1, @Image2, @Image3 are real photographs of this person/);
    expect(sent.prompt).toMatch(/@Image4 is the room/);
    expect(sent.prompt).toMatch(/@Video1 is real footage .* Do NOT copy its room/);
    expect(sent.prompt).toMatch(/They are wearing a navy suit, white open-collar shirt\./);
    expect(sent.prompt).not.toMatch(/first frame|character sheet/);
    expect(sent).toMatchObject({ draft: true, ratio: "16:9" });

    let s0 = (await sp.getScenePerformances(T, P))[0];
    expect(s0.performance.frame).toBeUndefined();
    expect(s0.performance.made_with).toMatchObject({ actor: "marc", foundation: true, look: "keynote", location: "taupe" });
    expect(s0.plan.look).toBe("keynote");
    expect(s0.real_person).toMatchObject({ actor: "marc", stills: expect.arrayContaining(["front", "left", "right"]), look: "keynote" });
    expect(s0.defaults.frame_prompt).toBe("");
    expect(s0.defaults.video_prompt).toMatch(/navy suit/);

    // Another look is another take (judged against the take it plays).
    const { planState, resolvePlan } = await import("../src/core/cast-plan.js");
    const { loadProject } = await import("../src/persistence/project.js");
    const take = { performed_by: { actor: "marc", engine: "seedance" } };
    let proj: any = await loadProject(T, P);
    expect(planState(proj, 0, resolvePlan(proj, 0), take, false)).toEqual({ state: "ready" });
    await sp.editCastPlan(T, P, { scenes: [{ index: 0, performer: { look: "founder" } }] });
    proj = await loadProject(T, P);
    expect(planState(proj, 0, resolvePlan(proj, 0), take, false)).toMatchObject({ state: "stale", why: expect.stringMatching(/another look/) });
    // ...and its final is not finished from the old look's draft: it is made again, in the new look.
    await sp.startScenePerformance(T, P, 0, { actor: "marc", quality: "final" });
    await until(async () => (await sp.getScenePerformances(T, P))[0].performance?.status === "done" && attached.length === 2);
    expect(calls.atlas[1].model).toBe("bytedance/seedance-2.5/reference-to-video");
    expect(calls.atlas[1]).toMatchObject({ draft: false, resolution: "1080p" });
    expect(calls.atlas[1].prompt).toMatch(/They are wearing a plain black overshirt over a dark t-shirt\./);
  }, 120_000);
});

describe("looks", () => {
  it("are named wardrobes with a default, only for a real person", async () => {
    const { setLooks, resolveLook } = await import("../src/core/actor-foundation.js");
    const { addActor, getActor } = await import("../src/core/cast.js");
    await addActor(T, { name: "Ana", real: true, consent: true });
    let a = await setLooks(T, "ana", [{ name: "Founder", wardrobe: "black overshirt" }, { name: "Weekend", wardrobe: "grey sweater, jeans", glasses: true }]);
    expect(a.looks!.map((l) => l.id)).toEqual(["founder", "weekend"]);
    expect(a.default_look).toBe("founder");
    expect(resolveLook(a)!.id).toBe("founder");
    expect(resolveLook(a, "weekend")).toMatchObject({ wardrobe: "grey sweater, jeans", glasses: true });
    a = await setLooks(T, "ana", a.looks!, "weekend");
    expect(resolveLook(a)!.id).toBe("weekend");
    await expect(setLooks(T, "ana", [{ name: "", wardrobe: "x" }])).rejects.toThrow(/name and what they wear/);
    a = await setLooks(T, "ana", []);
    expect(a.looks).toBeUndefined(); expect(a.default_look).toBeUndefined();
    expect(resolveLook((await getActor(T, "ana"))!)).toBeUndefined();
  });
});
