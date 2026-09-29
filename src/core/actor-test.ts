/**
 * ACTOR TEST (an experiment, nothing in a film changes): one scene of the
 * speaker's take, performed by a synthetic actor.
 *
 * Marc: record anywhere -- "on the toilet" -- and still ship a professional
 * film, because performance transfer redraws the person, the hair, the light
 * and the room from a reference portrait while keeping HIS timing, gestures
 * and mouth. The test sends one scene's slice of the take to each provider
 * that has a key, converts the voice so a new face does not speak with his
 * voice (speech-to-speech keeps the delivery, so word anchors would hold),
 * and cuts a side-by-side to compare:
 *
 *   wan    -- Wan 2.2 Animate "replace" on fal (the engine under Higgsfield's
 *             Character Swap)                                 FAL_KEY
 *   runway -- Runway Act-Two (character_performance)          RUNWAYML_API_SECRET
 *   voice  -- ElevenLabs speech-to-speech, a stock voice      ELEVENLABS_API_KEY
 *
 * Inputs go as data URIs (a 5s 720p slice is ~2 MB; both providers accept
 * them). Files land in the project's output dir under actor-tests/<id>/,
 * reachable by URL like a render; status.json records every step.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { projectOutputDir } from "../persistence/paths.js";
import { loadProject } from "../persistence/project.js";
import { resolveVideoPath } from "./video-path.js";

const execFileAsync = promisify(execFile);

export type ActorProvider = "wan" | "runway";
type StepStatus = "running" | "done" | "failed" | "skipped";

export interface ActorTest {
  id: string;
  tenant_id: string;
  project_id: string;
  scene_index: number;
  image: string;
  providers: ActorProvider[];
  voice: boolean;
  voice_name?: string;
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at?: string;
  steps: Record<string, { status: StepStatus; error?: string; seconds?: number }>;
  /** name -> file in the test's folder (source, actor, wan, runway, voice, compare). */
  files: Record<string, string>;
  error?: string;
}

const KEYS: Record<ActorProvider, string> = { wan: "FAL_KEY", runway: "RUNWAYML_API_SECRET" };
const tests = new Map<string, ActorTest>();

export function isActorTestId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,32}$/.test(id);
}

export function actorTestDir(tenant: string, project: string, id: string): string {
  return path.join(projectOutputDir(tenant, project), "actor-tests", id);
}

async function save(t: ActorTest): Promise<void> {
  const dir = actorTestDir(t.tenant_id, t.project_id, t.id);
  await fs.writeFile(path.join(dir, "status.json"), JSON.stringify(t, null, 2));
}

export async function getActorTest(tenant: string, project: string, id: string): Promise<ActorTest | null> {
  if (!isActorTestId(id)) return null;
  const live = tests.get(id);
  if (live && live.tenant_id === tenant && live.project_id === project) return live;
  try {
    return JSON.parse(await fs.readFile(path.join(actorTestDir(tenant, project, id), "status.json"), "utf8")) as ActorTest;
  } catch {
    return null;
  }
}

async function ffmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", ...args], { maxBuffer: 20 * 1024 * 1024 });
}

async function dataUri(file: string, mime: string): Promise<string> {
  return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
}

async function okJson(r: Response, what: string): Promise<any> {
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* not json */ }
  if (!r.ok) throw new Error(`${what}: HTTP ${r.status} ${(j && (j.detail ? JSON.stringify(j.detail) : j.error || j.message)) || text.slice(0, 300)}`);
  return j;
}

async function download(url: string, file: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download: HTTP ${r.status}`);
  await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEADLINE_MS = 25 * 60 * 1000;
const POLL_MS = Number(process.env.MP_ACTOR_POLL_MS) || 5000;

/** Wan 2.2 Animate "replace" through fal's queue: submit, poll, fetch. */
async function runWan(src: string, img: string): Promise<string> {
  const headers = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  const sub = await okJson(await fetch("https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace", {
    method: "POST", headers,
    body: JSON.stringify({ video_url: src, image_url: img, resolution: "720p", video_quality: "high" }),
  }), "fal submit");
  const statusUrl: string = sub.status_url, responseUrl: string = sub.response_url;
  if (!statusUrl || !responseUrl) throw new Error("fal submit: no status_url in the reply");
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("fal: timed out");
    await sleep(POLL_MS);
    const st = await okJson(await fetch(statusUrl, { headers }), "fal status");
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`fal: ${st.status}`);
  }
  const res = await okJson(await fetch(responseUrl, { headers }), "fal result");
  const url = res?.video?.url;
  if (!url) throw new Error("fal result: no video url");
  return url;
}

/** Runway Act-Two: POST /v1/character_performance, poll /v1/tasks/{id}. */
async function runRunway(src: string, img: string, ratio: string): Promise<string> {
  const headers = {
    Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
    "X-Runway-Version": "2024-11-06",
    "Content-Type": "application/json",
  };
  const sub = await okJson(await fetch("https://api.dev.runwayml.com/v1/character_performance", {
    method: "POST", headers,
    body: JSON.stringify({
      model: "act_two",
      character: { type: "image", uri: img },
      reference: { type: "video", uri: src },
      ratio,
      bodyControl: true,
      expressionIntensity: 3,
    }),
  }), "runway submit");
  if (!sub?.id) throw new Error("runway submit: no task id");
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("runway: timed out");
    await sleep(POLL_MS);
    const task = await okJson(await fetch(`https://api.dev.runwayml.com/v1/tasks/${sub.id}`, { headers }), "runway task");
    if (task.status === "SUCCEEDED") {
      const url = Array.isArray(task.output) ? task.output[0] : null;
      if (!url) throw new Error("runway: no output url");
      return url;
    }
    if (task.status === "FAILED" || task.status === "CANCELLED") throw new Error(`runway: ${task.failure || task.failureCode || task.status}`);
  }
}

