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

  it("refuses without a provider key, and an image outside the tenant", async () => {
    const { startActorTest } = await import("../src/core/actor-test.js");
    delete process.env.FAL_KEY; delete process.env.RUNWAYML_API_SECRET;
    await expect(startActorTest({ tenant: T, project: P, scene_index: 0, image: "assets/generated/actor.png" })).rejects.toThrow(/No provider key/);
    process.env.FAL_KEY = "fk";
    await expect(startActorTest({ tenant: T, project: P, scene_index: 0, image: "../../etc/passwd" })).rejects.toThrow(/inside the tenant/);
    await expect(startActorTest({ tenant: T, project: P, scene_index: 5, image: "assets/generated/actor.png" })).rejects.toThrow(/no speaker clip/);
  });
});