/** A stock ElevenLabs voice: the caller's pick, else a premade female voice. */
async function pickVoice(voiceId?: string): Promise<{ id: string; name: string }> {
  if (voiceId) return { id: voiceId, name: voiceId };
  const headers = { "xi-api-key": String(process.env.ELEVENLABS_API_KEY) };
  const j = await okJson(await fetch("https://api.elevenlabs.io/v1/voices", { headers }), "elevenlabs voices");
  const voices: any[] = j?.voices || [];
  const female = voices.filter((v) => v.category === "premade" && String(v.labels?.gender || "").toLowerCase() === "female");
  const prefer = ["Sarah", "Jessica", "Laura", "Alice", "Matilda"];
  const hit = prefer.map((n) => female.find((v) => String(v.name).startsWith(n))).find(Boolean) || female[0] || voices[0];
  if (!hit) throw new Error("elevenlabs: no voices on the account");
  return { id: hit.voice_id, name: hit.name };
}

/** ElevenLabs speech-to-speech: the delivery stays, the voice changes. */
async function convertVoice(wav: string, out: string, voiceId: string): Promise<void> {
  const form = new FormData();
  form.append("audio", new Blob([await fs.readFile(wav)], { type: "audio/wav" }), "take.wav");
  form.append("model_id", "eleven_multilingual_sts_v2");
  form.append("remove_background_noise", "true");
  const r = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": String(process.env.ELEVENLABS_API_KEY) }, body: form,
  });
  if (!r.ok) throw new Error(`elevenlabs speech-to-speech: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  await fs.writeFile(out, Buffer.from(await r.arrayBuffer()));
}

export async function startActorTest(opts: {
  tenant: string;
  project: string;
  scene_index: number;
  /** The actor's portrait, relative to the tenant's data dir (e.g. assets/generated/img_1.png). */
  image: string;
  providers?: ActorProvider[];
  voice?: boolean;
  voice_id?: string;
}): Promise<ActorTest> {
  const project = await loadProject(opts.tenant, opts.project);
  if (!project) throw new Error("Project not found");
  const clip = ((project as any).speaker_track?.clips || []).find((c: any) => c.scene_index === opts.scene_index);
  if (!clip) throw new Error(`Scene ${opts.scene_index + 1} has no speaker clip`);
  const tenantDir = path.resolve(config.dataDir, opts.tenant);
  const imgAbs = path.resolve(tenantDir, String(opts.image || "").replace(/^\/+/, ""));
  if (!imgAbs.startsWith(tenantDir + path.sep)) throw new Error("image must be a path inside the tenant");
  await fs.access(imgAbs).catch(() => { throw new Error(`image not found: ${opts.image}`); });
  const wanted = (opts.providers && opts.providers.length ? opts.providers : (["wan", "runway"] as ActorProvider[]))
    .filter((p) => p === "wan" || p === "runway");
  const providers = wanted.filter((p) => !!process.env[KEYS[p]]);
  if (!providers.length) throw new Error(`No provider key on the server (${wanted.map((p) => KEYS[p]).join(", ")})`);
  const voice = opts.voice !== false && !!process.env.ELEVENLABS_API_KEY;

  const test: ActorTest = {
    id: crypto.randomBytes(12).toString("base64url"),
    tenant_id: opts.tenant,
    project_id: opts.project,
    scene_index: opts.scene_index,
    image: opts.image,
    providers,
    voice,
    status: "running",
    started_at: new Date().toISOString(),
    steps: {},
    files: {},
  };
  for (const p of wanted) if (!providers.includes(p)) test.steps[p] = { status: "skipped", error: `${KEYS[p]} is not set` };
  if (!voice) test.steps.voice = { status: "skipped", error: opts.voice === false ? "not asked for" : "ELEVENLABS_API_KEY is not set" };
  await fs.mkdir(actorTestDir(opts.tenant, opts.project, test.id), { recursive: true });
  tests.set(test.id, test);
  await save(test);
  const clipAbs = resolveVideoPath(clip.source, config.dataDir);
  // The take is recorded at the film's frame, so the canvas says its shape.
  const frame: [number, number] = [Number((project as any).canvas?.width) || 1080, Number((project as any).canvas?.height) || 1920];
  void run(test, clipAbs, Number(clip.trim_start) || 0, clip.trim_end == null ? null : Number(clip.trim_end), imgAbs, frame, opts.voice_id)
    .catch(async (e) => { test.status = "failed"; test.error = e?.message || String(e); test.finished_at = new Date().toISOString(); await save(test).catch(() => {}); });
  return test;
}

async function step<T>(test: ActorTest, name: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now();
  test.steps[name] = { status: "running" };
  await save(test).catch(() => {});
  try {
    const out = await fn();
    test.steps[name] = { status: "done", seconds: Math.round((Date.now() - t0) / 100) / 10 };
    return out;
  } catch (e: any) {
    test.steps[name] = { status: "failed", error: e?.message || String(e), seconds: Math.round((Date.now() - t0) / 100) / 10 };
    return null;
  } finally {
    await save(test).catch(() => {});
  }
}

async function run(test: ActorTest, clipAbs: string, trimStart: number, trimEnd: number | null, imgAbs: string, frame: [number, number], voiceId?: string): Promise<void> {
  const dir = actorTestDir(test.tenant_id, test.project_id, test.id);
  const f = (name: string) => path.join(dir, name);

  // What every provider sees: the scene's slice of the take at 720 wide,
  // and the portrait as a modest JPEG (both well under the data-URI caps).
  await ffmpeg(["-ss", String(trimStart), ...(trimEnd != null ? ["-to", String(trimEnd)] : []), "-i", clipAbs,
    "-vf", "scale=720:-2", "-r", "30", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", f("source.mp4")]);
  test.files.source = "source.mp4";
  await ffmpeg(["-i", imgAbs, "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", f("actor.jpg")]);
  test.files.actor = "actor.jpg";
  const [w, h] = frame;
  const ratio = h > w * 1.1 ? "720:1280" : w > h * 1.1 ? "1280:720" : "960:960";
  const srcUri = await dataUri(f("source.mp4"), "video/mp4");
  const imgUri = await dataUri(f("actor.jpg"), "image/jpeg");
  await save(test);

  const voiceJob = test.voice
    ? step(test, "voice", async () => {
        await ffmpeg(["-i", f("source.mp4"), "-vn", "-ac", "1", "-ar", "44100", f("take.wav")]);
        const v = await pickVoice(voiceId);
        test.voice_name = v.name;
        await convertVoice(f("take.wav"), f("voice.mp3"), v.id);
        test.files.voice = "voice.mp3";
      })
    : Promise.resolve(null);
  const provJobs = test.providers.map((p) => step(test, p, async () => {
    const url = p === "wan" ? await runWan(srcUri, imgUri) : await runRunway(srcUri, imgUri, ratio);
    await download(url, f(`${p}-raw.mp4`));
    return p;
  }));
  await voiceJob;
  const done = (await Promise.all(provJobs)).filter(Boolean) as ActorProvider[];

  // Each result with sound: the converted voice when there is one, else
  // the take's own audio. The picture is re-encoded so every file streams.
  const audio = test.files.voice ? f("voice.mp3") : f("source.mp4");
  for (const p of done) {
    await ffmpeg(["-i", f(`${p}-raw.mp4`), "-i", audio, "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
      "-shortest", "-movflags", "+faststart", f(`${p}.mp4`)]);
    test.files[p] = `${p}.mp4`;
  }
  // Side by side, same height: you (the take), then each actor.
  if (done.length) {
    const ins = [f("source.mp4"), ...done.map((p) => f(`${p}.mp4`))];
    const scaled = ins.map((_, i) => `[${i}:v]scale=-2:960,setsar=1,fps=30[v${i}]`).join(";");
    const stack = `${ins.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${ins.length}[v]`;
    await ffmpeg([...ins.flatMap((x) => ["-i", x]), "-i", audio,
      "-filter_complex", `${scaled};${stack}`, "-map", "[v]", "-map", `${ins.length}:a:0`,
      "-c:v", "libx264", "-crf", "22", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
      "-shortest", "-movflags", "+faststart", f("compare.mp4")]);
    test.files.compare = "compare.mp4";
  }
  test.status = done.length ? "done" : "failed";
  if (!done.length) test.error = "No provider returned a video";
  test.finished_at = new Date().toISOString();
  await fs.rm(f("take.wav"), { force: true }).catch(() => {});
  await save(test);
}
